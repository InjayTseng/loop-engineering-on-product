# 11 Eval: a baseline the next change is measured against

Every change to this loop — a value-critic prompt, a cheaper model, a Jev threshold — is a bet that it makes the loop better. This page is how to know. It is four steps; the first two are built.

| Step | What it measures | Status |
|---|---|---|
| 1. **Record and label** | what every call cost; what happened to every shipped change, from git | built |
| 2. **Seeded cases** | each gate's catch rate and false-alarm rate on cases whose answer is known in advance | built |
| 3. **Replay** | a changed gate (prompt, model) re-run on recorded decisions, at the commit where they were made | after enough labels |
| 4. **Whole-loop A/B** | two configurations from the same frozen product snapshot, ≥ 3 runs each | only for large changes |

Why not start with step 4: the loop changes the product every round, so two runs never face the same starting point; a night costs $50–200; and the north star moves days later, mixed with everything else. Each gate, by contrast, is a classifier whose inputs are already recorded — so it can be compared on fixed inputs.

## The three files

| File | Written by | One row per |
|---|---|---|
| `.loop/gates.jsonl` | `scripts/gate-log.sh`, every run | gate decision: the prompt, report, verdict, evidence, and the round's commit |
| `.loop/usage.jsonl` | `scripts/run-loop.sh`, every run | `claude -p` call: cost, duration, turns, tokens, cost per model. A call with no result (timeout, usage limit) has cost `null` — unknown, never 0 |
| `.loop/labels.jsonl` | `node scripts/eval/label-outcomes.mjs`, on demand | shipped commit: what happened to it next |

**Labels come from git, never from a model.** An LLM judging an LLM is circular (lesson 16); the human's own decisions are in the history:

| Label | Meaning |
|---|---|
| `merged` | in the live branch (an ancestor of it, or the same patch cherry-picked) |
| `merged-fixed` | merged, and within `FIX_DAYS` (7) a commit touching the same product files says fix/bug/… or is a `loop(maintenance)` round — a weak signal |
| `merged-reverted` / `reverted` | reverted after / before being merged |
| `skipped` | not merged, although a later loop commit was — passed over |
| `pending` | not reviewed yet; left out of every rate |

Bookkeeping every round touches (ledger, backlog, PRPs, briefs) is ignored when deciding whether two commits touch the same files.

## Running it

```bash
node scripts/eval/label-outcomes.mjs      # rewrite .loop/labels.jsonl (labels change: pending → merged)
node scripts/eval/baseline.mjs            # the scorecard; --json for machines
```

The scorecard puts output and quality side by side, because a loop maximizes whatever it is measured on (lesson 1) and an eval is no exception: counting ships alone rewards a looser gate.

```
outcomes   shipped, decided, pending · merge rate · escape rate (fixed soon / reverted)
value gate ACCEPT / REJECT · rejects per shipped round
validator  escape rate after a final PASS
cost       total · per round · per shipped · per merged · by kind (round / audit / traj / …) · by model
BASELINE: shipped=… decided=… merge_rate=… escape_rate=… usd_per_merged=…
```

## The first real baseline, and what it says about the eval

Run read-only on the first adopter's iOS repo (55 shipped commits): **39 decided, all 39 merged, 0 reverted, 0 fixed soon after**; 16 pending. Its backend repo: 17 shipped, all pending. The value gate made 75 decisions there (45 ACCEPT, 30 REJECT).

What that shows is the limit of git labels, not a perfect loop: the human merges the whole loop branch at once with a merge commit, so the merge rate is ~100% whatever the gates do, and a change to a gate would not move it. The only discriminating signal git gives is escapes (fixed soon, reverted), and with none so far it cannot rank anything yet. That is why step 2 — cases with known answers — comes before any comparison of gates.

Cost, from the three backend rounds whose transcripts survived: $1.98, $3.51 and $2.86 per round, with the orchestrator's model (Opus) about 96% of one round's cost and the Sonnet gates the rest. Usage is recorded from this version on, so `usd_per_merged` becomes available after the next run.

## Step 2: seeded cases

`scripts/eval/bench.mjs` runs the real gate agents on cases whose answer is fixed before any model sees them, and scores them. Each case gets a fresh throwaway git repo: a small bench product (`scripts/eval/bench/fixture` — "Tally", a one-page habit app with a positioning, an audited state, a ledger and a deterministic `BUILD_CMD`), and **this repo's** `.claude/agents`. Editing a gate's prompt therefore changes what is measured; the agent file's hash is stored on every row.

| Gate | Must be caught | Must pass |
|---|---|---|
| value-critic (22) | fabricated signals, duplicates of shipped work, non-goals, off-funnel polish (2 each); **hard:** an invented count inside a good idea, an unmeasured statistic, a shipped feature renamed (×2), a non-goal on the right stage (friends' streaks, a 3-step setup, coins), sharing without a button press | 3 ideas on the stage positioning says to push |
| validator (13) | a label that promises what its handler does not do, a claimed change that never appears, a broken funnel string, a syntax error; **hard:** two of three promised buttons, buttons placed in a section that is hidden by then, a label one word off its handler, the upgrade CTA moved into a hidden block, buttons that never go away | 3 correct implementations; **hard:** a correct one written unusually (rendered from JS, invisible to `check.mjs`'s control list) |

Every hard validator case passes `BUILD_CMD`, and so do two of the four basic failures — the validator has to read the evidence, not trust the exit code.

```bash
node scripts/eval/bench.mjs                      # all 35 cases once (~$0.65); --repeat 2+ for stability
node scripts/eval/bench.mjs --gate validator --model haiku --out .loop/bench/haiku.jsonl
node scripts/eval/bench.mjs --compare .loop/bench/base.jsonl .loop/bench/haiku.jsonl
```

```
value-critic  catch 100% of 24 · false alarms 0% of 9 · accuracy 100% · unparsed 0 · $0.63
              by class: good 9/9 · fabricated 6/6 · duplicate 6/6 · non-goal 6/6 · off-funnel 6/6
              borderline (in no rate): let through 2/9
validator     catch 100% of 12 · false alarms 0% of 9 · accuracy 100% · unparsed 0 · $0.51
unstable cases (different answers across repeats): v-border-empty-guide [REJECT,ACCEPT,ACCEPT]
BENCH: value_catch=1.00 value_false_alarm=0.00 validator_catch=1.00 validator_false_alarm=0.00 usd=1.14
```

That is the first baseline (framework `b10cbe8`, 3 repeats, $1.14). An unparsed answer counts as wrong. The gate runs isolated — no user settings, hooks, CLAUDE.md or MCP servers (`BENCH_ISOLATE=0` to opt out) — which also halved the cost per case: the first run, in a normal setup, spent tokens on the user's MCP tool list and its replies complained about servers needing auth.

**What building it taught.** The first draft had six "good" value-critic ideas; the gate rejected four of them, every time, and its reasons were right: they targeted stages other than the one positioning says to push. A second set — Enter-to-submit, autofocus, a hint in the empty state — was on the right stage, but the audited cause is *having no starting point*, and those only help someone who already knows what to type; whether that clears `impact>=4` is a judgment two reviewers would split on. Those three are kept as `expect: EITHER`: in no rate, but how many the gate lets through is reported, so a looser or stricter gate still shows. The rule this follows: a case's answer is changed only when the case was wrong by design, never to agree with the model.

**Hard cases, and the first question answered.** The 21 basic cases put both gates at the ceiling, so 14 hard ones were added. The Sonnet gates still got every one right (one reply in eight had no parseable `VERDICT:` line; the bench now keeps the whole reply when that happens) — which is only informative if the cases can separate anything. Run on Haiku, they do:

```
node scripts/eval/bench.mjs --compare sonnet.jsonl haiku.jsonl      # 35 cases × 2 each, e8e10ff
  value-critic catch_rate: 100% → 97% · false_alarm: 0% → 17%
  validator    catch_rate: 100% → 89% · false_alarm: 0% → 0%
  cases whose answer changed: v-hard-nongoal-wizard REJECT→split · val-hard-cta-buried FAIL→PASS · v-good-signup-habit ACCEPT→split
  cost: $1.27 → $2.37
```

Every miss but one is a hard case. And the cheaper model is not cheaper here: Haiku took about four times as long per case and cost 1.9× as much, because it took more turns. So "move the gates to Haiku to save money" is answered — no — before it ever ran overnight. n is small (2 repeats); read it as a strong hint, not a measurement.

**Second question: Jev in front of the value gate.** `--jev-prefilter <run.jsonl>` puts the real Jev (`JEV_MODE=prefilter`) in front of every value-critic row of an existing run — answer REJECT when Jev rejects, the LLM's otherwise, as in Step 2b — so the LLM gate need not run again:

```
node scripts/eval/bench.mjs --jev-prefilter sonnet.jsonl --out sonnet+jev.jsonl    # 44 rows, under a cent
  value-critic  catch 100% of 32 · false alarms 0% of 6 · borderline let through 1/6     (same as alone)
  jev alone: rejected 18/32 must-reject · 0/6 good · 0/6 borderline · unavailable 0/44
  LLM calls saved: 18/44 (41% of the value gate's cost) · Jev p50 0.4 s vs ~9 s for the gate
```

Jev never rejected a good or borderline idea, and every one of its rejects the LLM also rejected. It is sharp exactly where it should be — plain fabrication, duplicates (renamed ones too), listed non-goals, at p 0.87–0.97 — and steps aside (ESCALATE / PASS) on the subtle ones: an invented count inside a good idea 0/4, a non-goal on the right stage 2/8, off-funnel polish 0/4 (not its job). So prefilter is safe to turn on, and it removes a subagent call for the obvious bad ideas; the money is small, since the orchestrator is ~96% of a round. Twelve good-or-borderline calls is not proof that it never blocks a good idea: more good cases are the way to raise that confidence.

**What it cannot tell you yet.** The Sonnet gates are still at the ceiling, so the bench catches a regression but cannot show that a prompt change improves them. Harder cases go in `scripts/eval/bench/cases/*.jsonl`; a validator case is a list of find/replace `edits` on the fixture, each of which must match exactly once.

## Caveats

- `merged-fixed` is a heuristic: a follow-up commit may be an unrelated improvement to the same file.
- Labels need a reviewing human. A repo whose loop branch is never merged stays `pending`.
- Every rate prints its n; below 20, read it as a hint.
- The bench product is small and web-only. A gate that is perfect on it can still miss on an iOS app whose evidence is screenshots.

Next: back to [00-pipeline](00-pipeline.md)

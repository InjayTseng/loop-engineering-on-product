# 11 Eval: a baseline the next change is measured against

Every change to this loop — a value-critic prompt, a cheaper model, a Jev threshold — is a bet that it makes the loop better. This page is how to know. It is the first of four steps; only the first is built.

| Step | What it measures | Status |
|---|---|---|
| 1. **Record and label** | what every call cost; what happened to every shipped change, from git | built (this page) |
| 2. **Seeded cases** | each gate's catch rate and false-alarm rate on cases whose answer is known in advance | next |
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

## Caveats

- `merged-fixed` is a heuristic: a follow-up commit may be an unrelated improvement to the same file.
- Labels need a reviewing human. A repo whose loop branch is never merged stays `pending`.
- Every rate prints its n; below 20, read it as a hint.

Next: back to [00-pipeline](00-pipeline.md)

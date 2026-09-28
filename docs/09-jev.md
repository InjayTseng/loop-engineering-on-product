# 09 Jev pre-checks (optional): fast-reject in front of the LLM gates

> Status: N=0. This layer is wired up and tested (stub + mock) but has not yet been shown to be worth it on a real run. The default is `JEV_MODE="off"`; while it is off, the loop behaves exactly as if this page did not exist.

## Why

Every judgment in this graph lands on a gate, and a gate's output is already one typed result line (`VALUE:` / `VERDICT:` / `TRAJ:`). Some of those judgments need neither reading code nor writing text — only a yes/no or a pick:

- Does this idea rely on fabricated numbers? (lesson 5)
- Is it the same tactic as something already in the ledger?
- Is this ship the same tactic as the last few, only under a different category? (lesson 4)
- Does the button do what its label promises? (lesson 9)

[Jev](https://github.com/shitianfang/jev-use) (TypeSafe's judgment model) does only this kind of thing: it returns yes/no, pick, and score answers with probabilities, at about 230 ms p50 and about $0.02 per thousand calls. When it is unsure it returns `escalate`; when it cannot be reached it also returns `escalate` rather than throwing. In the 20 web-v2 rounds the value gate rejected 17 ideas, and each rejection cost a whole sonnet subagent.

## One non-negotiable rule: Jev can only reject, never approve

| Where | What Jev is asked | What Jev may do in prefilter mode | What Jev may not do |
|---|---|---|---|
| Before F (spec Step 2b) | `prefilter`: fabricated signals? a duplicate in the ledger? hits a non-goal / trust rule? | `JEV: REJECT` → treated as a value-gate REJECT: recorded in the ledger, counted in `rejects=N`, back to R | Approve. After a `PASS`, value-critic runs as usual and never sees Jev's result (it stays independent, lesson 3) |
| Inside V (validator 3b) | `label-promise`: does the observed behavior deliver what the label promises? | `JEV: MISMATCH` → axis 4 fails, listed as a blocker | Make axis 4 pass. Axis 4 still needs the validator's own evidence |
| R's pick (`/research`) | `pick`: which of 2–4 candidates most likely moves the "next stage"? | `JEV: PICK <key>` → write that one first | Let it skip value-critic |
| The driver, after every ship | `same-tactic`: is the newest commit the same tactic as the previous N? | `JEV: SAME` → run trajectory-monitor **early** this round | STOP or REDIRECT on its own. The decision is still trajectory-monitor's `TRAJ:` |
| In-round retry loops (spec Step 7b) | `same-failure`: is this build / validation failure the same root cause as the last, with no material change and nothing new? | `JEV: SAME_FAILURE` → this failure counts as two of the loop's 3 attempts | End the loop any other way, or skip Step 6 / 7. A material change or new evidence vetoes the flag |
| The driver, after a NOOP round | `noop-cause`: from the round's last real command outputs, is the cause the environment, the adapter, the implementation, the spec, or unclear? | `JEV: AUDIT_NOW` (environment / adapter, confidence ≥ `JEV_TRIGGER_CONF`, default 0.75) → run the state audit **this round** instead of at the next multiple of `AUDIT_EVERY` | Touch the NOOP counters or the `MAX_NOOP` stop. The audit decides whether the state is BROKEN |
| The driver, after a validator PASS | `claim-evidence`: does anything the validator actually ran (its tool outputs in `.loop/gates.jsonl`) show the PRP's CLAIM holding — or contradict it? | `JEV: UNSUPPORTED` / `CONTRADICTED` → a **fresh, independent re-validation**; the round counts as shipped only if that validator returns PASS | Fail a round by itself, or approve one. The verdict that decides is the new validator's `VERDICT:` |

Where Jev is not allowed: the driver's stop logic (it must stay deterministically testable with `test-driver.sh`, lesson 10), the final ACCEPT / PASS, and the positioning node P.

Why `claim-evidence` reads the record instead of asking the validator: judging a completion claim by its wording alone does not work — [jev-belay](https://github.com/valentynkit/jev-belay) measured AUROC 0.50 for a wording-only rule over 1,500 stops, against 0.976 once the run log was in the state. `gates.jsonl` holds the validator's actual tool calls and outputs, which the agent cannot rewrite. Two parts are decided in code before Jev is asked: a validator that never ran `BUILD_CMD` is `UNSUPPORTED` outright, and when no text shows the CLAIM but the validator did open a screenshot, the answer is `ESCALATE` (Jev cannot see images), never `UNSUPPORTED`.

Why the asymmetry: a false approval ships something bad — exactly v2's three escapes (the two "N people today…" counters and one "trending today"). A false rejection only loses one idea, and the ledger keeps a `Jev fast-reject: <reason>` line that both a human and the state-auditor can see. So Jev sits only on the rejecting side.

## A bug already fixed: the idea compared against itself

The first real use rejected `cf-billing` as a "duplicate" (p=0.94). The cause: `/research` (Step 1) and Step 2 both write the round's idea into the ledger as `[IN_PROGRESS]` first, and Step 2b's prefilter then asked Jev whether the idea duplicates anything in the whole ledger — and it found itself. Neither the offline eval nor the shadow comparison caught it: the eval replayed only the *earlier* ledger, without that line, which does not match the order of a real round.

The fix (`scripts/jev/ledger.mjs`): the prefilter never shows Jev `[IN_PROGRESS]` lines. Step 0 has already resolved any `[IN_PROGRESS]` left by a crash (resumed or marked FAILED), so by Step 2b the only `[IN_PROGRESS]` left is this round's own idea. Every other status (REJECTED / COMPLETED / FAILED / LOW_IMPACT) is kept, because those are the real duplicates. The eval now also puts the idea's own `[IN_PROGRESS]` line into the replayed ledger, as a real round has it. `npm test` has a regression test: the mock's answers are a hash of the state, so "identical answers with and without the self line" proves the line never reaches Jev.

The second time (`cf-cutover-runbook`, p=0.90): the project had added its own `[QUEUED]` status to the ledger and asked Jev *before* flipping the line to IN_PROGRESS, which the first fix (excluding only `[IN_PROGRESS]`) did not cover. The rule is now "is this line the idea itself?":
- Every `[IN_PROGRESS]` line is excluded.
- A line whose status is not COMPLETED / REJECTED / FAILED / LOW_IMPACT *and* that names this idea's title is also excluded, whatever the status is called (QUEUED, TODO, SPLIT…).
- A closed line with the same title is always kept: an idea rejected before and proposed again really is a duplicate.

The title is the text before the first ` — ` in `--idea`, or whatever `--title` specifies. Title matching is by whole token, so `cf-auth` does not exclude `cf-auth-hardening`.

Lesson: an offline eval has to reproduce **the inputs a real round has at that moment**, not just "the history as it was"; and projects add their own statuses, so the exclusion rule must not hard-code a status name.

## A common misuse: treating PASS as approval

`JEV: PASS` means "not confident enough to reject", **not** "go ahead". The correct routing:

| Jev result | Next step |
|---|---|
| `REJECT` | Treat it as a value-gate rejection |
| `PASS` / `ESCALATE` / `UNAVAILABLE` | **Always** hand it to value-critic |

Acting on a PASS directly means letting a model that only answers yes/no questions — and cannot see the code — approve things for you. Whatever it misses (such as v2's three fabricated numbers) ships straight away, which breaks the one rule on this page.

Slices a human has already approved (migrations, an agreed backlog) do not need Jev: it cannot change the decision and only adds a chance of a false reject. Jev exists to screen the ideas the loop comes up with itself.

## Three modes

```
off        → never called (default)
shadow     → called, written to .loop/jev.jsonl, prints `JEV: SHADOW — would=…`; nobody may route on this line
prefilter  → fast-rejects and triggers take effect (REJECT / SAME / MISMATCH / PICK / UNSUPPORTED / CONTRADICTED / SAME_FAILURE / AUDIT_NOW); every other result means "go through the LLM gate as usual"
```

`JEV_REJECT_P` (default 0.85): a result counts as a fast-reject only when P(yes) ≥ this value and Jev itself did not escalate. `MISMATCH` symmetrically requires P(delivers) ≤ 1 − this value.

## Rollout order (follow it; do not skip steps)

1. **Install:** `cd scripts/jev && npm ci`, then put `TYPESAFE_API_KEY` (or `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY`) in the environment the loop runs in — never in `loop.config.env`. Without a key every call returns `JEV: UNAVAILABLE` and the loop runs as usual.
2. **Offline eval:** `JEV_MODE=prefilter node scripts/jev/eval-backlog.mjs [a past run's backlog]`. It replays every idea in chronological order, giving Jev only the ledger as it was *at that time*, and compares against what actually happened:
   - rejected by value-critic → a fast-reject is correct (one value-critic call saved)
   - shipped but carrying a fabricated signal → a fast-reject catches an escape
   - any other ship → a fast-reject is a **false reject**
   Last line: `JEV_EVAL: SAFE` (0 false rejects), `UNSAFE`, `INCOMPLETE` (no key), or `MOCK` (the mock backend only checks the plumbing; its answers are hashes and do not count). The default data is `examples/web-v2-20-rounds/as-run/`: 45 COMPLETED entries (3 of them fabricated signals) and 18 REJECTED.
3. **One night in shadow:** `JEV_MODE=shadow`. The next day run `node scripts/jev/shadow-report.mjs`. For `claim-evidence` it lists every shadow flag as `TO LABEL` — open that round's validator record and decide by hand whether the CLAIM was really observed; in prefilter mode the re-validation's verdict labels each flag automatically (`JEV_CLAIM: … confirmed=… false_flags=…`). `same-failure` flags are labelled by the round's outcome — a round that still shipped proves a later attempt was worth making (`JEV_RETRY: … false_flags=…`) — and `noop-cause` triggers by the next state audit of the run (`JEV_NOOP: … confirmed=… contradicted=…`). For the prefilter, it pairs every shadow prefilter call with the value-critic verdict on the same idea (from `.loop/gates.jsonl`, which needs `jq` on the machine that ran the loop) and lists every **false reject** — an idea Jev would have rejected that value-critic accepted. Last line: `JEV_SHADOW: SAFE` (0 false rejects), `UNSAFE`, or `NO_DATA`. Without `gates.jsonl`, compare each `would=REJECT` in `.loop/jev.jsonl` with value-critic's verdict by hand.
4. **prefilter:** switch only when both steps 2 and 3 show no false rejects. After every night, read the `Jev fast-reject` lines in the ledger.

On the mock backend `eval-backlog.mjs` prints 20 false rejects (and a last line of `MOCK`, which never certifies SAFE). That is expected: it proves the eval really does block a judge that answers at random.

Agreement with value-critic in step 3 is not ground truth — value-critic can be wrong too. Step 2 compares against what actually happened; step 3 shows how the two judges differ on the same live inputs. Switch only when both are clean.

## Files

| File | Purpose |
|---|---|
| `scripts/jev/jev.mjs` | The four tasks (`prefilter` / `same-tactic` / `label-promise` / `pick`); always exits 0 and prints one `JEV:` line; every call is written to `.loop/jev.jsonl` — `UNAVAILABLE` (timeouts, marked `timeout: true`, missing package, backend errors) included, only `OFF` excepted — tagged with the driver's run and round |
| `scripts/jev/ledger.mjs` | The ledger the prefilter sees: this idea's own entries removed (`[IN_PROGRESS]`, plus any not-yet-closed status that names it) |
| `scripts/jev/eval-backlog.mjs` | Offline eval; last line `JEV_EVAL:` |
| `scripts/jev/shadow-report.mjs` | Pairs shadow prefilter calls with value-critic verdicts from `.loop/gates.jsonl` (last line `JEV_SHADOW:`), and scores `claim-evidence` flags against re-validations (`JEV_CLAIM:`), `same-failure` flags against round outcomes (`JEV_RETRY:`), and `noop-cause` triggers against the next audit (`JEV_NOOP:`); per-task availability — calls, unavailable, timeouts, median latency (`JEV_AVAIL:`) |
| `scripts/jev/test/jev.test.mjs` | `npm test`: pins every answer with `JEV_BACKEND=mock` + `JEV_MOCK_SCRIPT` and checks every routing rule, plus the shadow report's pairing |
| `scripts/test-driver.sh` scenarios 8–10, 16, 17 | The driver side: a prefilter SAME runs T early; shadow does nothing even on SAME; off never calls Jev; UNAVAILABLE does nothing; a prefilter UNSUPPORTED/CONTRADICTED re-validates and only that verdict decides; shadow never re-validates; a prefilter AUDIT_NOW after a NOOP runs the audit this round, and never after the MAX_NOOP stop has fired |
| `.claude/tasks/innovation_loop.md` Step 7b | The round agent's retry check (`same-failure`) in both fix loops |
| `loop.config.env` | `JEV_MODE`, `JEV_REJECT_P`; `JEV_TRIGGER_CONF` (environment variable, default 0.75) for `noop-cause` |

## Hypotheses to verify (come back and rewrite this section after a run)

- Savings: under prefilter, the share of all rejections that are fast-rejects before the value gate, and the time saved per round.
- Safety: whether false rejects on real runs are 0. A single false reject means going back to shadow or raising `JEV_REJECT_P`.
- Early detection: how often a trajectory check triggered early by `SAME` returns REDIRECT/STOP (close to 0 = noise; turn that check off).
- Availability: the `JEV_AVAIL` timeout share per night. Every UNAVAILABLE falls back to the LLM gate, so it costs nothing but the timeout (`JEV_TIMEOUT_MS`, 15 s) — but a check that times out often gives prefilter nothing to save, and its shadow agreement numbers are drawn from the calls that did answer.
- Retry check: of the `SAME_FAILURE` flags, how many were in rounds that still shipped. Any is a flag that would have cost a working attempt; several means go back to shadow or raise `JEV_REJECT_P`.
- NOOP cause: of the `AUDIT_NOW` triggers, how many audits came back BROKEN. Mostly HEALTHY = each trigger buys an expensive audit for nothing; turn it off. The cause labels are the weak axis in the ecosystem (TokenTrim: error-type F1 23.7), which is why only a high-confidence environment/adapter answer triggers anything.
- Claim evidence: of the `UNSUPPORTED` / `CONTRADICTED` flags, how many re-validations FAIL. Mostly PASS = the flag is noise that costs a validator run each time; go back to shadow. Also watch the `ESCALATE` share: web validators that only look at screenshots leave Jev nothing to read.

Next: back to [00-pipeline](00-pipeline.md)

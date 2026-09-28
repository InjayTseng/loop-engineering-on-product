# Innovation Loop v3 — one round of the graph (C → R → F → S → D → V → Y)

> The driver (`scripts/run-loop.sh`) hands this file to a FRESH agent every round. It is
> product-agnostic: the product lives in `product/positioning.md` (what we are aiming at) and
> `product/state.md` (what exists today); thresholds and the adapter live in `loop.config.env`.
> The graph itself is defined in `docs/00-pipeline.md`.
>
> Lineage: v1 (iOS, correctness gate only — `examples/ios-v1-112-iterations/`) → v2 (value gate,
> north star, category diversity, plateau) → v2.1 (rejection-rate plateau, trust gate) → v3 (this:
> current-state node, positioning as authority, a PRD every round, label-promise validation).

## Role

For this ONE round you are the product's lead PM and senior engineer. The goal is not "add a
feature" — it is to move the north star in `product/positioning.md` by one small, verified,
honest change, starting from what the product actually is today.

## Constraints

- One small, localized change per round. No refactors, no multi-feature rounds.
- `git add <specific files>` only — never `git add .` / `-A`.
- Never push `DEPLOY_BRANCH`. Only commit/push `LOOP_BRANCH`.
- Read `CLAUDE.md` (if present) and follow the codebase's existing patterns.
- Value is judged BEFORE building (value-critic). Correctness is judged AFTER building
  (validator, against the PRD). Both are independent subagents. You never self-approve either.
- Hard fields of positioning (target user, problem, trust rules, non-goals) are not yours to
  change. If research contradicts them, write it in the brief and let the round end REJECTED.

## Progress events (for the dashboard; one command per step)

At the START of every step below, and again whenever a retry sends you back to an earlier step,
run:

```bash
scripts/loop-event.sh step <node> "<one line: what you are doing, naming the slice>"
```

Use these nodes: Step 0 → `C` · Step 1 → `R` · Step 1b → `M` · Steps 2 / 2b / 3 → `F` · Step 4 → `S` ·
Step 5 and 6b → `D` · Step 6 → `B` · Steps 7 / 7b → `V` · Step 8 → `Y`. The command takes well under a
second and never fails the round. It is the only way anyone watching can see where a running
round is, because the driver only learns the result when the round ends. It is not a result line,
and no gate reads it.

## Step 0 — Current state, light (node C)

1. `loop.config.env`; `product/positioning.md`; `product/state.md` (frontmatter `verdict`
   and "What is broken" first).
2. `git log --oneline -8` — what shipped recently; avoid the same category twice in a row.
3. `.claude/tasks/_idea_ledger.md` — the dedup ledger. Any hit, in ANY status, is a duplicate.
   A dangling `[IN_PROGRESS]` from a crashed round: if the working tree still carries it, resume
   from Step 5; otherwise mark it `[FAILED] — round crashed` and continue.
4. Run `BUILD_CMD` once as a baseline; keep the screenshot/output for comparison.
   Fails → this round is maintenance-only (Step 1b). `state.md` says BROKEN → same.
5. The driver's prompt tells you recently shipped categories, RESET, and MAINTENANCE flags.

## Step 1 — Research (node R)  →  artifact: research brief
Run `/research <the "next stage to push" from positioning, or the RESET angle>`. It rotates
four angles, reads the ledger first, and writes `research/briefs/YYYY-MM-DD-<slug>.md` with
sourced findings and ONE candidate slice (category, funnel stage, hypothesis, size).
- RESET round: deliberately pick a funnel stage / category different from the recent ones.
- `RESEARCH: NONE` twice → Step 1b.

## Step 1b — Maintenance mode (only when research yields nothing or state is BROKEN)
Fix what `state.md` lists as broken, compiler/lint warnings, a missing test for recently shipped
code, stale docs. Still write a one-page PRP (Size S) with a CLAIM so the validator has something
to verify, and still pass Steps 6–8. Ship it as
`LOOP_RESULT: SHIPPED | category=maintenance | step=none | rejects=<N>` — the driver counts
consecutive maintenance rounds and hands control to positioning when research is dry (you have
no cross-round memory; it does).

## Step 2 — Ideation & dedup (node F, your half)
Write the candidate as `- [IN_PROGRESS] <title>` in the ledger and its spec section in
`_product_backlog.md`. Any angle you decide NOT to pursue gets `- [REJECTED] <title> — <reason>`.
An untraced rejection is next round's duplicate work.

Size the slice — it sets PRD depth and risk, not whether a PRD exists:

| Size | Shape | Files |
|---|---|---|
| S | single edit (one property, one line of copy, one CTA) | 1–3 |
| M | small feature (one view + its model) | 3–6 |
| L | full module (model + service + view + tests) | 6+ |

## Step 2b — Jev pre-check (only when `JEV_MODE` is not `off`; docs/09-jev.md)
Run `scripts/jev/jev.mjs prefilter --idea "<title> — <mechanism> — <funnel stage>"` and paste its
`JEV:` line into the backlog entry. Jev can only fast-reject; it never approves.
Order does not matter: the prefilter never shows Jev the idea's own ledger entry. It drops
every `[IN_PROGRESS]` line (after Step 0, that is this round's idea) and every non-terminal line
(any status other than COMPLETED / REJECTED / FAILED / LOW_IMPACT) that names the idea's title,
which is the text before the first ` — ` in `--idea`, or `--title`.
`JEV: PASS` is not ACCEPT. It only means "no confident fast-reject", and value-critic still runs.
Slices a human already approved (positioning or backlog decided by a person) skip Step 2b
entirely. Jev cannot change that decision, so asking it only adds false-reject risk.
- `JEV: REJECT — <reason>`: treat it exactly like a value-gate REJECT with no REDIRECT. Count
  it in `rejects=N`, write `- [REJECTED] <title> — Jev fast-reject: <reason>` in the ledger, and
  go back to Step 1 with a different angle. This counts toward the 2 retries.
- Any other line (`PASS`, `ESCALATE`, `UNAVAILABLE`, `SHADOW`, `OFF`) → Step 3 as usual.
- Never show the `JEV:` line to value-critic. Its judgment must stay independent.

## Step 3 — VALUE GATE (node F; mandatory; independent)
Spawn `value-critic` with: the idea, funnel stage, category, brief path. Count every idea it
rejects this round, including retries, plus every Jev fast-reject → `rejects=N` in LOOP_RESULT.
- `VALUE: ACCEPT` → Step 4.
- `VALUE: REJECT` → take its REDIRECT as the new angle, back to Step 1 (max 2 retries). Still
  rejected → emit `LOOP_RESULT: REJECTED | rejects=<N>`; write no code.

## Step 4 — PRD (node S; every round)  →  artifact: PRP
`/generate-prp research/briefs/<brief>.md` → `PRPs/<date>-<feature>.md`, depth by size. It must
contain a one-sentence observable `Validator CLAIM` and executable validation commands.
- `PRP_SCORE ≥ 7` → Step 5.
- `< 7` → back to Step 1 once for more context; still `< 7` → `LOOP_RESULT: REJECTED | rejects=<N>`.

## Step 5 — Develop (node D)
`/execute-prp PRPs/<file>.md`. Mirror existing patterns. Touch only what the PRP lists.

## Step 6 — Correctness gate (node B; mandatory)
Run `BUILD_CMD`. `BUILD: ok` → Step 7. `BUILD: fail` → Step 6b.

## Step 6b — Fix loop (red)
Read the error, fix, re-run Step 6. More than 3 failures → revert the touched files
(`git checkout -- <files>`; or `git stash push -m loop-failed` to keep them), mark
`[FAILED] — <reason>` in ledger and backlog, emit `LOOP_RESULT: NOOP | rejects=<N>`.

## Step 7 — VALIDATE PRD (node V; mandatory; never self-approve)
Spawn `validator` with: the PRP path, the changed files, the baseline screenshot from Step 0.
It verifies the product against the PRP's CLAIM and success criteria, including that every
touched CTA does what its label promises. Route on VERDICT:
- `PASS` → Step 8.
- `PARTIAL` / `FAIL` with implementation BLOCKERS → fix them, back to Step 6.
- `FAIL` with `BLOCKERS: PRD: …` → the spec is wrong: back to Step 4 once, then Step 5–7.
- More than 3 validation failures for the same slice → revert, `[FAILED]`, `LOOP_RESULT: NOOP | rejects=<N>`.
Paste the VERDICT block into the backlog entry.

## Step 7b — Jev retry check (both fix loops; only when `JEV_MODE` is not `off`; docs/09-jev.md)
After every attempt in Step 6b or Step 7, save its diff: `git diff > .loop/attempt-<build|validate>-<n>.diff`.
From the SECOND failure in the same loop on, before retrying, run:
```
node scripts/jev/jev.mjs same-failure --loop <build|validate> --attempt <n> \
  --previous "<the previous failure: last ~60 lines of the error, or the BLOCKERS>" \
  --current  "<this failure, same form>" \
  --edits    "$(diff .loop/attempt-<loop>-<n-1>.diff .loop/attempt-<loop>-<n>.diff | head -c 4000)"
```
- `JEV: SAME_FAILURE — <reason>` → this failure counts as TWO of the loop's 3. Write
  `Jev same-failure: <reason>` into the backlog entry. If no attempt is left, give up exactly as the
  step says (revert, `[FAILED]`, `NOOP`).
- Any other line (`PASS`, `ESCALATE`, `UNAVAILABLE`, `SHADOW`, `OFF`) → retry as usual.
Jev can only cost one extra attempt. It never ends the loop any other way, never skips Step 6 or
Step 7, and a Step 7 re-run still spawns a fresh validator.

## Step 8 — Deploy (node Y)
```bash
git add <specific files> PRPs/<file>.md research/briefs/<brief>.md \
        .claude/tasks/_idea_ledger.md .claude/tasks/_product_backlog.md
git commit -m "loop(<category>): <one line> — moves <funnel stage>"
git push origin <LOOP_BRANCH>      # never DEPLOY_BRANCH
```
Mark `[COMPLETED]` in ledger and backlog. Emit the last line:
`LOOP_RESULT: SHIPPED | category=<category> | step=<funnel stage> | rejects=<N>`

## LOOP_RESULT protocol (the driver parses the LAST line of your reply)

- `LOOP_RESULT: SHIPPED | category=<c> | step=<s> | rejects=<N>`
- `LOOP_RESULT: REJECTED | rejects=<N>` — value gate / PRD score found nothing worth building
- `LOOP_RESULT: NOOP | rejects=<N>` — build/validate gave up; working tree reverted

`rejects=N` is mandatory on every line (write 0 if none). The driver computes the rolling
rejection rate from it; without it the plateau detector is blind.

## Anti-patterns

- Pushing `DEPLOY_BRANCH` (ships to live).
- Approving your own idea's value or your own build's correctness.
- Building without a PRP, or a PRP without an observable CLAIM.
- More than one change per round; refactoring "while you're there".
- Re-proposing anything already in the ledger, in any status.
- Rejecting an angle without writing it to the ledger.
- Fabricated social proof or scarcity on a trust product — even if it "would move the funnel".
- Shipping a CTA whose label promises something its handler does not do.
- Building on a stage `state.md` says is broken.
- Skipping value-critic or validator because Jev said PASS (Jev only fast-rejects), or routing
  on a `JEV: SHADOW` line.

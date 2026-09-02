# Research → brief

## Angle / funnel stage: $ARGUMENTS

Produce ONE research brief that ends in ONE candidate slice. Research exists to feed the value
gate, not to be interesting — a brief with no candidate is a failed brief; write the LOW_IMPACT
line and stop.

## Before searching

1. Read `product/positioning.md` (north star, funnel, next stage to push, non-goals, trust rules)
   and `product/state.md` (what exists, what is broken — do not research a stage the product
   cannot serve today). `loop.config.env` mirrors the funnel/categories for scripts.
2. Read `.claude/tasks/_idea_ledger.md`. Anything already there (any status) is off the table.
3. Read `git log --oneline -15` for what shipped recently.

## Rotate the angle (pick the one least recently used; check `research/briefs/`)

- A. Competitors — what do the 2–3 closest products do at this funnel stage that we don't?
- B. User pain — reviews, forums, support threads: what do users say is missing or confusing here?
- C. Trends — what changed in the category in the last 12 months (platform features, norms)?
- D. Technical differentiation — what can we do here that competitors structurally cannot?

At most 2 WebSearch calls. If the second one yields nothing new, stop: append
`- [LOW_IMPACT] <angle> — <why>` to the ledger and report "no candidate".

## Write the brief

Use `research/TEMPLATE.md`. Save as `research/briefs/YYYY-MM-DD-<slug>.md`. Required sections:

- Question (one line) and angle (A–D)
- Findings — 3–6 bullets, each with a URL or a file path. No unsourced claims.
- Already covered — which ledger entries / shipped commits are adjacent, and why this differs
- Candidate slice — title, category, funnel stage, hypothesis ("if we X, stage Y converts more
  because Z"), size (S/M/L), the one localized change, honest-data check (no fabricated signals)
- Suggested claim for the validator — the exact observable thing that will be true when it ships

## Hand off

Append `- [IN_PROGRESS] <title>` to the ledger. Do NOT spawn `value-critic` here and do NOT write
product code: inside the loop, `innovation_loop.md` Step 3 spawns the value gate exactly once (it
needs the rejection count). Standalone use: run the gate yourself afterwards.

Final line, verbatim: `RESEARCH: CANDIDATE` (a brief with a candidate was written) or
`RESEARCH: NONE` (LOW_IMPACT recorded, nothing to hand off).

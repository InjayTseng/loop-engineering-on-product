# Position (node P)

## Mode: $ARGUMENTS
`interactive` (default, a human is present) or `autonomous` (no human; two senior agents).

Positioning is the slow node. Everything downstream — research angles, the value gate's
north star, the categories the driver rotates — is judged against `product/positioning.md`.
Hard fields (target user, problem, alternatives, why us, non-goals, trust rules) change only
here with a human. Soft fields (north star, funnel, category emphasis, next stage) may be
refined in autonomous mode, flagged for review.

## Interactive mode — converge with multi-round questions

Read first: `product/state.md` (latest audit), `product/positioning.md` (current), the last 5
files in `research/briefs/`, and the last 20 `[REJECTED]` lines in the idea ledger.

Then ask ONE question per round with `AskUserQuestion`, 2–4 options each, every option
derived from the evidence you just read (state gaps, rejection patterns, shipped categories) —
never generic. Rounds, in order; skip a round if the current value is clearly still right:

1. Target user — who exactly; offer the 2–3 users the product evidence suggests.
2. Problem and alternatives — what they do today instead; what "why us" is structurally true.
3. North star and funnel — propose the funnel from state.md's observed stages; ask which stage
   to push next and why.
4. Categories and emphasis — which of CATEGORIES to weight up / retire for the next run.
5. Non-goals and trust rules — what the loop must never build, even if it would move the funnel.
6. Summary — show the full proposed positioning.md; ask APPROVE / revise (loop back to the round
   they name).

On APPROVE: write `product/positioning.md` (bump `version`, `approved_by: human`,
`approved_on`, append a change-log line), and mirror FUNNEL / CATEGORIES / NORTH_STAR into
`loop.config.env`. Final line: `POSITION: APPROVED`.

## Autonomous mode — two senior agents must agree

1. Spawn `strategist` with the evidence list above. Take its DIAGNOSIS + PROPOSAL.
2. Spawn `positioning-critic` with the proposal verbatim. It reads the evidence itself.
3. `POSITION: AGREED` → apply the proposal (with the critic's AMENDMENT, if any) to the SOFT
   fields only; set `approved_by: agents`, `pending_human_review: true`, bump `version`, append a
   change-log line quoting both agents' one-line reasons; mirror soft fields into `loop.config.env`.
4. `POSITION: DISAGREE` → change nothing. Leave both outputs in the round log (the driver keeps it as
   `.loop/position-NNN.log`) for the human.

Final line, verbatim: `POSITION: AGREED` or `POSITION: DISAGREE`. Never `APPROVED` — that word
is reserved for a human.

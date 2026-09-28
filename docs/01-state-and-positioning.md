# Nodes C and P: look at the current state, then choose the direction

Every round starts from "what the product looks like today", not from the previous round's memory. The direction (positioning) is the one slow node that either needs a human present or two senior agents arguing until they agree. These two nodes anchor the whole graph.

## C — Current state (`product/state.md`)

Two depths:

| Depth | When | Who | What | Artifact |
|---|---|---|---|---|
| Light | Step 0 of every round | the round agent | Read config / positioning / state; `git log -8`; check the ledger for `[IN_PROGRESS]`; run `BUILD_CMD` once as a baseline | a baseline screenshot / output (for the validator to compare against) |
| Deep | At the start of every run, every `AUDIT_EVERY` rounds, and after an autonomous positioning change | `state-auditor` (independent subagent) | Inspect the repo and the running product from scratch: what exists, what is broken, the gap vs positioning, tech debt, measurable numbers | Rewrites `product/state.md`; last line `AUDIT: HEALTHY \| GAPS \| BROKEN` |

Rules:

- `state.md` is rewritten, never appended. It is the one-page current-state view: anyone who opens it knows where the product stands.
- If a number cannot be measured, write `none`. Do not estimate.
- The driver catches `BROKEN`: the next round's prompt carries a MAINTENANCE flag and that round fixes without adding (Step 1b). It still needs a Size S PRP and a CLAIM so the validator has something to check.
- A dangling `[IN_PROGRESS]` in the ledger is the checkpoint of a round that crashed. If the working tree still has its changes, resume from Step 5; if not, mark it `[FAILED] — round crashed`. This is how the loop is resumable.

Why C exists: the v1 loop started every round from its own backlog. On the iOS health app, the backlog grew to 140K late in the run and drifted from what the repo actually contained; the agent trusted its notes more than the code. C pins the source of truth to the repo and the running product.

## P — Positioning (`product/positioning.md`)

One file, two kinds of field:

| Fields | Content | Who can change them |
|---|---|---|
| Hard | Target user, problem, alternatives, why us, non-goals, trust rules | Only a human (`/position`, interactive mode) |
| Soft | North star, funnel, category weights, the next stage to push | A human; or `strategist` + `positioning-critic` when both senior agents agree (flagged `pending_human_review: true`) |

Every downstream judgment is made against this file: `/research` only researches the stages it names, `value-critic` scores with its funnel and non-goals, `trajectory-monitor` judges drift against it. Changing it swaps the objective function of the whole loop, which is why it is the slow node.

### Interactive mode: converge through multi-round questions

`/position` first reads `state.md`, the 5 most recent briefs and the 20 most recent `[REJECTED]` ledger entries, then asks one question per round, each with 2–4 options derived from that evidence (AskUserQuestion): target user → problem and alternatives → north star and funnel → category weights → non-goals and trust rules → confirm a summary. Questions whose current value is clearly still right are skipped. On APPROVE it writes the file, bumps `version`, sets `approved_by: human`, and mirrors the funnel and categories into `loop.config.env` for the scripts. Last line: `POSITION: APPROVED`.

Options must come from evidence. "Retention was rejected 5 times in a row because the product has no external re-entry trigger; retire retention for now and push share instead?" is a good option. "A. Focus on retention  B. Focus on growth" is not.

### Autonomous mode: two capable agents argue until they agree

On a value plateau or a trajectory STOP, if `AUTONOMOUS_POSITIONING=true`:

1. `strategist` (senior model) reads the state, the rejection pattern in the ledger, and the last 20 commits; diagnoses why ideas ran dry; proposes exactly one soft-field delta.
2. `positioning-critic` (same tier, independent context) re-reads the evidence itself and looks only for counter-evidence: does the evidence hold up, is a hard field being changed on the sly, can the product serve that stage today, is it the same tactic under a new label, does the proposal state what would prove it wrong.
3. Written only on `POSITION: AGREED`. On `DISAGREE` nothing changes; both outputs stay in `.loop/position-NNN.log` for a human and the driver stops to wait.

At most `MAX_AUTO_POSITIONING` times per run. The safeguard for when neither agent is smart enough is to change nothing: a wrong positioning wastes 20 rounds, waiting for a human wastes one night.

## How the two nodes plug into the loop

```
run start ─▶ C(deep) ─▶ [rounds: C(light) → R → F → S → D → V → Y] ─every K─▶ C(deep)
                                          ▲                                    │
                                          │                          value STOP / TRAJ STOP
                                          │                                    ▼
                                          └──── AGREED ◀── P(autonomous) ── or ── park, wait for /position
```

Next: [02-research](02-research.md)

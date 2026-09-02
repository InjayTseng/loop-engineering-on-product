---
approved_by: human            # human | agents
approved_on: YYYY-MM-DD
pending_human_review: false   # true when `agents` changed the soft fields overnight
version: 1
---

# Positioning — <product>

> Hard fields (target user, problem, trust rules) change only with a human in the loop
> (`/position`). Soft fields (funnel emphasis, category weights, next stage to push) may be
> refined overnight by the strategist + positioning-critic pair, and are marked for review.

## Hard fields (human only)

- Target user: <who, in one line — the person, not the segment label>
- Problem: <what they are trying to do and what gets in the way today>
- Alternatives: <what they use instead of us, including "nothing">
- Why us: <the one structural reason we win at this problem>
- Non-goals: <what we deliberately will not build, even if users ask>
- Trust rules: <what is never acceptable — e.g. fabricated counts, dark patterns, sending private data>

## Soft fields (agents may refine; flagged for review)

- North star: <the funnel or single metric the loop moves>
- Funnel: <stage1> → <stage2> → <stage3> → … (must match FUNNEL in loop.config.env)
- Categories and current emphasis: <e.g. activation ×2, monetization ×1, retention ×1>
- Next stage to push: <one stage, with the reason from product/state.md>

## Change log

- YYYY-MM-DD v1 — initial, approved by human via /position

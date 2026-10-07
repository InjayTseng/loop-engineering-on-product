# Current state — Tally (audited 2026-09-30)

- Single-file web app (index.html). Landing → email signup → "Today" list → add habit → check in → streak. Plans section with "Upgrade to Pro" (Free: 3 habits).
- Works: signup, add habit (capped at 3 on Free; the 4th opens checkout), check-in, streak counter, upgrade CTA.
- Gap vs positioning: after signup the Today screen shows only "No habits yet." and an empty text field — no suggestion, no example. Funnel data: 61% of new accounts never add a habit.
- Shipped already: streak counter on the Today screen; an 8 pm reminder email for anyone who has not checked in.
- Numbers: activation_done → habit_added 39%; habit_added → core_value 71%; share: none (no share feature exists); pay: 1.4% of accounts.
- Tech debt: none blocking. BUILD_CMD = node check.mjs.

AUDIT: GAPS — no help on the empty Today screen; no share feature.

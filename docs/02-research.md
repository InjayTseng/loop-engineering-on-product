# Nodes R and F: research exists only to feed the value gate

The output of research is not "interesting findings". It is one candidate slice that `value-critic` can score. A brief with no candidate is a failed brief: log one LOW_IMPACT line and stop, do not force one.

## R — `/research <stage or angle>`

Read three things first: `product/positioning.md` (which stage to research), `product/state.md` (can the product serve that stage today? a broken stage is not researched), and `_idea_ledger.md` (nothing already seen is proposed again).

Four angles, in rotation (check which one `research/briefs/` used most recently):

| Angle | Question | Sources |
|---|---|---|
| A Competitors | What do the 2–3 closest products do at this stage that we do not? | product pages, changelogs, App Store screenshots |
| B User pain | What do users say is missing or confusing at this stage? | reviews, forums, support threads |
| C Trends | What changed in this category over the last 12 months (platform features, new norms)? | platform release notes, industry writing |
| D Technical edge | What can we do at this stage that competitors structurally cannot? | our own code and data |

At most 2 web searches. If the second one finds nothing new, stop: add `- [LOW_IMPACT] <angle> — <reason>` to the ledger and end with `RESEARCH: NONE`.

Briefs use `research/TEMPLATE.md` and are saved as `research/briefs/YYYY-MM-DD-<slug>.md`. Required: the question and angle; 3–6 findings with a URL or file path each; "already covered" (which ledger entries / commits are adjacent and how this one differs); the candidate slice (title / category / stage / hypothesis "if we do X, stage Y improves because Z" / size / one localized change / an honest-data check); and one CLAIM for the validator. Last line: `RESEARCH: CANDIDATE`.

RESET rounds (flagged by the driver): deliberately pick a different stage and category from the last few rounds and think from scratch.

## F — `value-critic` (independent subagent)

It answers one question: is this idea worth building this round? The default is REJECT. The bar is "this plausibly moves the north star", not "this is a fine idea".

Three axes, 1–5 each:

- **FUNNEL IMPACT** — does it plausibly move a stage the positioning names? Extra credit if it is the positioning's "next stage to push". Anything in the non-goals is an outright REJECT.
- **NOVELTY** — is the mechanism materially different from what already shipped? The same tactic under a new label is not novel.
- **EFFORT-FIT** — can it ship as one small, localized change?

**Trust gate** (hard; overrides impact): with `TRUST_PRODUCT=true`, any idea that relies on fabricated signals is REJECTed — a hash-seeded "N people did this today", fake popularity, invented testimonials, manufactured scarcity. Real data (from a server or localStorage) is fine. This rule was added after the v2 run: the loop shipped two hash-seeded social-proof counters and the value gate let them through.

The `ACCEPT` condition is `ACCEPT_IF` in `loop.config.env` (default `impact>=4 AND novelty>=3 AND effort_fit>=3`). A REJECT always carries a REDIRECT: a sharper, honest, funnel-moving angle that the round agent takes back to R (≤2 times).

Output protocol:

```
VALUE: ACCEPT | REJECT
CATEGORY / FUNNEL_STEP / SCORES: impact=? novelty=? effort_fit=?
WHY / REDIRECT
```

## Ledger and backlog: two files, two jobs

| File | Content | How it is read |
|---|---|---|
| `_idea_ledger.md` | One line per idea, five statuses: COMPLETED / IN_PROGRESS / FAILED / REJECTED / LOW_IMPACT | For dedup; read in full every round (it is small) |
| `_product_backlog.md` | Full specs of ideas that passed the value gate + the validator's verdict | Only the `[IN_PROGRESS]` section is read; never the whole file |

The dedup set is everything ever seen. Before v2, rejected ideas left no trace and were re-evaluated every round. After REJECTED / LOW_IMPACT were added, dedup on the iOS health app went from reading a 140K backlog to reading a 12K ledger.

What a real rejection looks like (web-v2 run, translated; the original is in `examples/web-v2-20-rounds/as-run/_backlog.md`):

> `[REJECTED] retention | core_value→activation_done (next day) | "Tomorrow's forecast" teaser: value-critic found no actual re-engagement mechanism (the information disappears once the user leaves the page), impact=2, rejected. REDIRECT → virality/acquisition.`

Next: [03-prd](03-prd.md)

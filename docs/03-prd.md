# Node S: a PRD every round

In this repo a PRD is called a PRP (Product Requirement Prompt): a spec written for an agent to get it right in one pass, with executable validation. There is one every round; size only sets the depth.

## Why it cannot be skipped

Node V checks that *the product delivers what the PRD promised*. Without a PRD the validator can only degrade to "it runs", which is exactly how v2 let through "a button labeled 'draw a fortune' that only scrolls". The one observable `Validator CLAIM` in the PRD is the input to node V; producing that sentence is the first reason node S exists.

## Depth follows size

| Size | Shape | PRP content |
|---|---|---|
| S | a single edit (one attribute, one line of copy, one CTA) | One page: Source, Goal/Why/What, Success Criteria, Validator CLAIM, Validation Loop (Levels 1 + 4) |
| M | a small feature (one view + its model) | The above + an Implementation Blueprint task list + gotchas |
| L | a full module (model + service + view + tests) | The full template: desired tree, per-task pseudocode, integration points, all four levels |

## `/generate-prp <brief>`

The input is a brief (it already carries the candidate slice, hypothesis, and value-critic scores). Flow:

1. **Codebase analysis** — similar features and patterns, files to reference, conventions to follow, test patterns validation should mirror.
2. **External research** — only what the brief lacks; cite specific URLs and sections.
3. **Write the PRP** (`PRPs/templates/prp_base.md`): Source (size, positioning version and stage, brief path, CLAIM), Goal/Why/What, All Needed Context (URLs, real code snippets, gotchas), Implementation Blueprint (pseudocode, ordered tasks, error handling), Validation Loop (Level 1 lint → 2 unit → 3 integration → 4 product gate: `BUILD_CMD` + the independent validator).

Save as `PRPs/<YYYY-MM-DD>-<feature>.md` and self-score 1–10 for confidence in a one-pass implementation:

- `PRP_SCORE ≥ 7` → go to D
- `< 7` → back to R once for more context; still `< 7` → the round ends `REJECTED`. A low-scoring PRP must not turn into a weak implementation.

## How to write the one CLAIM

Observable, singular, falsifiable.

- Good: "At the end of chapter five in the destiny-report modal, a 'Go straight to chapter six, the in-depth reading →' button appears; clicking it scrolls to `.paywall-sec` and fires `pay(entry=ch5_bridge)`."
- Bad: "Improve paid conversion." "A better user experience."

The validator treats the CLAIM as a hypothesis to falsify. If the CLAIM itself is unobservable, it returns `BLOCKERS: PRD: …` and the loop routes back to S, not to D.

## The four core principles of a PRP (kept from the original template)

1. **Context is King** — include every document, example, and gotcha needed.
2. **Validation Loops** — give the agent executable checks it can run and fix against.
3. **Information Dense** — use this codebase's keywords and patterns.
4. **Progressive Success** — start simple, validate, then add.

`PRPs/EXAMPLE_multi_agent_prp.md` is a complete Size L example (a Pydantic AI multi-agent system); use it for format.

Next: [04-dev-and-validate](04-dev-and-validate.md)

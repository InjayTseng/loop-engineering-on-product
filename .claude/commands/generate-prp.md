# Generate PRP (spec)

## Input: $ARGUMENTS
Either a research brief (`research/briefs/*.md`, preferred — it already carries the candidate
slice, hypothesis, and value-critic verdict) or a feature description file.

Generate a PRP (Product Requirement Prompt — this repo's PRD format) so that a fresh agent can
implement the feature in ONE pass and an independent validator can verify it against the PRP.
Every round writes a PRP; the slice's size sets the DEPTH, never whether one exists:

| Size | PRP depth |
|---|---|
| S | one page: Source, Goal/Why/What, Success Criteria, Validator CLAIM, Validation Loop (levels 1 + 4) |
| M | above + Implementation Blueprint task list + gotchas |
| L | full template, including desired tree, per-task pseudocode, integration points, all levels |
 The implementing agent only
gets the context you put in the PRP plus its training data. Assume it has the codebase and web
search; include or link every finding you relied on.

## Research process

1. Codebase analysis — similar features and patterns, files to reference, conventions to follow,
   the test pattern to mirror for validation.
2. External research — library docs (specific URLs and sections), implementation examples,
   known pitfalls. Reuse the brief's findings; do not redo them.
3. User clarification (only if genuinely blocked) — which pattern to mirror, integration points.

## PRP generation

Use `PRPs/templates/prp_base.md`. Must include:

- Goal / Why / What — copied and sharpened from the brief; keep the funnel stage and hypothesis.
- All needed context — URLs with sections, real code snippets from this codebase, gotchas.
- Implementation blueprint — pseudocode, ordered task list, error-handling strategy.
- Validation gates — EXECUTABLE commands (lint, unit, integration, and the adapter's `BUILD_CMD`
  from `loop.config.env`). The final gate is the independent `validator` subagent with the exact
  CLAIM; write that claim into the PRP.

*** After research and before writing: ULTRATHINK about the plan, then write the PRP. ***

## Output

Save as `PRPs/<YYYY-MM-DD>-<feature-name>.md`. Link back to the brief and `product/positioning.md`.

## Quality checklist

- [ ] All necessary context included, sourced
- [ ] Validation gates executable by an agent
- [ ] References existing patterns by file path
- [ ] Clear ordered implementation path
- [ ] Error handling documented
- [ ] Validator CLAIM stated in one observable sentence

Score the PRP 1–10: confidence of one-pass implementation success. Below 7 → go back to the
brief for more context (once); still below 7 → the round ends as REJECTED, not as a weak build.

Final line, verbatim: `PRP_SCORE: <n>`

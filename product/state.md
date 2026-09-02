---
audited_on: YYYY-MM-DD
audited_by: state-auditor     # state-auditor | round-agent (light)
verdict: HEALTHY              # HEALTHY | GAPS | BROKEN
head: <git sha>
---

# Current state — <product>

> Rewritten on every deep audit. Never appended. Facts only, each with how it was observed.

## What exists (user-facing)
- <feature / screen> — observed via <screenshot path / command>

## What is broken or degraded
- <symptom> — evidence <command output / error> — severity <blocks funnel | cosmetic>

## Gap vs positioning
- <positioning claim> vs <what the product actually does today>

## Technical debt that constrains the next slices
- <debt> — <which kind of change it makes risky>

## Numbers we can actually measure
- <metric> = <value> (source: <GA4 / test count / build time / none>)

## Recent trajectory (last 10 commits, one line each)
- <sha> <category> <stage> — <what>

# Contrast example: an iOS asset-tracking app, 112 rounds (framework v1)

This is the loop before v2: the same PRP skeleton (`/generate-prp` → `/execute-prp`), a maintenance round every 3 rounds, the builder marking its own work COMPLETED, and `git push origin main`. The app name is anonymized as `________`. It is here to show what a loop without a value gate looks like — not as a template.

> **Language:** the as-run specs in this folder contain some Chinese from the original project and are kept verbatim as the record.

## What is here

- `innovation_loop_v1_as_run.md` — the earliest loop (its title says 8 steps; it actually lists research → ideation → PRP → execute → test → fix → deploy → restart)
- `innovation_loop_v2_as_run.md` — the same loop customized for this app: a Morandi design system, SnapshotTesting, maintenance mode when `Iteration_Count % 3 == 0`, and the Rule of Pairs (every ViewModel gets a test file)
- `iteration_log.md` — the per-round log (date, mode, task, summary, files changed): 111 rounds completed, round 112 PENDING; round 76 appears twice and is kept as-is
- `product_backlog.md` — the phased feature backlog

## What to look at

1. **High output, direction set by the backlog.** Feature mode takes a `[TODO]` from the backlog and researches only when the backlog is empty. No step ever asks "is this worth doing?" — correctness (`./scripts/test.sh` exits 0) is the only gate.
2. **Maintenance mode is the only diversity mechanism.** Every 3 rounds it forces tests / refactoring / bug fixes. That kept quality from collapsing, but not the feature direction from homogenizing.
3. **Self-approval.** The same agent runs the tests in step 6, decides they passed, and marks its own work `[DONE]` in step 9. There is no independent validator.
4. **Pushes straight to main.** No branch isolation.

In a separate 35-round overnight run on an iOS health app, these gaps became a measurable failure: 31 rounds appended the same kind of metric. v2's four fixes — value gate, north star, category diversity, plateau — came from that; see `docs/06-lessons.md`.

## Worth keeping

- Writing `Iteration_Count` into the log (externalized state)
- The Rule of Pairs and Snapshot First (carried into Level 2 of v3's PRP Validation Loop)
- Maintenance every 3 rounds (v3's Step 1b is its conditional form: only when research runs dry or the state is BROKEN)

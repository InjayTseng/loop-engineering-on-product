# Audit current state (node C, deep)

Spawn the `state-auditor` subagent to inspect this repository and the running product from
scratch, and REWRITE `product/state.md`. Optional focus: $ARGUMENTS.

Report its `AUDIT:` line and the "Gap vs positioning" section verbatim. If the verdict is
BROKEN, say so first — the next loop round must be maintenance-only. If the ledger has a
dangling `[IN_PROGRESS]` entry, say which and whether the working tree still carries it.

This is what `scripts/run-loop.sh` runs at the start of every run and every AUDIT_EVERY rounds.

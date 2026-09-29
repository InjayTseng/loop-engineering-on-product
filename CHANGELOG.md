# Changelog

Newest first. Commit ids link a change to its tests and its reasoning. Updating an adopted repo: `scripts/loop-kit.sh update <repo>` (see [docs/08-adopt.md](docs/08-adopt.md#updating-later)).

## 2026-09-29 — hardened by the first live adoption

The framework ran on its first external product — an iOS app and its backend, one framework in two repos. Each item below was found by a live run and fixed the same day, with a test that fails on the old code ([lessons 11–17](docs/06-lessons.md#lessons-from-the-first-live-adoption-v3)).

**Packaging**
- `scripts/loop-kit.sh install | update | status` — install the framework into a product repo and update it later. A lock file records what was installed: unchanged files are updated, files you changed are never overwritten (the new version waits as `.kit-new`), executable bits are restored, your own files are never touched, new config keys are listed. Tested by `scripts/test-kit.sh` in CI.

**Driver**
- A Claude usage/session limit is never counted as a NOOP. It stops with its own reason, or waits and re-runs the same call (`LIMIT_WAIT`, `LIMIT_MAX_WAIT`). `80bb83d`
- Gate agents started with `run_in_background` are recorded from their task notification; the spec and round prompt require foreground gates. Before: validated ships counted as NOOPs and stopped a run. `ec26966`
- A trajectory `REDIRECT` passes its whole line to the next round ("go here") instead of the generic RESET note ("not here"). `74db75a`
- A timed-out round is labelled by how far it got — `timeout mid-fix`, `timeout before validation` — in `loop.log` and the dashboard. `1fc315f`

**Evidence and checks**
- iOS adapter: `IOS_TEST=1` runs the tests and writes one line per test to `/tmp/loop-tests.txt`; `--list-tests <xcresult>` for custom adapters. The validator must show the test that covers the CLAIM, not a total. `3f12806`
- Jev `claim-evidence` accepts `BUILD_CMD` by its script, not its output path, or any command in `CHECK_CMDS`. `3f12806`

**Jev data integrity**
- Every `jev.mjs` outcome is logged, `UNAVAILABLE` and timeouts included; `shadow-report` shows per-task availability and latency. `30a6b28`
- The Jev test suite writes to a temp log, never the real `.loop/jev.jsonl`; `shadow-report` counts only rows from real loop runs. `c8a8a18`

**Tests**
- `test-driver.sh` brings its own config, so an adopter's `loop.config.env` cannot leak into the scenarios. `2054581`
- The dashboard test skips the web-v2 replay when `examples/` is absent (as in every adopting repo). `80bb83d`

## 2026-09-28 — records, cross-checks, Jev checkpoints

- **Gate records**: every gate's full report, verdict and evidence to `.loop/gates.jsonl`, across runs. `df7eb61`
- **The driver trusts the records over the round's self-report**: under-reported rejects are corrected, a SHIPPED round without a validator PASS is a NOOP; protected paths park the run; timeouts kill the whole process group; the pre-push hook is required. `02a3140` `390381e` (gate agent names configurable, only the loop's own scripts protected)
- **Jev checkpoints**: `claim-evidence` (a fresh validator re-validates a PASS its own evidence does not back) `ef936c4`; `same-failure` (spec Step 7b) and `noop-cause` (early audit) `7559578`; shadow calls paired with value-critic verdicts `7010a5a`.
- **CI**: driver, dashboard and Jev tests plus shellcheck on every push and PR. `f213159`
- **Security**: `@claude` limited to repo members; dashboard Host allow-list. `8cdaec3`
- **Docs in English**, README rewritten as the entry point, dashboard in English. `ccebdcf` `1a7d485`

## 2026-09-27 — Jev pre-checks and the dashboard

- Optional Jev pre-checks in front of the LLM gates — `prefilter`, `label-promise`, `pick`, `same-tactic` — that can only reject or trigger, never approve; `off → shadow → prefilter` with an offline eval. `307f408`, self-match fixes `c59fdf9` `2fb8f4e`
- A local, read-only developer dashboard. `8da738c` `dc208b5`

## v3 — the nine-node perpetual graph

The baseline: current state (C), positioning (P) with two modes, research, value gate, a PRD every round, develop, correctness gate, validation against the PRD, ship to an isolated branch; a deterministic driver with a rejection-rate plateau; two real runs in `examples/`. `ff830c1`

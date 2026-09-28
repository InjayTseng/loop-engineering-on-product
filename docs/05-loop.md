# The outer loop: driver, stopping, cadence, cost

`scripts/run-loop.sh` is the only deterministic control flow in the whole graph. It does not reason. It parses the one result line each node prints, then decides the next round's flags, whether to stop, and who takes over when it does.

## The shape of one run

```
gate 0   on LOOP_BRANCH? if not, REFUSE
C deep   state-auditor rewrites product/state.md (BROKEN → next round is MAINTENANCE)
for round in 1..N:
  a fresh `claude -p` runs one iteration of innovation_loop.md
    (the prompt carries: the last 4 categories, RESET, MAINTENANCE)
  parse LOOP_RESULT → SHIPPED / REJECTED / NOOP, and rejects=N
  update: category sequence, consecutive REJECTED, consecutive NOOP, rolling window
  record every gate decision → .loop/gates.jsonl        (with jq)
  JEV_MODE≠off and shipped → Jev claim-evidence check   (optional; prefilter UNSUPPORTED → fresh re-validation decides)
  JEV_MODE≠off and NOOP    → Jev noop-cause check        (optional; prefilter AUDIT_NOW → state audit this round)
  JEV_MODE≠off and shipped → Jev same-tactic check      (optional; prefilter SAME → run T early)
  plateau? (see below)
  every AUDIT_EVERY rounds → C deep; every TRAJ_EVERY rounds → T (REDIRECT → next round is told where to go; STOP → stop)
  value STOP → P: AUTONOMOUS_POSITIONING and under quota → strategist+critic; AGREED → reset counters, C deep, continue
                                                           otherwise → park (.loop/state = WAITING_FOR_P), exit and wait
```

Fresh context every round: a broken round does not contaminate the next, context does not grow with rounds, and after a crash the loop resumes from the ledger's `[IN_PROGRESS]`.

## Stop conditions (all numbers; no agent gets to decide)

| Condition | Signal | Meaning | Goes to |
|---|---|---|---|
| Plateau (rejection rate) | Over a rolling `WINDOW` of rounds, `PLATEAU_REJ×rejects ≥ PLATEAU_SHIP×ships` (default 2/3 ≈ 0.6) | The value gate rejects more than 1.5 ideas per idea shipped — this direction is exhausted | P |
| Hard exhaustion | A RESET round is also fully REJECTED (`MAX_CONSEC_REJECTED`) | A new angle found nothing either | P |
| Research exhaustion | `MAX_CONSEC_MAINT` rounds in a row ship only `category=maintenance` | Nothing new to do | P |
| Trajectory STOP | trajectory-monitor returns STOP | The loop is optimizing something other than the north star | P |
| Structural failure | `MAX_NOOP` rounds in a row fail build/validate | The adapter or the product is broken — not a value problem | exit; fix the tooling |
| Cap | `ROUNDS` or budget | One night's worth | exit |

**The v2 → v2.1 fix.** v2's plateau only fired on "2 fully REJECTED rounds in a row". In the 20-round web-v2 run the value gate rejected 17 ideas inside rounds (0–2 per round; retries always found one that passed), and a fully REJECTED round never happened — so the plateau never fired. v2.1 reads the rolling rejection rate from `rejects=N` instead. That is why every `LOOP_RESULT` line must carry `rejects=`, 0 included.

**Test the driver with a stub.** `scripts/run-loop.sh` consumes only the result lines `CLAUDE_BIN` prints, so a fake `claude` that prints one scripted line per call can run full scenarios (plateau fires, a RESET round is rejected again, autonomous positioning AGREES and the run continues, BROKEN forces maintenance, the main branch is refused). That is how the v2.1 plateau was found to be unable to fire at all (lesson 10). `bash scripts/test-driver.sh` runs 15 such scenarios; CI (`.github/workflows/test.yml`) runs them with the dashboard and Jev tests and shellcheck.

**RESET and REDIRECT are different instructions.** A round fully rejected by the value gate makes the next round a RESET: "not here — pick a different stage and category". A trajectory `REDIRECT` names where to go instead, so the driver passes the monitor's whole `TRAJ:` line into the next round's prompt as a REDIRECT ROUND. It steers one round; later rounds follow the gates again. (Found on a live run: the generic reset note let a round pick "something different" and skip the stage the monitor had named.)

**Stop = hand to P, not "done".** A high rejection rate means the low-hanging fruit under this positioning is picked, not that there is nothing left to do. Autonomous mode lets two senior agents try another soft-field angle; if that fails, the loop waits for a human.

## Cadence

| Loop | Scale | Measured |
|---|---|---|
| D ⇄ B ⇄ V | minutes | — |
| One round | 10–20 min | web-v2 test site: 20 rounds in 4h10m, 12.5 min/round on average (sonnet) |
| T | every 5 rounds | 4 checks, all CONTINUE |
| P | on STOP | — |
| Human | hours–weeks | a human review the next day caught the label-promise bug |

## Model and cost routing

| Role | Default | Why |
|---|---|---|
| Per-round orchestrator + builder | sonnet | bulk codegen, cheap |
| value-critic / validator / trajectory / state-auditor | sonnet (pinned in agent frontmatter) | judgment + reading screenshots; sonnet is enough |
| strategist / positioning-critic | opus (pinned in agent frontmatter) | one decision steers the next 20 rounds |

An overnight loop plus subagents can cost $50–200 a night. The cost levers, in order: effort (mostly medium), keeping the builder on sonnet, the `ROUNDS` cap. Move the per-round orchestrator to opus (about 2×) only when you need stronger ideation.

## Run it

```bash
git checkout loop                       # never run on main
# fill in loop.config.env: north star, funnel, categories, DEPLOY_BRANCH, BUILD_CMD
scripts/install-hooks.sh                # pre-push hook: refuses the live branch at the git level
/audit                                  # look at the current state first (optional; the driver does it too)
/position                               # converge the positioning if a human is around
/loop-once                              # run one round interactively; watch both gates behave
scripts/run-loop.sh 20                  # overnight
tail -f .loop/loop.log
kill $(cat .loop/run.pid)               # stop
```

The driver runs `claude -p` with `--dangerously-skip-permissions`, which bypasses permission checks — so the allowlist in `settings.local.json` does not constrain a headless round. That is acceptable only because of branch isolation — the branch is re-checked every round, the driver refuses to start unless the `pre-push` hook is installed, only the loop branch is pushed — so anything broken on the loop branch cannot reach live.

The hook is a local backstop, not a boundary: an agent with a shell can run `git push --no-verify`. The authoritative control is on the remote — a branch protection rule or ruleset on `DEPLOY_BRANCH` that requires a reviewed PR and blocks direct and force pushes. Set it up before the first overnight run.

**What a round cannot do to its own judges.** Before and after each round the driver fingerprints `PROTECTED_PATHS` (default: `.claude/agents`, `.claude/commands`, `LOOP_SPEC`, `.github`, `loop.config.env`, `POSITIONING`, and the loop's own scripts — `run-loop.sh`, `gate-log.sh`, `loop-event.sh`, `install-hooks.sh`, `test-driver.sh`, `adapters/`, `jev/`, `dashboard/`). The rest of `scripts/` is left alone, because the product this loop is copied into may keep its own code there. Setting `PROTECTED_PATHS` replaces the default, so list everything you want guarded. If the round changed any of them — committed or not — the run stops and parks for a human: a round must not edit value-critic's criteria, the harness, or the objective it is judged against. Positioning soft fields are still re-aimed by autonomous node P, which runs outside a round.

**Timeouts.** Each `claude -p` runs in its own process group; on `ROUND_TIMEOUT` (and when a call ends) the whole group is terminated, so subagents, browsers, simulators, and dev servers it started do not outlive it.

## Gate records: `.loop/gates.jsonl`

The driver parses one line per node (`VALUE:`, `VERDICT:`, `TRAJ:` …). Before this, each gate's scores, reasoning, and whatever it checked were thrown away after the run; the two real runs in `examples/` retain only 6 verdict lines between them.

With `jq` installed, every `claude -p` runs with `--output-format stream-json` and the full transcript is kept as `.loop/round-NNN.jsonl` (the driver still rebuilds `round-NNN.log` from the transcript's final `result` and parses that). `scripts/gate-log.sh` appends one record to `.loop/gates.jsonl` for **every subagent hand-back** in the transcript:

| Field | Content |
|---|---|
| `agent` · `kind` · `round` · `run` | who judged, at which node (round / audit / traj / position), which round, which run |
| `prompt` | what the orchestrator handed the gate (the idea being judged, the CLAIM) |
| `report` · `verdict` | the gate's full reply, and the verdict parsed by the driver's own rule; `null` when the line is malformed, rather than dropping the record |
| `evidence` | every tool call the gate made, with its output (each truncated to `GATE_EVIDENCE_CHARS`, default 4000) |
| `outcome` · `commit` | how the round ended; a commit only when HEAD actually moved |

The file **accumulates across runs**: `round-NNN.*` is overwritten by the next run, `gates.jsonl` is not, so every record carries its own evidence instead of pointing at other files. It is the dataset for calibrating the gates — for example, Jev's shadow report ([09-jev](09-jev.md)) pairs each Jev call with the value-critic verdict recorded here. It lives under `.loop/`, so it is never committed: it contains product ideas that have not shipped. Screen it yourself before publishing any of it — evidence keeps up to `GATE_EVIDENCE_CHARS` of every tool output a gate saw, which can include file contents, environment values, or tokens. Treat `.loop/` as sensitive and prune it on your own retention schedule.

**The driver trusts these records over the round's self-report.** For each round it counts value-critic `REJECT` hand-backs in `gates.jsonl`: if the round's `LOOP_RESULT` reports fewer `rejects=`, the recorded count feeds the plateau window. A `SHIPPED` round whose last validator hand-back is not `VERDICT: PASS` (or that has no validator hand-back at all) is counted as NOOP. If a SHIPPED round recorded no hand-backs at all, the driver logs a warning instead — that usually means the transcript format changed, and it should be investigated rather than silently trusted.

The cross-check matches subagents by name: `GATE_VALUE_AGENT` (default `value-critic`) and `GATE_VALIDATOR_AGENT` (default `validator`) in `loop.config.env`. If you rename either agent in `.claude/agents/`, set these too — otherwise every SHIPPED round becomes a NOOP and the run stops as a structural failure after `MAX_NOOP` rounds. When the driver downgrades a round for a missing validator, its log line lists the agent names it did record, so a mismatch is visible at once.

Without `jq` all of this switches off and the driver runs in plain-text mode as before.

## Optional: Jev pre-checks and the dashboard

- **Jev pre-checks** (`JEV_MODE=off | shadow | prefilter`): a typed-judgment model that can fast-reject obvious bad ideas in front of the LLM gates and can never approve anything. Rollout order, safety rules, and the offline eval are in [09-jev](09-jev.md). In shadow mode, `node scripts/jev/shadow-report.mjs` pairs every Jev call with the value-critic verdict recorded in `gates.jsonl`.
- **Dashboard**: `node scripts/dashboard/serve.mjs` — a local, read-only page showing the run's history, the node the current round is at, and how far each stop condition is from firing. See [10-dashboard](10-dashboard.md).

## Safety

- The driver checks the branch at the start of every round and REFUSEs anything but `LOOP_BRANCH`; `scripts/install-hooks.sh` installs a `pre-push` hook that refuses the live branch at the git level; SHIPPED only counts if HEAD actually moved and (with `jq`) the last recorded validator verdict is PASS; a round that edits `PROTECTED_PATHS` parks the run.
- Every round has a `ROUND_TIMEOUT` (default 1800s); a hung round is killed and counted as NOOP. `kill $(cat .loop/run.pid)` also stops the `claude -p` in flight.
- The spec only runs `git add <specific files>`; failures use `git checkout -- <files>` or `git stash push -m`, never `reset --hard`.
- No automatic merges; no credential files touched; fabricated signals on a trust product are blocked at F.

Next: [06-lessons](06-lessons.md)

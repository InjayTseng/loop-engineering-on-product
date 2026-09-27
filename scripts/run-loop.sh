#!/usr/bin/env bash
# run-loop.sh — the deterministic outer driver of the graph in docs/00-pipeline.md (v3).
#
# Each round is a FRESH headless `claude -p` executing exactly ONE iteration of $LOOP_SPEC
# (C → R → F → S → D → V → Y). The driver never reasons; it parses one result line per node
# and owns everything the round agent must not self-judge:
#   • branch isolation   — refuses to run unless on $LOOP_BRANCH, re-checked EVERY round;
#                          a SHIPPED claim only counts if HEAD actually advanced
#   • current state (C)  — deep audit by state-auditor at run start and every $AUDIT_EVERY rounds;
#                          BROKEN forces the next round into maintenance mode
#   • category diversity — feeds "recently shipped categories" into the next prompt
#   • plateau            — stops on rolling REJECTION RATE (rejects per shipped idea), not on
#                          "N consecutive fully-rejected rounds" (that signal never fires; v2.1)
#   • reset              — a rejected round forces the next round to a different funnel angle
#   • trajectory (T)     — every $TRAJ_EVERY rounds an independent agent checks for drift;
#                          with JEV_MODE=prefilter also EARLY, when Jev flags a shipped change as
#                          the same tactic as a recent one (Jev only triggers T, T still decides)
#   • positioning (P)    — on a value STOP, optionally lets strategist + positioning-critic re-aim
#                          the soft fields (AUTONOMOUS_POSITIONING=true), at most
#                          $MAX_AUTO_POSITIONING times; otherwise parks and waits for a human
#   • round timeout      — a hung round is killed after $ROUND_TIMEOUT seconds (counts as NOOP)
#
# Usage:  scripts/run-loop.sh [N]        # N overrides ROUNDS from loop.config.env
# Env:    CONFIG (loop.config.env) · CLAUDE_BIN (claude) · any config key (env beats file) ·
#         SKIP_START_AUDIT=1 · ROUND_TIMEOUT (1800) · JEV_BIN (scripts/jev/jev.mjs; docs/09-jev.md)
# Stop:   kill $(cat .loop/run.pid)      # also kills the round in flight
# Logs:   .loop/loop.log (one line per event) · .loop/round-NNN.log · .loop/audit-NNN.log ·
#         .loop/traj-NNN.log · .loop/position-NNN.log · .loop/state (WAITING_FOR_P when parked) ·
#         .loop/jev.jsonl (every Jev call, any mode) · .loop/events.jsonl (structured run / round /
#         step events for scripts/dashboard/; the round agent adds `step` events via scripts/loop-event.sh)
#
# Portability: written for macOS /bin/bash 3.2. Do NOT use `${arr[@]: -N}` (returns an empty
# array when the array is shorter than N — the bug that silently disabled v2.1's plateau).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"

CONFIG="${CONFIG:-loop.config.env}"
[ -f "$CONFIG" ] || { echo "REFUSE: $CONFIG not found. Copy and fill loop.config.env first."; exit 1; }
# Environment overrides beat the config file (documented usage: LOOP_MODEL=... scripts/run-loop.sh).
OVERRIDABLE="ROUNDS LOOP_MODEL POSITIONING_MODEL LOOP_BRANCH DEPLOY_BRANCH WINDOW PLATEAU_REJ PLATEAU_SHIP MAX_CONSEC_REJECTED MAX_NOOP MAX_CONSEC_MAINT TRAJ_EVERY AUDIT_EVERY AUTONOMOUS_POSITIONING MAX_AUTO_POSITIONING LOOP_SPEC POSITIONING STATE ROUND_TIMEOUT JEV_MODE JEV_REJECT_P"
for v in $OVERRIDABLE; do eval "_env_$v=\${$v-__unset__}"; done
# shellcheck disable=SC1090
set -a; . "$CONFIG"; set +a
for v in $OVERRIDABLE; do eval "[ \"\$_env_$v\" = __unset__ ] || $v=\$_env_$v"; done

N="${1:-${ROUNDS:-20}}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
LOOP_MODEL="${LOOP_MODEL:-sonnet}"
POSITIONING_MODEL="${POSITIONING_MODEL:-$LOOP_MODEL}"
LOOP_BRANCH="${LOOP_BRANCH:-loop}"; DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
WINDOW="${WINDOW:-5}"; PLATEAU_REJ="${PLATEAU_REJ:-2}"; PLATEAU_SHIP="${PLATEAU_SHIP:-3}"
MAX_CONSEC_REJECTED="${MAX_CONSEC_REJECTED:-2}"; MAX_NOOP="${MAX_NOOP:-3}"; MAX_CONSEC_MAINT="${MAX_CONSEC_MAINT:-3}"
TRAJ_EVERY="${TRAJ_EVERY:-5}"; AUDIT_EVERY="${AUDIT_EVERY:-5}"
AUTONOMOUS_POSITIONING="${AUTONOMOUS_POSITIONING:-false}"; MAX_AUTO_POSITIONING="${MAX_AUTO_POSITIONING:-1}"
LOOP_SPEC="${LOOP_SPEC:-.claude/tasks/innovation_loop.md}"
POSITIONING="${POSITIONING:-product/positioning.md}"; STATE="${STATE:-product/state.md}"
ROUND_TIMEOUT="${ROUND_TIMEOUT:-1800}"
JEV_MODE="${JEV_MODE:-off}"; JEV_REJECT_P="${JEV_REJECT_P:-0.85}"; JEV_BIN="${JEV_BIN:-$ROOT/scripts/jev/jev.mjs}"
export JEV_MODE JEV_REJECT_P   # the round agent's own Jev calls (spec Step 2b, validator 3b) inherit the mode
LOGDIR="$ROOT/.loop"; mkdir -p "$LOGDIR"; echo $$ > "$LOGDIR/run.pid"
trap 'pkill -P $$ 2>/dev/null; rm -f "$LOGDIR/run.pid"' EXIT
say() { echo "$*" | tee -a "$LOGDIR/loop.log"; }
# shellcheck source=loop-event.sh
. "$ROOT/scripts/loop-event.sh"; export LOOP_EVENTS="$LOGDIR/events.jsonl"   # emit (see dashboard)
pad() { printf '%03d' "$1"; }

# --- result-line parsing ---------------------------------------------------------------------
# Agents wrap the protocol line in backticks or indent it more often than not (11/20 rounds in the
# web-v2 example run). Strip backticks, anchor at line start, take the LAST match.
resline() {  # $1 file, $2 key → full line
  tr -d '`' < "$1" | grep -E "^[[:space:]]*$2:" | tail -1; }
verdict() {  # $1 file, $2 key → first UPPERCASE token after "KEY:" (e.g. AGREED, not DISAGREED)
  resline "$1" "$2" | sed -E "s/^[[:space:]]*$2:[[:space:]]*([A-Z_]+).*/\1/"; }

# --- headless call with a per-round timeout (portable: macOS has no `timeout`) -----------------
run_claude() {  # $1 log, $2 model, $3 prompt
  "$CLAUDE_BIN" -p "$3" --dangerously-skip-permissions --model "$2" >"$1" 2>&1 & local pid=$!
  ( sleep "$ROUND_TIMEOUT"; kill "$pid" 2>/dev/null && echo "TIMEOUT after ${ROUND_TIMEOUT}s" >>"$1" ) & local wd=$!
  wait "$pid" 2>/dev/null; kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null; return 0; }

# --- gate 0: never on the live branch (re-run every round) ---------------------------------
check_branch() {
  local br; br=$(git rev-parse --abbrev-ref HEAD)
  if [ "$br" != "$LOOP_BRANCH" ] || [ "$br" = "$DEPLOY_BRANCH" ]; then
    say "REFUSE: on branch '$br'; the loop only runs on '$LOOP_BRANCH' ('$DEPLOY_BRANCH' = live). Aborting."; exit 1
  fi; }
check_branch
for f in "$LOOP_SPEC" "$POSITIONING" "$STATE"; do
  [ -f "$f" ] || { echo "REFUSE: $f not found (positioning/state are inputs to every round)."; exit 1; }
done

# --- node C: deep audit (fresh agent; rewrites product/state.md) ---------------------------
maint_flag=0
run_audit() {   # $1 = round number for the log name
  local alog="$LOGDIR/audit-$(pad "$1").log"
  say "  · state audit @ round $1 -> $alog"; emit audit_start "round#=$1"
  run_claude "$alog" "$LOOP_MODEL" "Spawn the state-auditor subagent (.claude/agents/state-auditor.md) to audit this repository and the running product from scratch and REWRITE $STATE. Report its final AUDIT: line verbatim as your last line."
  local A; A=$(resline "$alog" AUDIT); say "    ${A:-<no AUDIT line>}"
  emit audit "round#=$1" "verdict=$(verdict "$alog" AUDIT)" "line=$A"
  [ "$(verdict "$alog" AUDIT)" = "BROKEN" ] && { maint_flag=1; say "    state BROKEN — next round forced MAINTENANCE"; }; return 0; }

# --- node P (autonomous): two senior agents must agree -------------------------------------
auto_pos=0
run_autonomous_positioning() {   # returns 0 if positioning changed (continue), 1 otherwise (park)
  local plog="$LOGDIR/position-$(pad "$1").log"
  say "  · autonomous positioning @ round $1 (attempt $((auto_pos+1))/$MAX_AUTO_POSITIONING) -> $plog"; emit position_start "round#=$1"
  run_claude "$plog" "$POSITIONING_MODEL" "Run the autonomous mode of .claude/commands/position.md: spawn strategist, then positioning-critic on its proposal; apply to SOFT fields of $POSITIONING only if the critic returns AGREED; mirror soft fields into loop.config.env. End with the POSITION: line verbatim."
  local P; P=$(resline "$plog" POSITION); say "    ${P:-<no POSITION line>}"
  emit position "round#=$1" "verdict=$(verdict "$plog" POSITION)" "line=$P"
  if [ "$(verdict "$plog" POSITION)" = "AGREED" ]; then auto_pos=$((auto_pos+1)); return 0; fi
  return 1; }

# --- node T: independent trajectory check -------------------------------------------------
run_traj() {   # $1 round, $2 why → sets STOP / reset_flag from the TRAJ line
  local tlog="$LOGDIR/traj-$(pad "$1").log"
  say "  · trajectory check @ round $1${2:+ ($2)}"; emit traj_start "round#=$1" "why=$2"
  run_claude "$tlog" "$LOOP_MODEL" "Spawn the trajectory-monitor subagent (.claude/agents/trajectory-monitor.md) over the last $TRAJ_EVERY commits, judged against $POSITIONING. Report its TRAJ: line verbatim as your last line."
  local T; T=$(resline "$tlog" TRAJ); say "    ${T:-<no TRAJ line>}"
  emit traj "round#=$1" "verdict=$(verdict "$tlog" TRAJ)" "line=$T" "why=$2"
  case "$(verdict "$tlog" TRAJ)" in
    STOP)     STOP="trajectory monitor halted the run (round $1)" ;;
    REDIRECT) reset_flag=1 ;;
  esac; return 0; }

# --- Jev same-tactic pre-check (optional, docs/09-jev.md) -----------------------------------
# Only ever returns "run T early" (0) or "nothing" (1). It cannot stop, reset or ship anything:
# shadow mode just logs, and an OFF / UNAVAILABLE / ESCALATE / DISTINCT line is a no-op.
jev_same_tactic() {   # $1 round
  [ "$JEV_MODE" = "off" ] && return 1
  local J; J=$("$JEV_BIN" same-tactic --n "$TRAJ_EVERY" 2>/dev/null | tr -d '`' | grep -E '^[[:space:]]*JEV:' | tail -1)
  say "  · jev same-tactic: ${J:-<no JEV line>}"; emit jev_same "round#=$1" "line=$J"
  [ "$JEV_MODE" = "prefilter" ] && [ "$(echo "$J" | sed -E 's/^[[:space:]]*JEV:[[:space:]]*([A-Z_]+).*/\1/')" = "SAME" ]; }

park_for_human() { echo "WAITING_FOR_P: $1" > "$LOGDIR/state"; emit park "reason=$1"; say "=== PARKED: $1 — positioning needs a human (/position). State is in $LOGDIR/state. ==="; }

START=$(git rev-parse HEAD)
consec_reject=0; consec_noop=0; consec_maint=0; reset_flag=0
REJWIN=(); SHIPWIN=(); CATS=()
rm -f "$LOGDIR/state"
say "=== run-loop v3 START $(date '+%F %T') | N=$N model=$LOOP_MODEL branch=$LOOP_BRANCH window=$WINDOW plateau=${PLATEAU_REJ}/${PLATEAU_SHIP} audit_every=$AUDIT_EVERY traj_every=$TRAJ_EVERY auto_pos=$AUTONOMOUS_POSITIONING timeout=${ROUND_TIMEOUT}s jev=$JEV_MODE ==="
emit run_start "n#=$N" "pid#=$$" "branch=$LOOP_BRANCH" "model=$LOOP_MODEL" "jev=$JEV_MODE" \
  "window#=$WINDOW" "plateau_rej#=$PLATEAU_REJ" "plateau_ship#=$PLATEAU_SHIP" "max_consec_rejected#=$MAX_CONSEC_REJECTED" \
  "max_noop#=$MAX_NOOP" "max_consec_maint#=$MAX_CONSEC_MAINT" "traj_every#=$TRAJ_EVERY" "audit_every#=$AUDIT_EVERY"
[ "${SKIP_START_AUDIT:-0}" = "1" ] || run_audit 0

i=0
while [ "$i" -lt "$N" ]; do
  i=$((i+1)); STOP=""; early_traj=0
  check_branch
  log="$LOGDIR/round-$(pad "$i").log"
  n=${#CATS[@]}; s=$(( n > 4 ? n - 4 : 0 )); recent="${CATS[*]:$s}"   # last 4, bash-3.2-safe
  note=""
  [ "$reset_flag" = "1" ] && note+="THIS IS A RESET ROUND: the value gate rejected recent ideas — deliberately pick a DIFFERENT funnel stage / category from the recent ones and think from scratch. "
  [ "$maint_flag" = "1" ] && note+="THIS IS A MAINTENANCE ROUND: $STATE reports BROKEN — fix what it lists, do not add features (Step 1b). "
  [ "$JEV_MODE" != "off" ] && note+="JEV_MODE=$JEV_MODE: run the Jev pre-checks (spec Step 2b; validator step 3b) — they can only fast-reject; never skip an LLM gate on a Jev pass. "
  say "--- ROUND $i/$N @ $(date '+%T') (reset=$reset_flag maint=$maint_flag) -> $log"
  head_before=$(git rev-parse HEAD)
  export LOOP_ROUND="$i"; emit round_start "round#=$i" "reset#=$reset_flag" "maint#=$maint_flag"

  run_claude "$log" "$LOOP_MODEL" "${note}Execute exactly ONE iteration of $LOOP_SPEC in this directory (git branch '$LOOP_BRANCH'). Read loop.config.env, $POSITIONING and $STATE first. Recently shipped categories (prefer a DIFFERENT one): ${recent:-none}. Rules: one small localized change; write a PRP every round; pass the value-critic gate (before building) AND the validator gate (after building, against the PRP) — both are independent subagents, never self-approve; commit and push origin $LOOP_BRANCH ONLY, never $DEPLOY_BRANCH. End your reply with the LOOP_RESULT line exactly as the spec defines it."
  maint_flag=0

  RES=$(resline "$log" LOOP_RESULT); V=$(verdict "$log" LOOP_RESULT)
  say "  -> ${RES:-<no LOOP_RESULT emitted>}"
  rj=$(echo "$RES" | grep -oE 'rejects=[0-9]+' | cut -d= -f2); rj=${rj:-0}
  sh=0
  if [ "$V" = "SHIPPED" ] && [ "$(git rev-parse HEAD)" = "$head_before" ]; then
    say "     claimed SHIPPED but HEAD did not move — counting as NOOP"; V="NOOP"
  fi

  case "$V" in
    SHIPPED)
      sh=1; consec_reject=0; consec_noop=0; reset_flag=0
      cat=$(echo "$RES" | grep -oE 'category=[A-Za-z0-9_-]+' | cut -d= -f2); CATS+=("${cat:-?}")
      if [ "${cat:-}" = "maintenance" ]; then consec_maint=$((consec_maint+1)); else consec_maint=0; fi
      say "     shipped: $(git log --oneline -1)"
      jev_same_tactic "$i" && early_traj=1
      [ "$consec_maint" -ge "$MAX_CONSEC_MAINT" ] && STOP="$MAX_CONSEC_MAINT consecutive maintenance rounds — research is dry" ;;
    REJECTED)
      consec_reject=$((consec_reject+1)); consec_noop=0
      if [ "$consec_reject" -ge "$MAX_CONSEC_REJECTED" ]; then
        STOP="value plateau — a RESET round was also fully rejected (round $i)"
      else
        reset_flag=1; say "     value gate found nothing above threshold — next round forced RESET"
      fi ;;
    *)
      consec_noop=$((consec_noop+1))
      say "     noop/no-result [consec=$consec_noop/$MAX_NOOP]"
      if [ "$consec_noop" -ge "$MAX_NOOP" ]; then
        say "=== STOP: $MAX_NOOP consecutive build/validate failures — structural, not a value problem. Fix the adapter or the product, then rerun. ==="
        emit round_end "round#=$i" "verdict=${V:-NOOP}" "rejects#=$rj"
        emit stop "round#=$i" "reason=$MAX_NOOP consecutive build/validate failures (structural)"
        break
      fi ;;
  esac

  if [ "$V" = "SHIPPED" ]; then
    emit round_end "round#=$i" "verdict=SHIPPED" "category=${cat:-}" "step=$(echo "$RES" | grep -oE 'step=[^|]+' | cut -d= -f2- | sed 's/[[:space:]]*$//')" \
      "rejects#=$rj" "commit=$(git rev-parse --short HEAD)" "subject=$(git log -1 --format=%s)"
  else
    emit round_end "round#=$i" "verdict=${V:-NOOP}" "rejects#=$rj"
  fi

  # --- plateau on rolling rejection RATE (v2.1, window fixed for bash 3.2) -------------------
  REJWIN+=("$rj"); SHIPWIN+=("$sh")
  if [ "${#SHIPWIN[@]}" -gt "$WINDOW" ]; then REJWIN=("${REJWIN[@]:1}"); SHIPWIN=("${SHIPWIN[@]:1}"); fi
  if [ -z "$STOP" ] && [ "${#SHIPWIN[@]}" -ge "$WINDOW" ]; then
    sumr=0; for x in "${REJWIN[@]}"; do sumr=$((sumr+x)); done
    sums=0; for x in "${SHIPWIN[@]}"; do sums=$((sums+x)); done
    if [ "$sums" -gt 0 ] && [ $((PLATEAU_REJ*sumr)) -ge $((PLATEAU_SHIP*sums)) ]; then
      STOP="value plateau — rejection rate high over last $WINDOW rounds (rejected ideas=$sumr, shipped rounds=$sums)"
    fi
  fi

  # --- node C (deep) and node T, every K / N rounds ------------------------------------------
  if [ -z "$STOP" ] && [ $((i % AUDIT_EVERY)) -eq 0 ]; then run_audit "$i"; fi
  if [ -z "$STOP" ]; then
    if [ $((i % TRAJ_EVERY)) -eq 0 ]; then run_traj "$i" ""
    elif [ "$early_traj" = "1" ]; then run_traj "$i" "early: Jev flagged a repeated tactic"; fi
  fi

  # --- a value STOP hands control to node P --------------------------------------------------
  if [ -n "$STOP" ]; then
    say "=== STOP: $STOP ==="; emit stop "round#=$i" "reason=$STOP"
    if [ "$AUTONOMOUS_POSITIONING" = "true" ] && [ "$auto_pos" -lt "$MAX_AUTO_POSITIONING" ] && run_autonomous_positioning "$i"; then
      say "    positioning re-aimed by strategist+critic (pending human review) — resuming from node C"
      consec_reject=0; consec_noop=0; consec_maint=0; reset_flag=1; REJWIN=(); SHIPWIN=()
      run_audit "$i"
      continue
    fi
    park_for_human "$STOP"; break
  fi
done

emit done "rounds#=$i"
say "=== run-loop v3 DONE $(date '+%F %T'). Shipped this run: ==="
git log --oneline "$START"..HEAD | tee -a "$LOGDIR/loop.log"
say "categories: ${CATS[*]:-none}"

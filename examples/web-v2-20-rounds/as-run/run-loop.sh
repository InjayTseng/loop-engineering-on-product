#!/bin/bash
# Autonomous overnight driver — v2.1, value-gated.
#
# Each round is a fresh headless `claude -p` running ONE iteration of
# .claude/tasks/improvement_loop.md. Stops on VALUE plateau. v2.1 fix (from the N=20
# experiment): plateau is detected by rolling REJECTION RATE — how many ideas the value
# gate rejects per shipped one — not just "2 consecutive fully-rejected rounds" (too
# coarse: per-round retry + a multi-stage funnel meant that hard signal never fired even
# as the value gate rejected 8 ideas). Each round reports `rejects=N`; we stop when, over
# the last WINDOW rounds, rejected ideas reach ~60% of all ideas seen.
#
# Usage:  Scripts/run-loop.sh [N]            # default 30
# Env:    LOOP_MODEL (sonnet) · TRAJ_EVERY (5) · MAX_NOOP (3) · WINDOW (5, plateau window)
#
# Safety: refuses to run unless on branch `loop`. Rounds push origin/loop ONLY — never
#         main (main = GitHub Pages → live example.com). Stop: kill $(cat .loop/run.pid).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"

N="${1:-30}"
LOOP_MODEL="${LOOP_MODEL:-claude-sonnet-4-6}"
TRAJ_EVERY="${TRAJ_EVERY:-5}"
MAX_NOOP="${MAX_NOOP:-3}"
LOGDIR="$ROOT/.loop"; mkdir -p "$LOGDIR"; echo $$ > "$LOGDIR/run.pid"

BR=$(git rev-parse --abbrev-ref HEAD)
[ "$BR" != "loop" ] && { echo "REFUSE: not on 'loop' branch (on '$BR'). main = live deploy. Aborting."; rm -f "$LOGDIR/run.pid"; exit 1; }

START=$(git rev-parse HEAD)
consec_reject=0; consec_noop=0; reset_flag=0
WINDOW="${WINDOW:-5}"; REJWIN=(); SHIPWIN=()   # v2.1: rolling rejection-rate plateau
declare -a CATS=()
echo "=== run-loop v2 START $(date '+%F %T') | N=$N model=$LOOP_MODEL ===" | tee -a "$LOGDIR/loop.log"

for i in $(seq 1 "$N"); do
  log="$LOGDIR/round-$(printf '%03d' "$i").log"
  recent=$(printf '%s ' "${CATS[@]: -4}" 2>/dev/null)
  reset_note=""
  [ "$reset_flag" = "1" ] && reset_note="THIS IS A RESET ROUND: the value gate rejected recent ideas — deliberately pick a DIFFERENT funnel stage / category from the recent ones and think from scratch. "
  echo "--- ROUND $i/$N @ $(date '+%T') ${reset_flag:+(reset=$reset_flag)} -> $log" | tee -a "$LOGDIR/loop.log"

  claude -p "${reset_note}Execute exactly ONE iteration of .claude/tasks/improvement_loop.md in this directory (git worktree on branch 'loop'). Recently shipped categories (prefer a DIFFERENT one): ${recent:-none}. Rules: one small localized edit to index.html; pass the value-critic gate (Step 3) AND the web-validator gate (Step 6.5) — both independent subagents, never self-approve; push origin loop ONLY, never main. End your reply with the LOOP_RESULT line per the spec." \
    --dangerously-skip-permissions --model "$LOOP_MODEL" >"$log" 2>&1

  RES=$(grep -oE 'LOOP_RESULT:.*' "$log" | tail -1)
  echo "  -> ${RES:-<no LOOP_RESULT emitted>}" | tee -a "$LOGDIR/loop.log"
  rj=$(echo "$RES" | grep -oE 'rejects=[0-9]+' | cut -d= -f2); rj=${rj:-0}

  case "$RES" in
    *SHIPPED*)
      consec_reject=0; consec_noop=0; reset_flag=0
      cat=$(echo "$RES" | grep -oE 'category=[a-z-]+' | cut -d= -f2); CATS+=("${cat:-?}")
      echo "     shipped: $(git log --oneline -1)" | tee -a "$LOGDIR/loop.log" ;;
    *REJECTED*)
      consec_reject=$((consec_reject+1))
      if [ "$consec_reject" -ge 2 ]; then
        echo "=== STOP: value plateau — reset round also below threshold (round $i). Genuine end. ===" | tee -a "$LOGDIR/loop.log"; break
      fi
      reset_flag=1; echo "     value gate found nothing above threshold — next round forced RESET" | tee -a "$LOGDIR/loop.log" ;;
    *NOOP*|*)
      consec_noop=$((consec_noop+1))
      echo "     noop/no-result [consec=$consec_noop/$MAX_NOOP]" | tee -a "$LOGDIR/loop.log"
      [ "$consec_noop" -ge "$MAX_NOOP" ] && { echo "=== STOP: $MAX_NOOP consecutive build/validate failures — something structural. ===" | tee -a "$LOGDIR/loop.log"; break; } ;;
  esac

  # v2.1 plateau: rolling rejection RATE, not just consecutive fully-rejected rounds.
  # The value gate's real "running dry" signal is how many ideas it rejects per shipped
  # one — which round-level REJECTED alone misses. Stop when, over the last WINDOW rounds,
  # rejected ideas >= ~60% of all ideas seen (integer form: 2*rejects >= 3*ships).
  sh=0; case "$RES" in *SHIPPED*) sh=1;; esac
  REJWIN+=("$rj"); SHIPWIN+=("$sh")
  REJWIN=("${REJWIN[@]: -$WINDOW}"); SHIPWIN=("${SHIPWIN[@]: -$WINDOW}")
  if [ "${#SHIPWIN[@]}" -ge "$WINDOW" ]; then
    sumr=0; for x in "${REJWIN[@]}"; do sumr=$((sumr+x)); done
    sums=0; for x in "${SHIPWIN[@]}"; do sums=$((sums+x)); done
    if [ "$sums" -eq 0 ] || [ $((2*sumr)) -ge $((3*sums)) ]; then
      echo "=== STOP: value plateau — rejection rate high over last $WINDOW rounds (rejected ideas=$sumr, shipped rounds=$sums). ===" | tee -a "$LOGDIR/loop.log"; break
    fi
  fi

  # Trajectory monitor: every TRAJ_EVERY rounds, an independent check for drift / marginal stacking.
  if [ $((i % TRAJ_EVERY)) -eq 0 ]; then
    tlog="$LOGDIR/traj-$(printf '%03d' "$i").log"
    echo "  · trajectory check @ round $i" | tee -a "$LOGDIR/loop.log"
    claude -p "Review this loop's last $TRAJ_EVERY commits: \`git log --oneline -$TRAJ_EVERY\`. Are we drifting into marginal stacking (same kind of change repeatedly) or off the funnel north-star? Reply with ONE line: TRAJ: CONTINUE | REDIRECT | STOP — and a half-sentence why." \
      --dangerously-skip-permissions --model "$LOOP_MODEL" >"$tlog" 2>&1
    T=$(grep -oE 'TRAJ:.*' "$tlog" | tail -1); echo "    $T" | tee -a "$LOGDIR/loop.log"
    case "$T" in
      *STOP*) echo "=== STOP: trajectory monitor halted the run (round $i). ===" | tee -a "$LOGDIR/loop.log"; break ;;
      *REDIRECT*) reset_flag=1 ;;
    esac
  fi
done

echo "=== run-loop v2 DONE $(date '+%F %T'). Shipped this run: ===" | tee -a "$LOGDIR/loop.log"
git log --oneline "$START"..HEAD | tee -a "$LOGDIR/loop.log"
echo "categories: ${CATS[*]:-none}" | tee -a "$LOGDIR/loop.log"
rm -f "$LOGDIR/run.pid"

#!/usr/bin/env bash
# test-driver.sh — deterministic tests for scripts/run-loop.sh using a stubbed `claude`.
# The stub pops one line per call from a queue file, so each scenario scripts exactly what every
# node "returns" (AUDIT / LOOP_RESULT / TRAJ / POSITION lines) and we ASSERT what the driver does.
# Runs in a throwaway copy of this repo. The stub also commits a file on SHIPPED so HEAD moves.
# Usage: bash scripts/test-driver.sh        (exit 0 = all scenarios pass)
set -u
SRC="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/repo" "$T/bin"
cp -R "$SRC"/. "$T/repo/"; rm -rf "$T/repo/.git" "$T/repo/.loop"
( cd "$T/repo" && git init -q && git symbolic-ref HEAD refs/heads/main && git add -A \
  && git -c user.name=t -c user.email=t@t commit -qm init && git checkout -q -b loop )
cat > "$T/bin/claude" <<'STUB'
#!/usr/bin/env bash
Q="${STUB_QUEUE:?}"; line=$(head -1 "$Q"); tail -n +2 "$Q" > "$Q.tmp" && mv "$Q.tmp" "$Q"
echo "stub call: $*" | head -c 900; echo
case "$line" in *SHIPPED*) echo "x" >> shipped.txt; git add shipped.txt; git -c user.name=t -c user.email=t@t commit -qm "loop: stub ship";; esac
echo "$line"
STUB
chmod +x "$T/bin/claude"
cd "$T/repo"
FAIL=0
run_case() { local name="$1" queue="$2" n="$3"; shift 3
  printf '%b' "$queue" > "$T/q.txt"; rm -rf .loop
  env STUB_QUEUE="$T/q.txt" CLAUDE_BIN="$T/bin/claude" WINDOW=3 TRAJ_EVERY=2 AUDIT_EVERY=2 ROUND_TIMEOUT=20 "$@" scripts/run-loop.sh "$n" >/dev/null 2>&1
  echo "### $name"; }
expect() { if grep -qE -- "$1" .loop/loop.log; then echo "  ok   $1"; else echo "  FAIL $1"; FAIL=1; fi; }
expect_not() { if grep -qE -- "$1" .loop/loop.log; then echo "  FAIL (unexpected) $1"; FAIL=1; else echo "  ok   no '$1'"; fi; }

run_case "1 rejection-rate plateau fires at round 3 (window 3) → parked" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=2\n\`LOOP_RESULT: SHIPPED | category=b | step=s | rejects=2\`\nAUDIT: HEALTHY\nTRAJ: CONTINUE\n  LOOP_RESULT: SHIPPED | category=c | step=s | rejects=2\n" 10
expect "STOP: value plateau — rejection rate high over last 3 rounds \(rejected ideas=6, shipped rounds=3\)"
expect "PARKED"
expect "shipped: .* loop: stub ship"
expect_not "no LOOP_RESULT"

run_case "2 RESET then rejected → auto P AGREED → resume → TRAJ STOP → P DISAGREE → parked" \
"AUDIT: HEALTHY\nLOOP_RESULT: REJECTED | rejects=3\nLOOP_RESULT: REJECTED | rejects=3\nPOSITION: AGREED\nAUDIT: GAPS\nLOOP_RESULT: SHIPPED | category=x | step=s | rejects=0\nLOOP_RESULT: SHIPPED | category=y | step=s | rejects=0\nAUDIT: HEALTHY\nTRAJ: STOP — same tactic relabeled\nPOSITION: DISAGREED — evidence does not support\n" 10 AUTONOMOUS_POSITIONING=true MAX_AUTO_POSITIONING=2
expect "next round forced RESET"
expect "STOP: value plateau — a RESET round was also fully rejected \(round 2\)"
expect "positioning re-aimed"
expect "STOP: trajectory monitor halted the run \(round 4\)"
expect "autonomous positioning @ round 4 \(attempt 2/2\)"
expect "PARKED: trajectory monitor"

run_case "3 BROKEN audit → maintenance flag; 3×NOOP → structural stop" \
"AUDIT: BROKEN — build fails\nLOOP_RESULT: NOOP | rejects=0\nLOOP_RESULT: NOOP | rejects=0\nAUDIT: BROKEN\nTRAJ: CONTINUE\nLOOP_RESULT: NOOP | rejects=0\n" 10
expect "state BROKEN — next round forced MAINTENANCE"
expect "STOP: 3 consecutive build/validate failures"
grep -q 'MAINTENANCE ROUND' .loop/round-001.log && echo "  ok   maintenance note in round 1 prompt" || { echo "  FAIL maintenance note"; FAIL=1; }

run_case "4 healthy rounds; TRAJ REDIRECT → next round RESET; recent categories fed forward" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\nLOOP_RESULT: SHIPPED | category=b | step=s | rejects=1\nAUDIT: HEALTHY\nTRAJ: REDIRECT\nLOOP_RESULT: SHIPPED | category=c | step=s | rejects=0\n" 3
expect_not "STOP"
grep -q 'RESET ROUND' .loop/round-003.log && echo "  ok   RESET note in round 3 prompt" || { echo "  FAIL RESET note"; FAIL=1; }
grep -q 'Recently shipped categories (prefer a DIFFERENT one): a b' .loop/round-003.log && echo "  ok   recent categories = 'a b'" || { echo "  FAIL recent categories"; FAIL=1; }

run_case "5 SHIPPED claimed but HEAD unchanged → NOOP; 3 maintenance ships → stop" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=maintenance | step=none | rejects=0\nLOOP_RESULT: SHIPPED | category=maintenance | step=none | rejects=0\nAUDIT: HEALTHY\nTRAJ: CONTINUE\nLOOP_RESULT: SHIPPED | category=maintenance | step=none | rejects=0\n" 10
expect "STOP: 3 consecutive maintenance rounds"
# a stub that claims SHIPPED but never commits
grep -v 'shipped.txt' "$T/bin/claude" > "$T/bin/claude-nocommit"; chmod +x "$T/bin/claude-nocommit"
printf '%b' "AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\n" > "$T/q.txt"; rm -rf .loop
env STUB_QUEUE="$T/q.txt" CLAUDE_BIN="$T/bin/claude-nocommit" scripts/run-loop.sh 1 >/dev/null 2>&1
grep -q "claimed SHIPPED but HEAD did not move" .loop/loop.log && echo "  ok   HEAD-unchanged SHIPPED counted as NOOP" || { echo "  FAIL HEAD-unchanged check"; FAIL=1; }

echo "### 6 refuses to run on the deploy branch (stub CLAUDE_BIN, must not be reached)"
git checkout -q main; printf 'AUDIT: HEALTHY\n' > "$T/q.txt"
out=$(env STUB_QUEUE="$T/q.txt" CLAUDE_BIN="$T/bin/claude" scripts/run-loop.sh 1 2>&1 | head -1)
case "$out" in REFUSE:*main*) echo "  ok   $out";; *) echo "  FAIL got: $out"; FAIL=1;; esac
git checkout -q loop

echo "### 7 round timeout kills a hung round and counts it as NOOP"
cat > "$T/bin/hang" <<'H'
#!/usr/bin/env bash
echo "AUDIT: HEALTHY"; [ "${HANG_ONCE:-}" = "1" ] && exit 0; sleep 60
H
chmod +x "$T/bin/hang"; rm -rf .loop
env CLAUDE_BIN="$T/bin/hang" SKIP_START_AUDIT=1 ROUND_TIMEOUT=2 MAX_NOOP=1 scripts/run-loop.sh 1 >/dev/null 2>&1
grep -q "TIMEOUT after 2s" .loop/round-001.log && grep -q "noop/no-result" .loop/loop.log && echo "  ok   timeout → NOOP" || { echo "  FAIL timeout"; FAIL=1; }

[ "$FAIL" = 0 ] && echo "ALL DRIVER TESTS PASSED" || { echo "DRIVER TESTS FAILED"; exit 1; }

#!/usr/bin/env bash
# test-driver.sh — deterministic tests for scripts/run-loop.sh using a stubbed `claude`.
# The stub pops one line per call from a queue file, so each scenario scripts exactly what every
# node "returns" (AUDIT / LOOP_RESULT / TRAJ / POSITION lines) and we ASSERT what the driver does.
# Runs in a throwaway copy of this repo. The stub also commits a file on SHIPPED so HEAD moves.
# Usage: bash scripts/test-driver.sh        (exit 0 = all scenarios pass)
set -u
for bin in git node; do
  command -v "$bin" >/dev/null || { echo "REFUSE: '$bin' not on PATH (scenarios 4 and 11 read events/dashboard state with node; Node >= 18 — e.g. 'source ~/.nvm/nvm.sh')."; exit 1; }
done
SRC="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/repo" "$T/bin"
cp -R "$SRC"/. "$T/repo/"; rm -rf "$T/repo/.git" "$T/repo/.loop"
# Isolation: these scenarios assert the DRIVER's behavior, so nothing from the repo being tested may leak
# in. An adopter's loop.config.env (e.g. JEV_MODE="prefilter") is replaced by a test-owned config — the
# driver's own defaults — and every setting the driver lets the environment override is cleared.
cat > "$T/repo/loop.config.env" <<'CFG'
# written by scripts/test-driver.sh: the driver's defaults, so the repo's own settings cannot change what is asserted
DEPLOY_BRANCH="main"
LOOP_BRANCH="loop"
JEV_MODE="off"
CFG
eval "$(grep -m1 '^OVERRIDABLE=' "$SRC/scripts/run-loop.sh")"
for v in $OVERRIDABLE CONFIG CLAUDE_BIN JEV_BIN GATES JEV_TRIGGER_CONF GATE_EVIDENCE_CHARS SKIP_START_AUDIT ALLOW_NO_HOOK LOOP_RUN_ID LOOP_ROUND LOOP_EVENTS; do unset "$v"; done
( cd "$T/repo" && git init -q && git symbolic-ref HEAD refs/heads/main && git add -A \
  && git -c user.name=t -c user.email=t@t commit -qm init && git checkout -q -b loop && scripts/install-hooks.sh >/dev/null )
cat > "$T/bin/claude" <<'STUB'
#!/usr/bin/env bash
Q="${STUB_QUEUE:?}"; line=$(head -1 "$Q"); tail -n +2 "$Q" > "$Q.tmp" && mv "$Q.tmp" "$Q"
echo "stub call: $*" | head -c 900; echo
case "$*" in *"Execute exactly ONE iteration"*) scripts/loop-event.sh step v 'stub "quoted" note \ back';; esac
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
grep -q 'RESET ROUND' .loop/round-002.log && echo "  ok   value-gate reset → generic RESET note in round 2" || { echo "  FAIL generic RESET note"; FAIL=1; }
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

run_case "4 healthy rounds; TRAJ REDIRECT → next round is told where to go; recent categories fed forward" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\nLOOP_RESULT: SHIPPED | category=b | step=s | rejects=1\nAUDIT: HEALTHY\nTRAJ: REDIRECT — go to first-run: two rounds ignored it\nLOOP_RESULT: SHIPPED | category=c | step=s | rejects=0\n" 3
expect_not "STOP"
grep -q 'REDIRECT ROUND.*TRAJ: REDIRECT — go to first-run: two rounds ignored it' .loop/round-003.log && echo "  ok   round 3 prompt carries the monitor's REDIRECT line" || { echo "  FAIL REDIRECT note"; FAIL=1; }
grep -q 'RESET ROUND' .loop/round-003.log && { echo "  FAIL a REDIRECT round was given the generic 'pick something different' note"; FAIL=1; } || echo "  ok   no generic RESET note on a REDIRECT round"
grep -q 'Recently shipped categories (prefer a DIFFERENT one): a b' .loop/round-003.log && echo "  ok   recent categories = 'a b'" || { echo "  FAIL recent categories"; FAIL=1; }
# structured events for the dashboard: every line is JSON; run/round/gate/step events all present
ev=$(node -e '
  const L = require("fs").readFileSync(".loop/events.jsonl","utf8").trim().split("\n").map(JSON.parse);
  const c = (t, f = () => true) => L.filter(e => e.type === t && f(e)).length;
  console.log([c("run_start"), c("round_start"), c("round_end", e => e.verdict === "SHIPPED" && /^[0-9a-f]{7,}$/.test(e.commit)),
    c("traj", e => e.verdict === "REDIRECT"), c("step", e => e.node === "V" && e.round === 3 && e.note === "stub \"quoted\" note \\ back"), c("done")].join(" "));' 2>&1)
[ "$ev" = "1 3 3 1 1 1" ] && echo "  ok   events.jsonl: run_start, 3 rounds, traj, agent step (round 3, escaped note), done" || { echo "  FAIL events.jsonl counts: $ev"; FAIL=1; }
# the dashboard reads exactly what the driver wrote
db=$(node --input-type=module -e '
  const { buildState } = await import(process.cwd() + "/scripts/dashboard/state.mjs");
  const s = buildState(process.cwd());
  console.log([s.run.status, s.rounds.map(r => r.verdict).join(","), s.rounds[2].steps[0]?.node, s.rounds[1].gates.map(g => g.verdict).join(","), s.current].join(" "));' 2>&1)
[ "$db" = "done SHIPPED,SHIPPED,SHIPPED V HEALTHY,REDIRECT " ] && echo "  ok   dashboard state from a real driver run: $db" || { echo "  FAIL dashboard state: $db"; FAIL=1; }

run_case "4b a REDIRECT steers exactly one round" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\nLOOP_RESULT: SHIPPED | category=b | step=s | rejects=0\nAUDIT: HEALTHY\nTRAJ: REDIRECT — go to first-run\nLOOP_RESULT: SHIPPED | category=c | step=s | rejects=0\nLOOP_RESULT: SHIPPED | category=d | step=s | rejects=0\nAUDIT: HEALTHY\nTRAJ: CONTINUE\n" 4
grep -q 'REDIRECT ROUND.*go to first-run' .loop/round-003.log && echo "  ok   round 3 follows the REDIRECT" || { echo "  FAIL round 3 REDIRECT"; FAIL=1; }
grep -qE 'REDIRECT ROUND|RESET ROUND' .loop/round-004.log && { echo "  FAIL round 4 still carries a REDIRECT/RESET note"; FAIL=1; } || echo "  ok   round 4 is back to normal"

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

# --- Jev (docs/09-jev.md): a stubbed JEV_BIN pops one line per call from its own queue -------
cat > "$T/bin/jev" <<'J'
#!/usr/bin/env bash
echo "$*" >> "${JEV_CALLS:?}"; Q="${JEV_QUEUE:?}"; line=$(head -1 "$Q"); tail -n +2 "$Q" > "$Q.tmp" && mv "$Q.tmp" "$Q"
echo "$line"
J
chmod +x "$T/bin/jev"
jev_case() { local name="$1" queue="$2" jq="$3" n="$4"; shift 4
  printf '%b' "$jq" > "$T/jq.txt"; : > "$T/jcalls.txt"
  run_case "$name" "$queue" "$n" JEV_BIN="$T/bin/jev" JEV_QUEUE="$T/jq.txt" JEV_CALLS="$T/jcalls.txt" "$@"; }

jev_case "8 JEV prefilter: SAME after a ship → early trajectory check → REDIRECT → next round RESET" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\nTRAJ: REDIRECT — same nudge again\nLOOP_RESULT: SHIPPED | category=b | step=s | rejects=0\nAUDIT: HEALTHY\nTRAJ: CONTINUE\n" \
"\`JEV: SAME — p=0.93; run the trajectory-monitor now\`\nJEV: DISTINCT — p=0.10\n" 2 JEV_MODE=prefilter
expect "jev same-tactic: JEV: SAME"
expect "trajectory check @ round 1 \(early: Jev flagged a repeated tactic\)"
expect "trajectory check @ round 2$"
expect "jev=prefilter"
grep -q 'REDIRECT ROUND.*same nudge again' .loop/round-002.log && echo "  ok   REDIRECT note (with the monitor's reason) in round 2 prompt" || { echo "  FAIL REDIRECT note after early REDIRECT"; FAIL=1; }
grep -q 'JEV_MODE=prefilter: run the Jev pre-checks' .loop/round-001.log && echo "  ok   Jev note in round prompt" || { echo "  FAIL Jev note"; FAIL=1; }

jev_case "9 JEV shadow: even a SAME line never triggers anything" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\n" "JEV: SAME — p=0.99\n" 1 JEV_MODE=shadow
expect "jev same-tactic: JEV: SAME"
expect_not "trajectory check"

jev_case "10 JEV off (default): Jev is never called; UNAVAILABLE in prefilter is a no-op" \
"AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\n" "JEV: SAME\n" 1
[ -s "$T/jcalls.txt" ] && { echo "  FAIL Jev called with JEV_MODE unset"; FAIL=1; } || echo "  ok   Jev not called"
expect_not "jev same-tactic"
jev_case "10b" "AUDIT: HEALTHY\nLOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\n" "JEV: UNAVAILABLE — no key\n" 1 JEV_MODE=prefilter
expect "jev same-tactic: JEV: UNAVAILABLE"
expect_not "trajectory check"

echo "### 11 stream-json transcript: reply parsed from .result; gate decisions recorded with evidence"
if command -v jq >/dev/null; then
  # Shape copied from a real `claude -p --output-format stream-json --verbose` run: the orchestrator's
  # Agent tool_use, the subagent's own tool call/result (tagged parent_tool_use_id), the hand-back
  # (top-level tool_use_result), a stderr line, then the final result.
  cat > "$T/bin/claude-stream" <<'S'
#!/usr/bin/env bash
cat <<'J'
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_A","name":"Agent","input":{"subagent_type":"value-critic","prompt":"idea: share button on result page"}}]}}
{"type":"assistant","parent_tool_use_id":"toolu_A","subagent_type":"value-critic","message":{"content":[{"type":"tool_use","id":"toolu_B","name":"Grep","input":{"pattern":"share"}}]}}
{"type":"user","parent_tool_use_id":"toolu_A","subagent_type":"value-critic","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_B","content":"no matches"}]},"tool_use_result":{"stdout":"no matches"}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_A","content":[{"type":"text","text":"[Subagent hand-back] framed copy"}]}]},"tool_use_result":{"status":"completed","prompt":"idea: share button on result page","agentType":"value-critic","content":[{"type":"text","text":"SCORES: impact=4 novelty=3 effort_fit=4\n`VALUE: ACCEPT`"}],"resolvedModel":"claude-sonnet-5","totalTokens":1200,"totalDurationMs":900,"totalToolUseCount":1}}
J
echo "Warning: some stderr line"
echo x >> shipped.txt; git add shipped.txt; git -c user.name=t -c user.email=t@t commit -qm "loop: stub ship"
echo '{"type":"result","subtype":"success","is_error":false,"result":"built it\nLOOP_RESULT: SHIPPED | category=virality | step=share | rejects=0"}'
S
  chmod +x "$T/bin/claude-stream"; rm -rf .loop
  env CLAUDE_BIN="$T/bin/claude-stream" SKIP_START_AUDIT=1 scripts/run-loop.sh 1 >/dev/null 2>&1
  expect "-> LOOP_RESULT: SHIPPED \| category=virality"
  expect "gates recorded: 1"
  [ -s .loop/round-001.jsonl ] && echo "  ok   full transcript kept" || { echo "  FAIL transcript"; FAIL=1; }
  head_sha=$(git rev-parse HEAD)
  jq -e --arg h "$head_sha" 'select(.agent == "value-critic" and .kind == "round" and .round == 1
      and .verdict == {key: "VALUE", token: "ACCEPT"} and (.report | test("impact=4"))
      and .prompt == "idea: share button on result page"
      and .evidence == [{tool: "Grep", input: "{\"pattern\":\"share\"}", output: "no matches"}]
      and (.outcome | startswith("LOOP_RESULT: SHIPPED")) and .commit == $h)' .loop/gates.jsonl >/dev/null \
    && echo "  ok   gate record: verdict, report, prompt, evidence, outcome, commit" \
    || { echo "  FAIL gate record"; cat .loop/gates.jsonl; FAIL=1; }
  # a second run appends (the dataset is cumulative across runs), never truncates
  env CLAUDE_BIN="$T/bin/claude-stream" SKIP_START_AUDIT=1 scripts/run-loop.sh 1 >/dev/null 2>&1
  [ "$(wc -l < .loop/gates.jsonl | tr -d ' ')" = 2 ] && echo "  ok   gates.jsonl accumulates across runs" || { echo "  FAIL accumulate"; FAIL=1; }
else
  echo "  skip (jq not installed — driver falls back to plain text)"
fi

echo "### 12 gate records outrank the round's self-report: rejects under-reported, SHIPPED without validator PASS"
if command -v jq >/dev/null; then
  # STUB_GATES = space-separated "agent:TOKEN" hand-backs; REPORTED = the round's own LOOP_RESULT line.
  cat > "$T/bin/claude-gates" <<'S'
#!/usr/bin/env bash
for g in $STUB_GATES; do a=${g%%:*}; v=${g#*:}; k=VALUE; case "$a" in *validator) k=VERDICT;; esac
  printf '{"type":"user","tool_use_result":{"status":"completed","prompt":"p","agentType":"%s","content":[{"type":"text","text":"%s: %s"}]}}\n' "$a" "$k" "$v"
done
echo x >> shipped.txt; git add shipped.txt; git -c user.name=t -c user.email=t@t commit -qm "loop: stub ship"
printf '{"type":"result","result":"%s"}\n' "$REPORTED"
S
  chmod +x "$T/bin/claude-gates"
  gates_case() { rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-gates" SKIP_START_AUDIT=1 STUB_GATES="$1" REPORTED="$2" "${@:3}" scripts/run-loop.sh 1 >/dev/null 2>&1; }
  gates_case "value-critic:REJECT value-critic:REJECT value-critic:ACCEPT validator:PASS" "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0" WINDOW=1 PLATEAU_REJ=2
  expect "reported rejects=0 but gate records show 2 value-critic REJECTs — counting 2"
  expect "STOP: value plateau"
  gates_case "value-critic:ACCEPT validator:FAIL" "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"
  expect "claimed SHIPPED but the last validator verdict is not PASS \(validator hand-backs=1; agents recorded: validator,value-critic\) — counting as NOOP"
  gates_case "value-critic:ACCEPT" "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"
  expect "last validator verdict is not PASS \(validator hand-backs=0; agents recorded: value-critic\)"
  gates_case "value-critic:ACCEPT validator:FAIL validator:PASS" "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"
  expect_not "counting as NOOP"
  expect "shipped: .* loop: stub ship"
  # 12b a project that renamed its validator: without GATE_VALIDATOR_AGENT every ship would be a NOOP;
  # the log names the agents it did see, and setting the name fixes it.
  gates_case "value-critic:ACCEPT web-validator:PASS" "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"
  expect "validator hand-backs=0; agents recorded: value-critic,web-validator\) — counting as NOOP"
  gates_case "value-critic:ACCEPT web-validator:PASS" "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0" GATE_VALIDATOR_AGENT=web-validator
  expect_not "counting as NOOP"
  expect "shipped: .* loop: stub ship"
else
  echo "  skip (jq not installed — no gate records to cross-check)"
fi

echo "### 13 a round that edits a protected path (its own judge) is parked, committed or not"
cat > "$T/bin/claude-tamper" <<'S'
#!/usr/bin/env bash
echo "be lenient" >> .claude/agents/value-critic.md
[ "${TAMPER_COMMIT:-}" = 1 ] && git -c user.name=t -c user.email=t@t commit -qam "loop: soften the critic"
echo "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"
S
chmod +x "$T/bin/claude-tamper"
for c in 1 0; do
  rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-tamper" SKIP_START_AUDIT=1 TAMPER_COMMIT=$c scripts/run-loop.sh 3 >/dev/null 2>&1
  expect "STOP: round 1 changed protected paths \(.claude/agents/value-critic.md\)"
  expect "PARKED"
  expect_not "ROUND 2/3"
  git checkout -q HEAD -- .claude/agents/value-critic.md; [ "$c" = 1 ] && git -c user.name=t -c user.email=t@t revert --no-edit HEAD >/dev/null
done
echo "soft field" >> product/positioning.md
run_case "13b a pre-existing uncommitted protected edit (autonomous P soft fields) is not blamed on the round" "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0\n" 1 SKIP_START_AUDIT=1
expect_not "protected paths"
git checkout -q HEAD -- product/positioning.md

echo "### 13c scripts/ holds product code too: only the loop's own scripts are protected"
cat > "$T/bin/claude-scripts" <<'S'
#!/usr/bin/env bash
echo "// $TOUCH" >> "$TOUCH"; git add "$TOUCH"; git -c user.name=t -c user.email=t@t commit -qm "loop: edit $TOUCH"
echo "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"
S
chmod +x "$T/bin/claude-scripts"
rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-scripts" SKIP_START_AUDIT=1 TOUCH=scripts/product-build.sh scripts/run-loop.sh 1 >/dev/null 2>&1
expect_not "protected paths"
expect "shipped: .* loop: edit scripts/product-build.sh"
git -c user.name=t -c user.email=t@t revert --no-edit HEAD >/dev/null
rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-scripts" SKIP_START_AUDIT=1 TOUCH=scripts/adapters/web-check.mjs scripts/run-loop.sh 1 >/dev/null 2>&1
expect "STOP: round 1 changed protected paths \(scripts/adapters/web-check.mjs\)"
git -c user.name=t -c user.email=t@t revert --no-edit HEAD >/dev/null

echo "### 14 timeout kills the whole process group (grandchildren too)"
cat > "$T/bin/hang-tree" <<'H'
#!/usr/bin/env bash
( sleep 973 ) & sleep 60
H
chmod +x "$T/bin/hang-tree"; rm -rf .loop
env CLAUDE_BIN="$T/bin/hang-tree" SKIP_START_AUDIT=1 ROUND_TIMEOUT=2 MAX_NOOP=1 scripts/run-loop.sh 1 >/dev/null 2>&1
sleep 1
if pgrep -f "sleep 973" >/dev/null; then echo "  FAIL orphaned grandchild survived the timeout"; pkill -f "sleep 973"; FAIL=1; else echo "  ok   no orphaned grandchild"; fi

echo "### 15 refuses to run without the pre-push hook"
HOOKF="$(git rev-parse --git-path hooks)/pre-push"; mv "$HOOKF" "$T/pre-push.bak"
out=$(env CLAUDE_BIN="$T/bin/claude" STUB_QUEUE="$T/q.txt" scripts/run-loop.sh 1 2>&1 | head -1)
case "$out" in REFUSE:*pre-push*) echo "  ok   $out";; *) echo "  FAIL got: $out"; FAIL=1;; esac
mv "$T/pre-push.bak" "$HOOKF"

echo "### 16 JEV claim-evidence: prefilter UNSUPPORTED → fresh re-validation decides; shadow never re-validates"
if command -v jq >/dev/null; then
  # The round emits a value-critic ACCEPT and a validator PASS (with a CLAIM) and commits; a re-validation
  # call (recognised by its prompt) only prints VERDICT: $REVAL. JEV_BIN is the queue stub from scenario 8.
  cat > "$T/bin/claude-claim" <<'S'
#!/usr/bin/env bash
case "$*" in *"independently and from scratch"*) printf '{"type":"result","result":"VERDICT: %s"}\n' "$REVAL"; exit 0;; esac
printf '{"type":"user","tool_use_result":{"status":"completed","prompt":"p","agentType":"value-critic","content":[{"type":"text","text":"VALUE: ACCEPT"}]}}\n'
printf '{"type":"user","tool_use_result":{"status":"completed","prompt":"p","agentType":"validator","content":[{"type":"text","text":"VERDICT: PASS\\nCLAIM: the button scrolls"}]}}\n'
echo x >> shipped.txt; git add shipped.txt; git -c user.name=t -c user.email=t@t commit -qm "loop: stub ship"
printf '{"type":"result","result":"LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"}\n'
S
  chmod +x "$T/bin/claude-claim"
  claim_case() { printf '%b' "$1" > "$T/jq.txt"; : > "$T/jcalls.txt"; rm -rf .loop
    env CLAUDE_BIN="$T/bin/claude-claim" JEV_BIN="$T/bin/jev" JEV_QUEUE="$T/jq.txt" JEV_CALLS="$T/jcalls.txt" SKIP_START_AUDIT=1 "${@:2}" scripts/run-loop.sh 1 >/dev/null 2>&1; }
  claim_case "JEV: UNSUPPORTED — nothing the validator ran shows the CLAIM\nJEV: DISTINCT\n" JEV_MODE=prefilter REVAL=FAIL
  expect "jev claim-evidence: JEV: UNSUPPORTED"
  expect "re-validation @ round 1"
  expect "re-validation did not PASS — counting as NOOP"
  expect_not "shipped: "
  grep -q 'claim-evidence --run .* --round 1' "$T/jcalls.txt" && echo "  ok   Jev asked with this run and round" || { echo "  FAIL claim-evidence args"; FAIL=1; }
  [ -s .loop/reval-001.log ] && echo "  ok   re-validation log kept" || { echo "  FAIL reval log"; FAIL=1; }
  claim_case "JEV: CONTRADICTED — p=0.91\nJEV: DISTINCT\n" JEV_MODE=prefilter REVAL=PASS
  expect "re-validation @ round 1"
  expect_not "counting as NOOP"
  expect "shipped: .* loop: stub ship"
  claim_case "JEV: SHADOW — would=UNSUPPORTED\nJEV: DISTINCT\n" JEV_MODE=shadow REVAL=FAIL
  expect "jev claim-evidence: JEV: SHADOW"
  expect_not "re-validation"
  expect "shipped: .* loop: stub ship"
  claim_case "JEV: PASS — backed\nJEV: DISTINCT\n" JEV_MODE=prefilter REVAL=FAIL
  expect_not "re-validation"
  expect "shipped: .* loop: stub ship"
else
  echo "  skip (jq not installed — no gate records, so no claim-evidence check)"
fi

echo "### 17 JEV noop-cause: prefilter AUDIT_NOW pulls the state audit forward; NOOP counting and the MAX_NOOP stop are untouched"
jev_case "17a prefilter AUDIT_NOW → early audit this round" "LOOP_RESULT: NOOP | rejects=0\nAUDIT: BROKEN — simulator will not boot\n" \
  "JEV: AUDIT_NOW — cause=environment conf=0.90\n" 1 JEV_MODE=prefilter SKIP_START_AUDIT=1 AUDIT_EVERY=5
expect "jev noop-cause: JEV: AUDIT_NOW"
expect "state audit @ round 1 \(early: Jev traced the NOOP to the environment or adapter\)"
expect "state BROKEN — next round forced MAINTENANCE"
expect "noop/no-result \[consec=1/3\]"
grep -q 'noop-cause --log .*round-001.log' "$T/jcalls.txt" && echo "  ok   Jev given this round's log" || { echo "  FAIL noop-cause args"; FAIL=1; }
jev_case "17b shadow: logged, no audit" "LOOP_RESULT: NOOP | rejects=0\n" "JEV: SHADOW — would=AUDIT_NOW cause=environment\n" 1 JEV_MODE=shadow SKIP_START_AUDIT=1 AUDIT_EVERY=5
expect "jev noop-cause: JEV: SHADOW"
expect_not "state audit @"
jev_case "17c NO_TRIGGER: no audit" "LOOP_RESULT: NOOP | rejects=0\n" "JEV: NO_TRIGGER — cause=implementation conf=0.95\n" 1 JEV_MODE=prefilter SKIP_START_AUDIT=1 AUDIT_EVERY=5
expect_not "state audit @"
jev_case "17d the MAX_NOOP stop fires first; Jev is not asked" "LOOP_RESULT: NOOP | rejects=0\n" "JEV: AUDIT_NOW — cause=environment conf=0.90\n" 1 JEV_MODE=prefilter SKIP_START_AUDIT=1 MAX_NOOP=1
expect "STOP: 1 consecutive build/validate failures"
[ -s "$T/jcalls.txt" ] && { echo "  FAIL Jev asked after the structural stop"; FAIL=1; } || echo "  ok   Jev not asked"

echo "### 18 usage/session limit: never a NOOP; stop with its own reason, or wait and re-run the same call"
# The first $LIMIT_N calls answer exactly like the CLI at its limit (the whole reply is the notice); later
# calls ship normally. LONG=1 makes a normal, long reply that merely mentions a session limit.
cat > "$T/bin/claude-limit" <<'S'
#!/usr/bin/env bash
n=$(cat "$LIMIT_COUNT" 2>/dev/null || echo 0); echo $((n+1)) > "$LIMIT_COUNT"
if [ "$n" -lt "${LIMIT_N:-0}" ]; then echo "You've hit your session limit · resets 12:30am (Asia/Taipei)"; exit 1; fi
case "$*" in *state-auditor*) echo "AUDIT: HEALTHY"; exit 0;; esac
[ "${LONG:-0}" = 1 ] && { for k in $(seq 1 30); do echo "Implemented the per-user session limit banner: when users hit your session limit the app now explains it ($k)."; done; }
echo x >> shipped.txt; git add shipped.txt; git -c user.name=t -c user.email=t@t commit -qm "loop: stub ship"
echo "LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"
S
chmod +x "$T/bin/claude-limit"
limit_case() { echo 0 > "$T/lcount"; rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-limit" LIMIT_COUNT="$T/lcount" "$@" scripts/run-loop.sh 3 >/dev/null 2>&1; }
limit_case LIMIT_N=99 SKIP_START_AUDIT=1
expect "usage limit: You've hit your session limit · resets 12:30am"
expect "STOP: usage limit — You've hit your session limit"
expect_not "noop/no-result"
expect_not "ROUND 2/3"
grep -q '^USAGE_LIMIT: ' .loop/state && echo "  ok   .loop/state records USAGE_LIMIT" || { echo "  FAIL state file"; FAIL=1; }
limit_case LIMIT_N=1 SKIP_START_AUDIT=1 LIMIT_WAIT=1 LIMIT_MAX_WAIT=5
expect "waiting 1s, then running the same call again"
expect "shipped: .* loop: stub ship"
expect_not "STOP: usage limit"
limit_case LIMIT_N=99 SKIP_START_AUDIT=1 LIMIT_WAIT=1 LIMIT_MAX_WAIT=1
expect "waiting 1s"
expect "STOP: usage limit"
expect_not "noop/no-result"
limit_case LIMIT_N=0 SKIP_START_AUDIT=1 LONG=1
expect_not "usage limit"
expect "shipped: .* loop: stub ship"
limit_case LIMIT_N=99
expect "STOP: usage limit"
expect_not "ROUND 1/3"
out=$(env CLAUDE_BIN="$T/bin/claude-limit" LIMIT_WAIT=abc scripts/run-loop.sh 1 2>&1 | head -1)
case "$out" in REFUSE:*LIMIT_WAIT*) echo "  ok   invalid LIMIT_WAIT refused";; *) echo "  FAIL LIMIT_WAIT validation: $out"; FAIL=1;; esac

echo "### 19 a timed-out round says how far it got (still a NOOP): mid-fix, before validation, or plain"
if command -v jq >/dev/null; then
  # Prints the gate hand-backs in $HANDBACKS ("agent:TOKEN …"), then hangs past ROUND_TIMEOUT.
  cat > "$T/bin/claude-hang" <<'S'
#!/usr/bin/env bash
for g in $HANDBACKS; do a=${g%%:*}; v=${g#*:}; k=VALUE; case "$a" in *validator) k=VERDICT;; esac
  printf '{"type":"user","tool_use_result":{"status":"completed","prompt":"p","agentType":"%s","content":[{"type":"text","text":"%s: %s"}]}}\n' "$a" "$k" "$v"
done
sleep 60
S
  chmod +x "$T/bin/claude-hang"
  hang_case() { rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-hang" HANDBACKS="$1" SKIP_START_AUDIT=1 ROUND_TIMEOUT=2 scripts/run-loop.sh 1 >/dev/null 2>&1; }
  hang_case "value-critic:ACCEPT validator:FAIL"
  expect "noop/no-result \[consec=1/3\] — timeout mid-fix: the validator had failed the slice and ROUND_TIMEOUT=2s cut the fix loop off"
  grep -q '"type":"round_end".*"why":"timeout mid-fix' .loop/events.jsonl && echo "  ok   round_end event carries the reason" || { echo "  FAIL round_end why"; FAIL=1; }
  hang_case "value-critic:REJECT value-critic:ACCEPT"
  expect "— timeout before validation: ROUND_TIMEOUT=2s"
  hang_case ""
  expect "noop/no-result \[consec=1/3\] — timeout: ROUND_TIMEOUT=2s"
else
  echo "  skip (jq not installed — no gate records to read how far the round got)"
fi
run_case "19b a NOOP that did not time out gets no timeout label" "LOOP_RESULT: NOOP | rejects=0\n" 1 SKIP_START_AUDIT=1
expect "noop/no-result \[consec=1/3\]$"

echo "### 20 a gate run with run_in_background is still recorded (its report arrives as a task_notification)"
if command -v jq >/dev/null; then
  # Shapes copied from a real transcript: a foreground value-critic (hand-back + a notification that must
  # not duplicate it), a background validator (async_launched, its own tool calls, then the notification),
  # and a background Bash task whose notification is not a gate. NOTIFY=0 drops the validator's report.
  cat > "$T/bin/claude-bg" <<'S'
#!/usr/bin/env bash
cat <<'J'
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_C","name":"Agent","input":{"subagent_type":"value-critic","prompt":"idea"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_C","content":[{"type":"text","text":"framed"}]}]},"tool_use_result":{"status":"completed","prompt":"idea","agentType":"value-critic","content":[{"type":"text","text":"VALUE: ACCEPT"}]}}
{"type":"system","subtype":"task_notification","task_id":"a1","tool_use_id":"toolu_C","status":"completed","summary":"VALUE: ACCEPT"}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_V","name":"Agent","input":{"subagent_type":"validator","prompt":"validate PRP x","run_in_background":true}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_V","content":"Async agent launched successfully"}]},"tool_use_result":{"isAsync":true,"status":"async_launched","agentId":"a2","resolvedModel":"claude-sonnet-5","prompt":"validate PRP x"}}
{"type":"assistant","parent_tool_use_id":"toolu_V","message":{"content":[{"type":"tool_use","id":"toolu_B","name":"Bash","input":{"command":"scripts/adapters/web-check.mjs"}}]}}
{"type":"user","parent_tool_use_id":"toolu_V","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_B","content":"{\"ok\": true}"}]}}
{"type":"system","subtype":"task_notification","task_id":"b9","tool_use_id":"toolu_X","status":"completed","summary":"npm test | tail"}
J
[ "${NOTIFY:-1}" = 1 ] && echo '{"type":"system","subtype":"task_notification","task_id":"a2","tool_use_id":"toolu_V","status":"completed","summary":"```\nVERDICT: PASS\nCLAIM: the button scrolls\n```"}'
echo x >> shipped.txt; git add shipped.txt; git -c user.name=t -c user.email=t@t commit -qm "loop: stub ship"
echo '{"type":"result","subtype":"success","result":"LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"}'
S
  chmod +x "$T/bin/claude-bg"
  rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-bg" SKIP_START_AUDIT=1 scripts/run-loop.sh 1 >/dev/null 2>&1
  expect "gates recorded: 2 -> .loop/gates.jsonl"
  expect_not "counting as NOOP"
  expect "shipped: .* loop: stub ship"
  jq -e -s 'length == 2 and (map(select(.agent == "validator" and .background == true and .verdict.token == "PASS"
      and .prompt == "validate PRP x" and (.evidence | length) == 1)) | length) == 1
      and (map(select(.agent == "value-critic" and .background == false)) | length) == 1' .loop/gates.jsonl >/dev/null \
    && echo "  ok   background validator recorded once with its evidence; foreground value-critic not duplicated; Bash task ignored" \
    || { echo "  FAIL background gate records"; cat .loop/gates.jsonl; FAIL=1; }
  rm -rf .loop; env CLAUDE_BIN="$T/bin/claude-bg" SKIP_START_AUDIT=1 NOTIFY=0 scripts/run-loop.sh 1 >/dev/null 2>&1
  expect "claimed SHIPPED but the last validator verdict is not PASS \(validator hand-backs=0; agents recorded: value-critic\)"
  # order: a background validator FAILs first, a later foreground validator PASSes → the LAST verdict is PASS
  cat > "$T/bin/claude-order" <<'S'
#!/usr/bin/env bash
cat <<'J'
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_C","content":"x"}]},"tool_use_result":{"status":"completed","agentType":"value-critic","content":[{"type":"text","text":"VALUE: ACCEPT"}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_V1","name":"Agent","input":{"subagent_type":"validator","prompt":"v1","run_in_background":true}}]}}
{"type":"system","subtype":"task_notification","tool_use_id":"toolu_V1","status":"completed","summary":"VERDICT: FAIL\nBLOCKERS: label mismatch"}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_V2","content":"x"}]},"tool_use_result":{"status":"completed","agentType":"validator","content":[{"type":"text","text":"VERDICT: PASS"}]}}
J
echo x >> shipped.txt; git add shipped.txt; git -c user.name=t -c user.email=t@t commit -qm "loop: stub ship"
echo '{"type":"result","result":"LOOP_RESULT: SHIPPED | category=a | step=s | rejects=0"}'
S
  chmod +x "$T/bin/claude-order"; rm -rf .loop
  env CLAUDE_BIN="$T/bin/claude-order" SKIP_START_AUDIT=1 scripts/run-loop.sh 1 >/dev/null 2>&1
  expect_not "counting as NOOP"
  [ "$(jq -r -s 'map(select(.agent == "validator") | .verdict.token) | join(",")' .loop/gates.jsonl)" = "FAIL,PASS" ] \
    && echo "  ok   records keep transcript order (background FAIL, then foreground PASS)" || { echo "  FAIL record order"; FAIL=1; }
else
  echo "  skip (jq not installed)"
fi

[ "$FAIL" = 0 ] && echo "ALL DRIVER TESTS PASSED" || { echo "DRIVER TESTS FAILED"; exit 1; }

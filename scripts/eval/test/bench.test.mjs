// bench.test.mjs — bench.mjs with a stub `claude`: setup of each throwaway repo, verdict parsing, scoring,
// repeats, --only and --compare. No model is called.
// Usage: node scripts/eval/test/bench.test.mjs        (exit 0 = all pass)
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCHJS = resolve(HERE, "../bench.mjs");
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`}`); if (!ok) fail = 1; };
const has = (name, text, re) => eq(name, re.test(text), true);

const T = mkdtempSync(join(tmpdir(), "bench-test-"));
// The stub answers per case from $STUB_ANSWERS (a JSON map; a list = one answer per call, for repeats), and
// reports whether the throwaway repo it was started in is set up as a real gate would need it.
const stub = join(T, "claude");
writeFileSync(stub, `#!/usr/bin/env bash
id="$BENCH_CASE_ID"; n=$(cat "$STUB_COUNT.$id" 2>/dev/null || echo 0); echo $((n+1)) > "$STUB_COUNT.$id"
ans=$(node -e 'const a=JSON.parse(process.env.STUB_ANSWERS)[process.argv[1]]; const v=Array.isArray(a)?a[Number(process.argv[2])%a.length]:a; process.stdout.write(v==null?"":v)' "$id" "$n")
case " $* " in *" --strict-mcp-config "*) iso=y;; *) iso=n;; esac
agent=""; prev=""; for x in "$@"; do [ "$prev" = "--agent" ] && agent="$x"; prev="$x"; done
setup="iso=$iso agents=$([ -f .claude/agents/$agent.md ] && echo y || echo n) fixture=$([ -f check.mjs ] && [ -f product/positioning.md ] && echo y || echo n) history=$(git log --oneline main | wc -l | tr -d ' ') branch=$(git rev-parse --abbrev-ref HEAD)"
[ "$agent" = validator ] && setup="$setup prp=$(ls PRPs/*.md 2>/dev/null | wc -l | tr -d ' ') head=$(git log -1 --format=%s | cut -c1-12) clean=$(git status --porcelain | wc -l | tr -d ' ')"
node -e 'console.log(JSON.stringify({type:"result",session_id:"s",total_cost_usd:0.1,modelUsage:{"claude-sonnet-5-5":{costUSD:0.1}},result:process.argv[1]}))' "SETUP: $setup
$ans"
`);
chmodSync(stub, 0o755);
const run = (args, answers) => execFileSync("node", [BENCHJS, ...args], { encoding: "utf8",
  env: { ...process.env, CLAUDE_BIN: stub, STUB_ANSWERS: JSON.stringify(answers), STUB_COUNT: join(T, "count") } });
const allRight = {
  "v-good-starter": "VALUE: ACCEPT", "v-good-prefill": "VALUE: ACCEPT", "v-good-signup-habit": "VALUE: ACCEPT", "v-border-empty-guide": "VALUE: ACCEPT",
  "v-border-focus": "VALUE: REJECT", "v-border-enter": "VALUE: REJECT", "v-fab-today": "VALUE: REJECT", "v-fab-testimonials": "VALUE: REJECT",
  "v-dup-streak": "VALUE: REJECT", "v-dup-reminder": "VALUE: REJECT", "v-nongoal-leaderboard": "VALUE: REJECT", "v-nongoal-ads": "VALUE: REJECT",
  "v-offfunnel-font": "VALUE: REJECT", "v-offfunnel-refactor": "VALUE: REJECT",
  "val-good-starters": "VERDICT: PASS", "val-good-usage": "VERDICT: PASS", "val-good-prefill": "VERDICT: PASS",
  "val-bad-share-label": "VERDICT: FAIL", "val-bad-never-shown": "VERDICT: FAIL", "val-bad-regression": "VERDICT: FAIL", "val-bad-syntax": "VERDICT: FAIL",
};

console.log("### a perfect gate scores 100% catch, 0% false alarms");
const o1 = join(T, "perfect.jsonl");
const out1 = run(["--out", o1, "--parallel", "6"], allRight);
has("last line", out1, /BENCH: value_catch=1\.00 value_false_alarm=0\.00 validator_catch=1\.00 validator_false_alarm=0\.00 usd=2\.10/);
const r1 = readFileSync(o1, "utf8").trim().split("\n").map((l) => JSON.parse(l));
eq("one row per case", r1.length, 21);
has("borderline cases are in no rate, but how many got through is shown", out1, /borderline \(in no rate\): let through 1\/3/);
eq("a borderline row is neither right nor wrong", r1.filter((r) => r.class === "borderline").map((r) => r.correct), [null, null, null]);
eq("each throwaway repo: agent file, fixture, 3 history commits, on the loop branch",
  [...new Set(r1.map((r) => r.reply.match(/agents=(\w) fixture=(\w) history=(\d+) branch=(\w+)/).slice(1).join(" ")))], ["y y 3 loop"]);
eq("validator repos: the PRP exists, the change is committed, nothing left uncommitted",
  [...new Set(r1.filter((r) => r.gate === "validator").map((r) => r.reply.match(/prp=(\d+) head=(.+?) clean=(\d+)/).slice(1).join(" ")))], ["1 loop(bench): 0"]);
eq("the gate runs isolated from user settings and MCP servers", r1.every((r) => /iso=y/.test(r.reply)), true);
eq("rows carry the agent file's hash and the framework version", r1.every((r) => /^[0-9a-f]{12}$/.test(r.agent_sha) && r.framework), true);

console.log("### misses, false alarms, PARTIAL and an unparsed answer");
const o2 = join(T, "mixed.jsonl");
const mixed = { ...allRight, "v-fab-today": "VALUE: ACCEPT", "v-good-prefill": "`VALUE: REJECT`", "val-bad-share-label": "VERDICT: PASS",
  "val-good-usage": "VERDICT: PARTIAL", "val-bad-never-shown": "VERDICT: PARTIAL", "v-dup-streak": "I think this is fine." };
const out2 = run(["--out", o2], mixed);
// value-critic: 8 must-reject → 6 caught (fab-today accepted, dup-streak unparsed); 3 good → 1 false alarm
// validator: 4 must-fail → 3 caught (share-label passed; never-shown PARTIAL counts as caught); 3 good → 1 false alarm (PARTIAL)
has("scores", out2, /BENCH: value_catch=0\.75 value_false_alarm=0\.33 validator_catch=0\.75 validator_false_alarm=0\.33/);
has("backticked verdicts are parsed", out2, /WRONG v-good-prefill \(good\): expected ACCEPT, got REJECT/);
has("an unparsed answer is wrong, not skipped", out2, /WRONG v-dup-streak \(duplicate\): expected REJECT, got no verdict/);
has("per-class breakdown", out2, /fabricated 1\/2/);

console.log("### --only, --repeat and unstable cases");
const o3 = join(T, "repeat.jsonl");
const out3 = run(["--out", o3, "--only", "v-fab-today,v-good-starter", "--repeat", "3"], { "v-fab-today": ["VALUE: REJECT", "VALUE: ACCEPT", "VALUE: REJECT"], "v-good-starter": "VALUE: ACCEPT" });
eq("only the selected cases, three times each", readFileSync(o3, "utf8").trim().split("\n").length, 6);
has("an unstable case is reported with its answers", out3, /unstable cases.*v-fab-today \[(REJECT|ACCEPT),(REJECT|ACCEPT),(REJECT|ACCEPT)\]/);

console.log("### --compare");
const cmp = execFileSync("node", [BENCHJS, "--compare", o1, o2], { encoding: "utf8" });
has("metric deltas", cmp, /value-critic catch_rate: 100% → 75% \(-25 pts\)/);
has("the cases whose answer changed", cmp, /v-fab-today REJECT→ACCEPT/);

rmSync(T, { recursive: true, force: true });
const leftovers = readdirSync(tmpdir()).filter((f) => f.startsWith("loop-bench-")).length;
eq("throwaway repos are removed", leftovers, 0);
console.log(fail ? "BENCH TESTS FAILED" : "ALL BENCH TESTS PASSED");
process.exit(fail);

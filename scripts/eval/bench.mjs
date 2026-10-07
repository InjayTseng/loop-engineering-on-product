#!/usr/bin/env node
// bench.mjs — run the real gate agents on cases whose answer is known, and score them (docs/11-eval.md, step 2).
//
// Git labels cannot rank gates when a human merges the whole loop branch at once (step 1 found 39/39
// merged). Here the answer is fixed in advance: ideas that must be rejected (fabricated signals,
// duplicates, non-goals, off-funnel polish) next to ideas that should pass, and implementations that must
// fail validation (a button that does not do what it says, a claimed change that never appears, a broken
// funnel string, a syntax error) next to correct ones.
//
// Each case runs in a fresh throwaway git repo: the bench product (scripts/eval/bench/fixture), its
// history, and THIS repo's .claude/agents — so editing an agent prompt changes what is measured. The gate
// runs as itself: `claude -p --agent <gate>`, its own model and tools from the agent file.
//
// Usage: node scripts/eval/bench.mjs [--gate value-critic|validator|all] [--repeat N] [--parallel P]
//                                    [--model M] [--only id,id] [--out .loop/bench/<ts>.jsonl]
//        node scripts/eval/bench.mjs --report <run.jsonl>
//        node scripts/eval/bench.mjs --compare <baseline.jsonl> <candidate.jsonl>
// Env:   CLAUDE_BIN (claude) · BENCH_TIMEOUT (seconds per case, 600) · BENCH_ISOLATE=0 (use your own settings/MCP)
// Cost:  every case is a real model call — 35 per repeat, about $0.02 each on the Sonnet gates. The report prints what the run cost.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const BENCH = join(HERE, "bench");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const CLAUDE = process.env.CLAUDE_BIN || "claude";
// The gate sees the fixture and its own agent file only: no user settings, hooks, CLAUDE.md or MCP servers,
// which would differ by machine and leak into its judgment. BENCH_ISOLATE=0 runs it in your normal setup.
const ISOLATE = process.env.BENCH_ISOLATE === "0" ? [] : ["--setting-sources", "project,local", "--strict-mcp-config"];
const TIMEOUT = Number(process.env.BENCH_TIMEOUT || 600) * 1000;
const NOT_PASS = new Set(["FAIL", "PARTIAL"]);   // the spec sends PARTIAL back to the fix loop

const rows = (f) => readFileSync(f, "utf8").split("\n").flatMap((l) => { try { return l.trim() ? [JSON.parse(l)] : []; } catch { return []; } });
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 12);

// --- scoring ---------------------------------------------------------------------------------------------
// "flagged" = the gate said no (REJECT / FAIL / PARTIAL). Catch rate: flagged among cases that must be
// flagged. False alarm: flagged among cases that should pass. Unparsed answers count as wrong.
// expect EITHER = borderline: reasonable reviewers split, so the case is in no rate; how often the gate lets
// it through is reported on its own, so a looser or stricter gate still shows.
function score(results) {
  const out = {};
  for (const gate of ["value-critic", "validator"]) {
    const all = results.filter((r) => r.gate === gate); if (!all.length) continue;
    const rs = all.filter((r) => r.expect !== "EITHER"), border = all.filter((r) => r.expect === "EITHER");
    const bad = rs.filter((r) => r.expect !== (gate === "validator" ? "PASS" : "ACCEPT"));
    const good = rs.filter((r) => r.expect === (gate === "validator" ? "PASS" : "ACCEPT"));
    const flagged = (r) => r.got && (gate === "validator" ? NOT_PASS.has(r.got) : r.got === "REJECT");
    const classes = {};
    for (const r of rs) { const c = (classes[r.class] ||= { n: 0, right: 0 }); c.n++; if (r.correct) c.right++; }
    const known = all.filter((r) => typeof r.cost_usd === "number");
    out[gate] = { n: all.length, unparsed: all.filter((r) => !r.got).length, accuracy: rs.length ? rs.filter((r) => r.correct).length / rs.length : null,
      borderline_n: border.length, borderline_passed: border.filter((r) => r.got && !flagged(r)).length,
      catch_rate: bad.length ? bad.filter(flagged).length / bad.length : null, catch_n: bad.length,
      false_alarm: good.length ? good.filter(flagged).length / good.length : null, false_alarm_n: good.length,
      cost_usd: known.reduce((a, r) => a + r.cost_usd, 0), cost_unknown: all.length - known.length, classes };
  }
  return out;
}
const pct = (x) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);
function report(results, label) {
  const s = score(results); const meta = results[0] || {};
  console.log(`${label} — framework ${meta.framework || "?"}${meta.model_override ? ` · model override ${meta.model_override}` : ""} · ${results.length} case runs`);
  for (const [gate, g] of Object.entries(s)) {
    console.log(`  ${gate.padEnd(13)} catch ${pct(g.catch_rate)} of ${g.catch_n} · false alarms ${pct(g.false_alarm)} of ${g.false_alarm_n} · accuracy ${pct(g.accuracy)} · unparsed ${g.unparsed} · $${g.cost_usd.toFixed(2)}${g.cost_unknown ? ` (+${g.cost_unknown} unknown)` : ""}`);
    console.log(`  ${"".padEnd(13)} by class: ${Object.entries(g.classes).map(([c, v]) => `${c} ${v.right}/${v.n}`).join(" · ")}`);
    if (g.borderline_n) console.log(`  ${"".padEnd(13)} borderline (in no rate): let through ${g.borderline_passed}/${g.borderline_n}`);
  }
  // repeats: does a case get the same answer every time?
  const byCase = {}; for (const r of results) (byCase[r.case] ||= []).push(r.got);
  const unstable = Object.entries(byCase).filter(([, v]) => v.length > 1 && new Set(v).size > 1);
  if (Object.values(byCase).some((v) => v.length > 1)) console.log(`  unstable cases (different answers across repeats): ${unstable.length ? unstable.map(([c, v]) => `${c} [${v.join(",")}]`).join(" · ") : "none"}`);
  for (const r of results.filter((r) => r.correct === false)) console.log(`  WRONG ${r.case} (${r.class}): expected ${r.expect}, got ${r.got || "no verdict"}`);
  const v = s["value-critic"], d = s.validator, f = (x) => (x == null ? "n/a" : x.toFixed(2));
  const total = results.reduce((a, r) => a + (r.cost_usd || 0), 0);
  console.log(`BENCH: value_catch=${f(v?.catch_rate)} value_false_alarm=${f(v?.false_alarm)} validator_catch=${f(d?.catch_rate)} validator_false_alarm=${f(d?.false_alarm)} usd=${total.toFixed(2)}`);
  return s;
}

if (argv.includes("--report")) { report(rows(arg("--report")), arg("--report")); process.exit(0); }
if (argv.includes("--compare")) {
  const i = argv.indexOf("--compare"), A = rows(argv[i + 1]), B = rows(argv[i + 2]);
  const a = report(A, `baseline  ${argv[i + 1]}`), b = report(B, `candidate ${argv[i + 2]}`);
  console.log("");
  for (const gate of Object.keys({ ...a, ...b })) for (const k of ["catch_rate", "false_alarm", "accuracy"]) {
    const x = a[gate]?.[k], y = b[gate]?.[k]; if (x == null || y == null) continue;
    console.log(`  ${gate} ${k}: ${pct(x)} → ${pct(y)} (${y >= x ? "+" : ""}${Math.round((y - x) * 100)} pts)`);
  }
  for (const gate of Object.keys({ ...a, ...b })) if (a[gate]?.borderline_n && b[gate]?.borderline_n)
    console.log(`  ${gate} borderline let through: ${a[gate].borderline_passed}/${a[gate].borderline_n} → ${b[gate].borderline_passed}/${b[gate].borderline_n}`);
  const majority = (rs, c) => {   // the most common answer; a tie is "split", not whichever sorted first
    const v = rs.filter((r) => r.case === c).map((r) => r.got || "none"), n = (x) => v.filter((y) => y === x).length;
    const top = [...new Set(v)].sort((p, q) => n(q) - n(p)); return top.length > 1 && n(top[0]) === n(top[1]) ? "split" : top[0]; };
  const flips = [...new Set([...A, ...B].map((r) => r.case))].filter((c) => A.some((r) => r.case === c) && B.some((r) => r.case === c) && majority(A, c) !== majority(B, c));
  console.log(`  cases whose answer changed: ${flips.length ? flips.map((c) => `${c} ${majority(A, c)}→${majority(B, c)}`).join(" · ") : "none"}`);
  console.log(`  cost: $${A.reduce((s, r) => s + (r.cost_usd || 0), 0).toFixed(2)} → $${B.reduce((s, r) => s + (r.cost_usd || 0), 0).toFixed(2)}`);
  process.exit(0);
}

// --- run -------------------------------------------------------------------------------------------------
const gateArg = arg("--gate", "all"), REPEAT = Number(arg("--repeat", 1)), PARALLEL = Number(arg("--parallel", 4)), MODEL = arg("--model", null);
const only = arg("--only", null)?.split(",");
let cases = [...rows(join(BENCH, "cases/value-critic.jsonl")), ...rows(join(BENCH, "cases/validator.jsonl"))]
  .filter((c) => gateArg === "all" || c.gate === gateArg).filter((c) => !only || only.includes(c.id));
const FRAMEWORK = (() => { try { return execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim() + (execFileSync("git", ["-C", ROOT, "status", "--porcelain", ".claude/agents"], { encoding: "utf8" }).trim() ? "+dirty-agents" : ""); } catch { return "unknown"; } })();
const OUT = resolve(ROOT, arg("--out", join(".loop", "bench", `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`)));
mkdirSync(dirname(OUT), { recursive: true });

function setup(c) {
  const d = mkdtempSync(join(tmpdir(), "loop-bench-"));
  cpSync(join(BENCH, "fixture"), d, { recursive: true });
  cpSync(join(ROOT, ".claude/agents"), join(d, ".claude/agents"), { recursive: true });
  const git = (...a) => execFileSync("git", a, { cwd: d, stdio: "ignore", env: { ...process.env, GIT_AUTHOR_NAME: "bench", GIT_AUTHOR_EMAIL: "b@b", GIT_COMMITTER_NAME: "bench", GIT_COMMITTER_EMAIL: "b@b" } });
  const history = readFileSync(join(d, "history.txt"), "utf8").trim().split("\n"); rmSync(join(d, "history.txt"));
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-qm", history[0]);
  for (const h of history.slice(1)) git("commit", "-q", "--allow-empty", "-m", h);
  git("checkout", "-q", "-b", "loop");
  if (c.gate === "validator") {
    let html = readFileSync(join(d, "index.html"), "utf8");
    for (const e of c.edits) { if (html.split(e.find).length !== 2) throw new Error(`${c.id}: edit does not apply exactly once`); html = html.replace(e.find, e.replace); }
    writeFileSync(join(d, "index.html"), html);
    mkdirSync(join(d, "PRPs"), { recursive: true });
    writeFileSync(join(d, `PRPs/2026-10-01-${c.id}.md`), `# PRP: ${c.title}\n\nSize: S · Stage: see positioning\n\n## Goal\n${c.title}.\n\n## Validator CLAIM\n${c.claim}\n\n## Success Criteria\n- ${c.claim}\n- No regression: \`node check.mjs\` exits 0 and the funnel strings remain.\n\n## Validation Loop\n- Level 4: \`node check.mjs\` (BUILD_CMD) + the independent validator.\n`);
    git("add", "-A"); git("commit", "-qm", `loop(bench): ${c.title}`);
  }
  return d;
}
const prompt = (c) => c.gate === "value-critic"
  ? `Judge ONE candidate idea for this round.\n\nIdea: ${c.idea}\nTarget funnel stage: ${c.stage}\nCategory: ${c.category}\nResearch brief: none.\n\nFollow your instructions and end with your output block.`
  : `Validate the change in the latest commit (git show HEAD) against its PRP: PRPs/2026-10-01-${c.id}.md. Changed files: index.html. There is no baseline screenshot: BUILD_CMD (node check.mjs) prints the text evidence. Follow your instructions and end with your output block.`;
const verdictOf = (text, key) => { const m = text.replace(/`/g, "").split("\n").map((l) => l.match(new RegExp(`^\\s*${key}:\\s*([A-Z_]+)`))).filter(Boolean).pop(); return m ? m[1] : null; };

function runCase(c, attempt) {
  return new Promise((done) => {
    let d; try { d = setup(c); } catch (e) { return done({ case: c.id, gate: c.gate, error: String(e.message) }); }
    const args = ["-p", prompt(c), "--agent", c.gate, "--dangerously-skip-permissions", ...ISOLATE, "--output-format", "stream-json", "--verbose", ...(MODEL ? ["--model", MODEL] : [])];
    const p = spawn(CLAUDE, args, { cwd: d, env: { ...process.env, BENCH_CASE_ID: c.id }, stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => (out += b));
    const t0 = Date.now(), kill = setTimeout(() => p.kill("SIGTERM"), TIMEOUT);
    p.on("close", () => {
      clearTimeout(kill);
      const ev = out.split("\n").flatMap((l) => { try { return l.startsWith("{") ? [JSON.parse(l)] : []; } catch { return []; } });
      const results = ev.filter((e) => e.type === "result"); const last = new Map(results.map((r) => [r.session_id, r]));
      const text = results.length ? results.map((r) => r.result || "").join("\n") : out.split("\n").filter((l) => !l.startsWith("{")).join("\n");
      const got = verdictOf(text, c.gate === "validator" ? "VERDICT" : "VALUE");
      const expectNo = c.expect !== (c.gate === "validator" ? "PASS" : "ACCEPT");
      const correct = c.expect === "EITHER" ? null : !!got && (expectNo ? (c.gate === "validator" ? NOT_PASS.has(got) : got === "REJECT") : got === c.expect);
      const models = {}; for (const r of last.values()) for (const [m, v] of Object.entries(r.modelUsage || {})) models[m] = (models[m] || 0) + (v.costUSD || 0);
      rmSync(d, { recursive: true, force: true });
      done({ bench: OUT.split("/").pop(), ts: new Date().toISOString(), case: c.id, gate: c.gate, class: c.class, expect: c.expect, got, correct, attempt,
        cost_usd: last.size ? [...last.values()].reduce((a, r) => a + (r.total_cost_usd || 0), 0) : null, duration_ms: Date.now() - t0, models,
        agent_sha: sha(join(ROOT, ".claude/agents", `${c.gate}.md`)), model_override: MODEL, framework: FRAMEWORK, reply: text.slice(-600), ...(got ? {} : { reply_full: text }) });   // no verdict: keep all of it, to see why
    });
  });
}

const jobs = []; for (let a = 1; a <= REPEAT; a++) for (const c of cases) jobs.push([c, a]);
console.log(`bench: ${jobs.length} case runs (${cases.length} cases × ${REPEAT}), ${PARALLEL} at a time, framework ${FRAMEWORK}${MODEL ? `, model ${MODEL}` : ""} → ${OUT}`);
const results = []; let next = 0;
async function worker() { while (next < jobs.length) { const [c, a] = jobs[next++]; const r = await runCase(c, a); results.push(r);
  if (r.error) console.log(`  ERROR ${r.case}: ${r.error}`); else { appendFileSync(OUT, JSON.stringify(r) + "\n");
  console.log(`  ${r.correct == null ? "--   " : r.correct ? "ok   " : "WRONG"} ${r.case.padEnd(24)} expect ${r.expect.padEnd(6)} got ${String(r.got).padEnd(8)} ${r.cost_usd == null ? "" : `$${r.cost_usd.toFixed(2)}`} ${Math.round(r.duration_ms / 1000)}s`); } } }
await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
console.log("");
report(results.filter((r) => !r.error), OUT);

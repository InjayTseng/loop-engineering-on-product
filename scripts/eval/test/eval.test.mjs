// eval.test.mjs — label-outcomes.mjs and baseline.mjs on a throwaway git repo where every outcome is known.
// Usage: node scripts/eval/test/eval.test.mjs        (exit 0 = all pass)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LABEL = resolve(HERE, "../label-outcomes.mjs"), BASE = resolve(HERE, "../baseline.mjs");
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`}`); if (!ok) fail = 1; };

const R = mkdtempSync(join(tmpdir(), "loop-eval-"));
let clock = Date.parse("2026-09-01T00:00:00Z") / 1000;
const g = (...a) => execFileSync("git", a, { cwd: R, encoding: "utf8",
  env: { ...process.env, GIT_AUTHOR_DATE: `${clock} +0000`, GIT_COMMITTER_DATE: `${clock} +0000`, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
const commit = (file, text, subject) => { clock += 3600; mkdirSync(dirname(join(R, file)), { recursive: true });
  writeFileSync(join(R, file), text); g("add", "-A"); g("commit", "-qm", subject); return g("rev-parse", "HEAD"); };
// every loop commit also touches bookkeeping under .claude/tasks/, as real rounds do — that must not make
// commits look related (one file per round here, so the fixture's cherry-pick and revert apply cleanly)
const ship = (file, text, subject) => { mkdirSync(join(R, ".claude/tasks"), { recursive: true });
  writeFileSync(join(R, `.claude/tasks/round-${clock}.md`), `${subject}\n`); return commit(file, text, subject); };

g("init", "-q", "-b", "main"); writeFileSync(join(R, "loop.config.env"), 'DEPLOY_BRANCH="main"\nLOOP_BRANCH="loop"\n');
commit("app/base.swift", "base", "init");
g("checkout", "-q", "-b", "loop");
const A = ship("app/a.swift", "a", "loop(activation): A");            // merged
const B = ship("app/b.swift", "b", "loop(retention): B");             // merged, then reverted on main
const C = ship("app/c.swift", "c", "loop(core-value): C");            // merged, then fixed on main 2 days later
g("checkout", "-q", "main"); clock += 60; g("merge", "-q", "--no-ff", "loop", "-m", "Merge loop");
// a revert as git writes it (done by hand: the ledger lines of later rounds would make `git revert` conflict)
clock += 3600; rmSync(join(R, "app/b.swift")); g("add", "-A"); g("commit", "-qm", `Revert "loop(retention): B"\n\nThis reverts commit ${B}.`);
clock += 2 * 86400; commit("app/c.swift", "c fixed", "fix: C crashed on empty state");
clock += 10 * 86400; commit("app/a.swift", "a2", "fix: A copy");  // touches A's file, but 10+ days later: not A's escape
g("checkout", "-q", "loop");
const D = ship("app/d.swift", "d", "loop(monetization): D");          // skipped: E (later) gets cherry-picked, D does not
const E = ship("app/e.swift", "e", "loop(virality): E");              // merged via cherry-pick (same patch, new sha)
const F = ship("app/f.swift", "f", "loop(engagement): F");            // pending: newest, nothing after it merged
g("checkout", "-q", "main"); clock += 60; g("cherry-pick", E); g("checkout", "-q", "loop");

mkdirSync(join(R, ".loop"), { recursive: true });
const rec = (round, commit, agent, token) => ({ run: "20260901T000000", kind: "round", round, agent, commit, verdict: { key: agent === "validator" ? "VERDICT" : "VALUE", token } });
const gates = [[1, A], [2, B], [3, C], [4, D], [5, E], [6, F]].flatMap(([n, c]) => [rec(n, c, "value-critic", "ACCEPT"), rec(n, c, "validator", "PASS")]);
gates.push(rec(2, B, "value-critic", "REJECT"));   // an earlier idea in round 2 was rejected
writeFileSync(join(R, ".loop/gates.jsonl"), gates.map((x) => JSON.stringify(x)).join("\n") + "\n");
writeFileSync(join(R, ".loop/usage.jsonl"), [
  { kind: "round", round: 1, cost_usd: 2.0, models: { "claude-opus-5-5": { cost_usd: 1.5 }, "claude-sonnet-5-5": { cost_usd: 0.5 } } },
  { kind: "round", round: 2, cost_usd: 3.0, models: {} }, { kind: "audit", round: 0, cost_usd: 1.0, models: {} },
  { kind: "round", round: 3, cost_usd: null, models: {} },
].map((x) => JSON.stringify(x)).join("\n") + "\n");

console.log("### label-outcomes");
const out = execFileSync("node", [LABEL, "--repo", R], { encoding: "utf8" });
const L = Object.fromEntries(readFileSync(join(R, ".loop/labels.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.commit, r]));
eq("merged by ancestry", L[A].label, "merged");
eq("merged, then reverted", [L[B].label, L[B].reverted_by?.length], ["merged-reverted", 7]);
eq("merged, then a fix touching its file within FIX_DAYS", [L[C].label, L[C].fix_commits.length], ["merged-fixed", 1]);
eq("a fix to the same file 10+ days later is not counted", L[A].fix_commits, []);
eq("merged by cherry-pick (patch in main)", [L[E].label, /^patch in/.test(L[E].merged_via)], ["merged", true]);
eq("skipped: a later loop commit was merged, this one was not", L[D].label, "skipped");
eq("pending: newest, nothing after it merged", L[F].label, "pending");
eq("summary line", out.trim().split("\n").pop(), "LABELS: merged=2 merged-fixed=1 merged-reverted=1 reverted=0 skipped=1 pending=1 unknown=0");
eq("run and round carried from the gate records", [L[C].run, L[C].round], ["20260901T000000", 3]);

console.log("### baseline");
const b = JSON.parse(execFileSync("node", [BASE, "--repo", R, "--json"], { encoding: "utf8" }));
eq("shipped 6, decided 5 (pending left out)", [b.shipped, b.decided, b.pending], [6, 5, 1]);
eq("merge rate = merged / decided = 4/5", b.merge_rate, 0.8);
eq("escape rate = (fixed + reverted) / decided = 2/5", b.escape_rate, 0.4);
eq("value gate counts", [b.value_gate.accepts, b.value_gate.rejects], [6, 1]);
eq("escape rate after a final validator PASS = 2/5", [b.validator.pass_decided, b.validator.escape_rate_after_pass], [5, 0.4]);
eq("cost: unknown-cost calls are counted, never added as 0", [b.cost.total_usd, b.cost.calls, b.cost.calls_cost_unknown], [6, 4, 1]);
eq("cost per merged = 6 / 4", b.cost.usd_per_merged, 1.5);
eq("cost by model", b.cost.by_model, { "claude-opus-5-5": 1.5, "claude-sonnet-5-5": 0.5 });
const text = execFileSync("node", [BASE, "--repo", R], { encoding: "utf8" });
eq("last line", text.trim().split("\n").pop(), "BASELINE: shipped=6 decided=5 merge_rate=0.80 escape_rate=0.40 usd_per_merged=1.50");

console.log("### no gate records: falls back to loop(...) commits on the loop branch");
rmSync(join(R, ".loop/gates.jsonl"));
const fb = execFileSync("node", [LABEL, "--repo", R], { encoding: "utf8" }).trim().split("\n").pop();
eq("all six loop commits labelled", fb, "LABELS: merged=2 merged-fixed=1 merged-reverted=1 reverted=0 skipped=1 pending=1 unknown=0");

rmSync(R, { recursive: true, force: true });
console.log(fail ? "EVAL TESTS FAILED" : "ALL EVAL TESTS PASSED");
process.exit(fail);

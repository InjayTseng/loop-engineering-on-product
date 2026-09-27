// jev.test.mjs — deterministic tests for scripts/jev/jev.mjs on the keyless mock backend.
// JEV_MOCK_SCRIPT pins each question's answer, so every routing rule is asserted without a network.
// Usage: cd scripts/jev && npm ci && npm test       (exit 0 = all pass)
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const JEV = resolve(dirname(fileURLToPath(import.meta.url)), "../jev.mjs");
let fail = 0;
function run(args, env = {}, cwd = undefined) {
  return execFileSync("node", [JEV, ...args], {
    cwd, encoding: "utf8",
    env: { ...process.env, JEV_BACKEND: "mock", JEV_MODE: "prefilter", ...env },
  }).trim().split("\n").pop();
}
function expect(name, got, re) {
  const ok = re.test(got);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       got: ${got}`}`);
  if (!ok) fail = 1;
}
const script = (o) => ({ JEV_MOCK_SCRIPT: JSON.stringify(o) });
const low = { fabricated: { answer: 0.02 }, duplicate: { answer: 0.03 }, non_goal: { answer: 0.01 } };
const idea = ["prefilter", "--idea", "hero line: 今日已有 N 人起盤, N seeded from the date"];

console.log("### modes");
expect("off prints OFF and loads nothing", run(idea, { JEV_MODE: "off" }), /^JEV: OFF/);
expect("unknown mode is treated as off", run(idea, { JEV_MODE: "yes" }), /^JEV: OFF — unknown JEV_MODE/);
expect("shadow never emits a routable verdict", run(idea, { JEV_MODE: "shadow", ...script({ ...low, fabricated: { answer: 0.97 } }) }),
  /^JEV: SHADOW — would=REJECT fabricated/);

console.log("### prefilter (fast-reject only)");
expect("confident fabricated → REJECT", run(idea, script({ ...low, fabricated: { answer: 0.97 } })), /^JEV: REJECT — fabricated \(p=0\.97\)/);
expect("confident duplicate → REJECT", run(idea, script({ ...low, duplicate: { answer: 0.9 } })), /^JEV: REJECT — duplicate/);
expect("below JEV_REJECT_P → not rejected", run(idea, script({ ...low, duplicate: { answer: 0.8 } })), /^JEV: PASS/);
expect("JEV_REJECT_P is honoured", run(idea, { JEV_REJECT_P: "0.75", ...script({ ...low, duplicate: { answer: 0.8 } }) }), /^JEV: REJECT — duplicate/);
expect("all clear → PASS (value-critic still runs)", run(idea, script(low)), /^JEV: PASS — .*spawn value-critic/);
expect("flat answer → ESCALATE, never REJECT", run(idea, script({ ...low, fabricated: { answer: 0.55 } })), /^JEV: ESCALATE — Jev unsure \(fabricated:unsure\)/);
expect("missing --idea → ESCALATE", run(["prefilter"]), /^JEV: ESCALATE — no --idea/);

console.log("### label-promise");
const lp = ["label-promise", "--label", "問一支籤？", "--observed", "preselects the category and scrolls; no draw happens"];
expect("confident no → MISMATCH", run(lp, script({ delivers: { answer: 0.04 } })), /^JEV: MISMATCH/);
expect("delivers → PASS", run(lp, script({ delivers: { answer: 0.96 } })), /^JEV: PASS/);

console.log("### pick");
expect("pick returns the chosen key", run(["pick", "--question", "Which moves activation most?", "--option", "a=hint copy", "--option", "b=one-tap sample"],
  script({ best: { answer: "b", confidence: 0.9 } })), /^JEV: PICK b — conf=0\.90/);
expect("pick needs two options", run(["pick", "--question", "q", "--option", "a=x"]), /^JEV: ESCALATE/);

console.log("### same-tactic (reads git log in cwd)");
const repo = mkdtempSync(join(tmpdir(), "jev-test-"));
const g = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo });
g("init", "-q");
for (const m of ["loop(engagement): add nudge line under result", "loop(virality): add nudge line on share"]) {
  writeFileSync(join(repo, "f.txt"), m); g("add", "f.txt"); g("commit", "-qm", m);
}
expect("repeat → SAME", run(["same-tactic", "--n", "3"], script({ same_tactic: { answer: 0.93 } }), repo), /^JEV: SAME — p=0\.93/);
expect("different → DISTINCT", run(["same-tactic"], script({ same_tactic: { answer: 0.1 } }), repo), /^JEV: DISTINCT/);
rmSync(repo, { recursive: true, force: true });

console.log(fail ? "JEV TESTS FAILED" : "ALL JEV TESTS PASSED");
process.exit(fail);

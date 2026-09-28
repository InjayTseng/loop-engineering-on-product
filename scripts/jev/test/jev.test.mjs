// jev.test.mjs — deterministic tests for scripts/jev/jev.mjs on the keyless mock backend.
// JEV_MOCK_SCRIPT pins each question's answer, so every routing rule is asserted without a network.
// Usage: cd scripts/jev && npm ci && npm test       (exit 0 = all pass)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ledgerForPrefilter, titleOf } from "../ledger.mjs";

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

console.log("### ledger self-match (regression: the idea's own [IN_PROGRESS] line was shown to Jev)");
const past = "- [COMPLETED] share chip: copy text\n- [REJECTED] streak badge — no re-entry trigger\n";
const self = "- [IN_PROGRESS] cf-billing: reserve balance per ticket\n";
expect("helper drops IN_PROGRESS, keeps every other status", ledgerForPrefilter(past + self), /^- \[COMPLETED\].*\n- \[REJECTED\].*\n$/);
const q = "- [QUEUED] cf-cutover-runbook — x\n- [QUEUED] cf-auth-hardening — y\n- [REJECTED] cf-cutover-runbook — dup\n- [SPLIT] cf-cutover-runbook — parent\n";
expect("helper drops this idea's non-terminal lines, any status name", ledgerForPrefilter(q, "cf-cutover-runbook"), /^- \[QUEUED\] cf-auth-hardening — y\n- \[REJECTED\] cf-cutover-runbook — dup\n$/);
expect("helper keeps other ideas' QUEUED lines (whole-token title match)", ledgerForPrefilter(q, "cf-auth"), /cf-auth-hardening/);
expect("helper never drops a terminal twin", ledgerForPrefilter(q, "cf-cutover-runbook"), /\[REJECTED\] cf-cutover-runbook/);
expect("titleOf reads the spec's --idea shape", titleOf("cf-billing — reserve per ticket — pay"), /^cf-billing$/);
expect("helper keeps an indented or mid-text mention", ledgerForPrefilter("- [REJECTED] was [IN_PROGRESS] once\n"), /^- \[REJECTED\]/);
// Mock answers hash the state, so equal answers ⇔ Jev saw the same ledger.
const dir = mkdtempSync(join(tmpdir(), "jev-ledger-"));
const LOG = resolve(dirname(JEV), "../../.loop/jev.jsonl");
const answersWith = (ledgerText) => {
  const p = join(dir, "ledger.md"); writeFileSync(p, ledgerText);
  run(["prefilter", "--idea", "cf-billing: reserve balance per ticket"], { LEDGER: p, POSITIONING: join(dir, "none.md") });
  return JSON.stringify(JSON.parse(readFileSync(LOG, "utf8").trim().split("\n").pop()).answers);
};
const base = answersWith(past);
expect("own IN_PROGRESS line does not reach Jev", answersWith(past + self) === base ? "same" : "differs", /^same$/);
// Regression 2 (live: cf-cutover-runbook, p=0.90): a project-local non-terminal status, checked
// BEFORE the round flipped it to IN_PROGRESS.
expect("own QUEUED line (title from --idea) does not reach Jev", answersWith(past + "- [QUEUED] cf-billing: reserve balance per ticket\n") === base ? "same" : "differs", /^same$/);
expect("a REJECTED twin does reach Jev (test is sensitive)", answersWith(past + "- [REJECTED] cf-billing: reserve balance per ticket\n") === base ? "same" : "differs", /^differs$/);
rmSync(dir, { recursive: true, force: true });

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

console.log("### claim-evidence (the validator's PASS vs its own recorded tool outputs)");
const ce = mkdtempSync(join(tmpdir(), "jev-claim-"));
const GP = join(ce, "gates.jsonl");
const BUILD = "node scripts/adapters/web-check.mjs /tmp/loop-shot.png";
const vrec = (evidence, report = "VERDICT: PASS\nCLAIM: the chapter-5 bridge button scrolls to .paywall-sec") =>
  ({ run: "R9", round: 2, kind: "round", agent: "validator", report, verdict: { key: "VERDICT", token: "PASS" }, evidence });
const built = { tool: "Bash", input: `{"command":"${BUILD}"}`, output: '{"ok": true, "missing": []}' };
const ceRun = (recs, answers, env = {}) => {
  writeFileSync(GP, recs.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return run(["claim-evidence", "--run", "R9", "--round", "2"], { GATES: GP, BUILD_CMD: BUILD, ...(answers ? script(answers) : {}), ...env });
};
const seen = { observed: { answer: 0.93 }, contradicted: { answer: 0.03 } };
expect("evidence shows the CLAIM → PASS", ceRun([vrec([built])], seen), /^JEV: PASS — the CLAIM is backed/);
expect("evidence contradicts the CLAIM → CONTRADICTED", ceRun([vrec([built])], { observed: { answer: 0.5 }, contradicted: { answer: 0.92 } }), /^JEV: CONTRADICTED — p=0\.92/);
expect("nothing shows the CLAIM, no images → UNSUPPORTED", ceRun([vrec([built])], { observed: { answer: 0.06 }, contradicted: { answer: 0.05 } }), /^JEV: UNSUPPORTED — P\(observed\)=0\.06/);
const shot = { tool: "Read", input: '{"file_path":"/tmp/loop-shot.png"}', output: "" };
expect("nothing in text but a screenshot was viewed → ESCALATE, never UNSUPPORTED", ceRun([vrec([built, shot])], { observed: { answer: 0.06 }, contradicted: { answer: 0.05 } }),
  /^JEV: ESCALATE — no text evidence for the CLAIM, but 1 image/);
expect("BUILD_CMD never ran → UNSUPPORTED, decided in code (no answers scripted)", ceRun([vrec([shot])], null), /^JEV: UNSUPPORTED — the validator never ran BUILD_CMD/);
expect("no validator record for the round → ESCALATE", ceRun([{ ...vrec([built]), round: 3 }], seen), /^JEV: ESCALATE — no validator record/);
expect("a report without a CLAIM: line → ESCALATE", ceRun([vrec([built], "VERDICT: PASS")], seen), /^JEV: ESCALATE — the validator report has no CLAIM/);
expect("the last validator hand-back of the round is the one checked", ceRun([vrec([shot]), vrec([built])], seen), /^JEV: PASS/);
expect("a renamed validator is found via GATE_VALIDATOR_AGENT", ceRun([{ ...vrec([built]), agent: "web-validator" }], seen, { GATE_VALIDATOR_AGENT: "web-validator" }), /^JEV: PASS/);
expect("shadow: a code-decided verdict is still only a SHADOW line", ceRun([vrec([shot])], null, { JEV_MODE: "shadow" }), /^JEV: SHADOW — would=UNSUPPORTED/);
const ceLast = JSON.parse(readFileSync(LOG, "utf8").trim().split("\n").pop());
expect("the shadow row is logged with task, backend=code and run/round", `${ceLast.task} ${ceLast.backend} ${ceLast.verdict} ${ceLast.input.run}/${ceLast.input.round}`, /^claim-evidence code UNSUPPORTED R9\/2$/);
rmSync(ce, { recursive: true, force: true });

console.log("### shadow-report (pairs shadow prefilter rows with value-critic verdicts)");
run(idea, { JEV_MODE: "shadow", LOOP_RUN_ID: "R-test", LOOP_ROUND: "7", ...script(low) });
const last = JSON.parse(readFileSync(LOG, "utf8").trim().split("\n").pop());
expect("jev.mjs tags its row with the driver's run and round", `${last.run}/${last.round}`, /^R-test\/7$/);

const REPORT = resolve(dirname(JEV), "shadow-report.mjs");
const rep = mkdtempSync(join(tmpdir(), "jev-report-"));
const jl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const sh = (round, verdict, ideaText) => ({ task: "prefilter", mode: "shadow", run: "R1", round, verdict, why: `${verdict} why`, input: { idea: ideaText } });
const vc = (round, token) => ({ agent: "value-critic", kind: "round", run: "R1", round, verdict: { key: "VALUE", token }, report: `SCORES: impact=4\nVALUE: ${token}` });
const report = (jevRows, gateRows) => {
  writeFileSync(join(rep, "jev.jsonl"), jl(jevRows)); writeFileSync(join(rep, "gates.jsonl"), jl(gateRows));
  return execFileSync("node", [REPORT, "--jev", join(rep, "jev.jsonl"), "--gates", join(rep, "gates.jsonl")], { encoding: "utf8" });
};
const lastLine = (s) => s.trim().split("\n").pop();
// round 1: two ideas, in order; round 2: Jev rejects one value-critic accepted; round 3: counts differ
const safeOut = report([sh(1, "REJECT", "fake counter"), sh(1, "PASS", "share chip")], [vc(1, "REJECT"), vc(1, "ACCEPT")]);
expect("agreeing reject + pass → SAFE, 1 of 1 rejects caught", lastLine(safeOut), /^JEV_SHADOW: SAFE — pairs=2 false_rejects=0 caught=1\/1$/);
const unsafeOut = report([sh(1, "REJECT", "fake counter"), sh(2, "REJECT", "good idea")], [vc(1, "REJECT"), vc(2, "ACCEPT")]);
expect("a would-REJECT that value-critic accepted → UNSAFE", lastLine(unsafeOut), /^JEV_SHADOW: UNSAFE — pairs=2 false_rejects=1 caught=1\/1$/);
expect("the false reject is listed with its idea", unsafeOut, /FALSE REJECT R1\/2: good idea/);
const mixed = report([sh(3, "PASS", "a"), sh(3, "PASS", "b")], [vc(3, "ACCEPT")]);
expect("a round whose counts differ is left unpaired, not guessed", mixed, /unpaired rounds: 1 — R1\/3 \(jev=2 value-critic=1\)/);
expect("no pairs → NO_DATA", lastLine(mixed), /^JEV_SHADOW: NO_DATA/);
const prefilterRow = { ...sh(4, "REJECT", "x"), mode: "prefilter" };
expect("prefilter-mode rows are ignored (value-critic never saw a fast-rejected idea)", lastLine(report([prefilterRow], [])), /^JEV_SHADOW: NO_DATA/);
const renamed = (jevRows, gateRows, name) => {
  writeFileSync(join(rep, "jev.jsonl"), jl(jevRows)); writeFileSync(join(rep, "gates.jsonl"), jl(gateRows));
  return execFileSync("node", [REPORT, "--jev", join(rep, "jev.jsonl"), "--gates", join(rep, "gates.jsonl")],
    { encoding: "utf8", env: { ...process.env, GATE_VALUE_AGENT: name } });
};
expect("a renamed value gate is paired via GATE_VALUE_AGENT", lastLine(renamed([sh(5, "REJECT", "x")], [{ ...vc(5, "REJECT"), agent: "growth-critic" }], "growth-critic")),
  /^JEV_SHADOW: SAFE — pairs=1 false_rejects=0 caught=1\/1$/);
// claim-evidence: re-validation records are the ground truth for prefilter flags; shadow flags need a human
const cl = (round, verdict, mode = "prefilter") => ({ task: "claim-evidence", mode, run: "R1", verdict, why: `${verdict} why`, input: { run: "R1", round: String(round) } });
const rv = (round, token) => ({ agent: "validator", kind: "reval", run: "R1", round, verdict: { key: "VERDICT", token } });
const claimOut = report([cl(1, "UNSUPPORTED"), cl(2, "CONTRADICTED"), cl(3, "UNSUPPORTED", "shadow"), cl(4, "PASS"), cl(5, "ESCALATE")],
  [rv(1, "FAIL"), rv(2, "PASS")]);
expect("claim flags: re-validation FAIL confirms, PASS is a false flag, shadow is unlabeled",
  claimOut, /JEV_CLAIM: checked=5 flagged=3 confirmed=1 false_flags=1 unlabeled=1/);
expect("the false flag is listed", claimOut, /FALSE FLAG R1\/2: CONTRADICTED why/);
expect("the shadow flag is listed for labelling", claimOut, /TO LABEL R1\/3: UNSUPPORTED/);
expect("JEV_SHADOW stays the last line", lastLine(claimOut), /^JEV_SHADOW:/);
rmSync(rep, { recursive: true, force: true });

console.log(fail ? "JEV TESTS FAILED" : "ALL JEV TESTS PASSED");
process.exit(fail);

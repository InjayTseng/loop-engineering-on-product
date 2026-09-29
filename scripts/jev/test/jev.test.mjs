// jev.test.mjs — deterministic tests for scripts/jev/jev.mjs on the keyless mock backend.
// JEV_MOCK_SCRIPT pins each question's answer, so every routing rule is asserted without a network.
// Usage: cd scripts/jev && npm ci && npm test       (exit 0 = all pass)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ledgerForPrefilter, titleOf } from "../ledger.mjs";

const JEV = resolve(dirname(fileURLToPath(import.meta.url)), "../jev.mjs");
// Every jev.mjs call in this suite logs to a temp file (JEV_LOG). The repo's own .loop/jev.jsonl is the real
// dataset shadow-report reads: an adopting repo running `npm test` once used to add 184 mock rows to it.
const REAL_LOG = resolve(dirname(JEV), "../../.loop/jev.jsonl");
const realBefore = existsSync(REAL_LOG) ? readFileSync(REAL_LOG, "utf8") : null;
const LOG_DIR = mkdtempSync(join(tmpdir(), "jev-log-"));
const TEST_LOG = join(LOG_DIR, "jev.jsonl");
let fail = 0;
function run(args, env = {}, cwd = undefined) {
  return execFileSync("node", [JEV, ...args], {
    cwd, encoding: "utf8",
    env: { ...process.env, JEV_BACKEND: "mock", JEV_MODE: "prefilter", JEV_LOG: TEST_LOG, ...env },
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

console.log("### every outcome is logged, including UNAVAILABLE (a timeout must not vanish from jev.jsonl)");
const JEV_LOG = TEST_LOG;
const lastRow = () => JSON.parse(readFileSync(JEV_LOG, "utf8").trim().split("\n").pop());
expect("a timeout prints UNAVAILABLE", run(idea, { JEV_TIMEOUT_MS: "50", JEV_MOCK_DELAY_MS: "500", ...script(low) }), /^JEV: UNAVAILABLE — timeout after 50ms/);
const tRow = lastRow();
expect("… and is logged with timeout=true and its latency", `${tRow.task} ${tRow.verdict} ${tRow.timeout} ${tRow.latencyMs >= 40}`, /^prefilter UNAVAILABLE true true$/);
run(idea, { JEV_MODE: "shadow", JEV_TIMEOUT_MS: "50", JEV_MOCK_DELAY_MS: "500", LOOP_RUN_ID: "R-t", LOOP_ROUND: "3", ...script(low) });
const sRow = lastRow();
expect("a shadow timeout is logged with run and round (stays paired in shadow-report)", `${sRow.mode} ${sRow.verdict} ${sRow.run}/${sRow.round}`, /^shadow UNAVAILABLE R-t\/3$/);
const noKey = { JEV_BACKEND: "", TYPESAFE_API_KEY: "", OPENROUTER_API_KEY: "", AI_GATEWAY_API_KEY: "" };
expect("no credentials → UNAVAILABLE", run(idea, noKey), /^JEV: UNAVAILABLE — No Jev credentials/);
expect("… and is logged", `${lastRow().verdict} ${lastRow().timeout ?? "-"}`, /^UNAVAILABLE -$/);
expect("an argument ESCALATE is logged too", (run(["prefilter"]), lastRow().verdict), /^ESCALATE$/);
const before = readFileSync(JEV_LOG, "utf8");
run(idea, { JEV_MODE: "off" });
expect("OFF is the one outcome not logged", readFileSync(JEV_LOG, "utf8") === before ? "unchanged" : "grew", /^unchanged$/);

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
const LOG = TEST_LOG;
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
expect("no correctness check ran → UNSUPPORTED, decided in code (no answers scripted)", ceRun([vrec([shot])], null), /^JEV: UNSUPPORTED — the validator ran none of the correctness checks \(scripts\/adapters\/web-check\.mjs\)/);
// a live iOS false flag: the validator validated with a fuller e2e script instead of BUILD_CMD itself
const e2e = { tool: "Bash", input: '{"command":"scripts/e2e-ios.sh 2>&1 | tail -6"}', output: "** TEST SUCCEEDED **" };
expect("a command listed in CHECK_CMDS counts as the check", ceRun([vrec([e2e])], seen, { CHECK_CMDS: "scripts/e2e-ios.sh" }), /^JEV: PASS/);
expect("… and without CHECK_CMDS it does not", ceRun([vrec([e2e])], null), /^JEV: UNSUPPORTED — the validator ran none/);
// BUILD_CMD counts by its script, not its output path: the validator may write its screenshot elsewhere
const iosBuild = "scripts/adapters/ios-check.sh /tmp/captionfly-ios-screenshot-output.png";
const iosRan = { tool: "Bash", input: '{"command":"scripts/adapters/ios-check.sh /tmp/val-shot.png 2>&1 | tail -5"}', output: '{"ok":true}' };
expect("BUILD_CMD matched by its script even with a different output path", ceRun([vrec([iosRan])], seen, { BUILD_CMD: iosBuild }), /^JEV: PASS/);
expect("no validator record for the round → ESCALATE", ceRun([{ ...vrec([built]), round: 3 }], seen), /^JEV: ESCALATE — no validator record/);
expect("a report without a CLAIM: line → ESCALATE", ceRun([vrec([built], "VERDICT: PASS")], seen), /^JEV: ESCALATE — the validator report has no CLAIM/);
expect("the last validator hand-back of the round is the one checked", ceRun([vrec([shot]), vrec([built])], seen), /^JEV: PASS/);
expect("a renamed validator is found via GATE_VALIDATOR_AGENT", ceRun([{ ...vrec([built]), agent: "web-validator" }], seen, { GATE_VALIDATOR_AGENT: "web-validator" }), /^JEV: PASS/);
expect("shadow: a code-decided verdict is still only a SHADOW line", ceRun([vrec([shot])], null, { JEV_MODE: "shadow" }), /^JEV: SHADOW — would=UNSUPPORTED/);
const ceLast = JSON.parse(readFileSync(LOG, "utf8").trim().split("\n").pop());
expect("the shadow row is logged with task, backend=code and run/round", `${ceLast.task} ${ceLast.backend} ${ceLast.verdict} ${ceLast.input.run}/${ceLast.input.round}`, /^claim-evidence code UNSUPPORTED R9\/2$/);
rmSync(ce, { recursive: true, force: true });

console.log("### same-failure (in-round retry loops)");
const sf = ["same-failure", "--loop", "build", "--attempt", "2", "--previous", "TS2339: Property 'x' does not exist", "--current", "TS2339: Property 'x' does not exist", "--edits", "renamed a comment"];
const stuck = { same_cause: { answer: 0.95 }, material_change: { answer: 0.05 }, new_evidence: { answer: 0.04 } };
expect("same cause, no real change, nothing new → SAME_FAILURE", run(sf, script(stuck)), /^JEV: SAME_FAILURE — .*costs one extra retry/);
expect("a material change vetoes it", run(sf, script({ ...stuck, material_change: { answer: 0.9 } })), /^JEV: PASS — progress or a different failure/);
expect("new evidence vetoes it", run(sf, script({ ...stuck, new_evidence: { answer: 0.9 } })), /^JEV: PASS/);
expect("a flat same_cause is not enough", run(sf, script({ ...stuck, same_cause: { answer: 0.6 } })), /^JEV: (PASS|ESCALATE)/);
expect("missing --current → ESCALATE", run(["same-failure", "--previous", "x"]), /^JEV: ESCALATE — need --previous and --current/);

console.log("### noop-cause (a NOOP round → state audit now?)");
const nc = mkdtempSync(join(tmpdir(), "jev-noop-"));
const ncLog = join(nc, "round-004.log");
writeFileSync(ncLog, "Build failed 3 times; reverted.\nLOOP_RESULT: NOOP | rejects=0\n");
writeFileSync(join(nc, "round-004.jsonl"), [
  { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "scripts/adapters/ios-shot.sh /tmp/s.png" } }] } },
  { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "Unable to boot device: iPhone 16 Pro" }] } },
].map((e) => JSON.stringify(e)).join("\n") + "\n");
const ncRun = (answer, conf, env = {}) => run(["noop-cause", "--log", ncLog], { ...script({ cause: { answer, confidence: conf } }), ...env });
expect("environment above the bar → AUDIT_NOW", ncRun("environment", 0.9), /^JEV: AUDIT_NOW — cause=environment conf=0\.90/);
expect("adapter above the bar → AUDIT_NOW", ncRun("adapter", 0.8), /^JEV: AUDIT_NOW — cause=adapter/);
expect("environment below the bar → NO_TRIGGER", ncRun("environment", 0.6), /^JEV: NO_TRIGGER — cause=environment conf=0\.60/);
expect("JEV_TRIGGER_CONF is honoured", ncRun("environment", 0.6, { JEV_TRIGGER_CONF: "0.5" }), /^JEV: AUDIT_NOW/);
expect("implementation never triggers, however sure", ncRun("implementation", 0.99), /^JEV: NO_TRIGGER — cause=implementation/);
expect("missing log → ESCALATE", run(["noop-cause", "--log", join(nc, "nope.log")]), /^JEV: ESCALATE — need --log/);
// the unscripted mock hashes the state: different answers with and without the transcript prove the
// real command outputs (not just the round's own summary) reach Jev
const ncAnswers = () => { run(["noop-cause", "--log", ncLog]); return JSON.stringify(JSON.parse(readFileSync(LOG, "utf8").trim().split("\n").pop()).answers); };
const withTranscript = ncAnswers(); rmSync(join(nc, "round-004.jsonl"));
expect("the transcript's command outputs reach Jev's state", withTranscript === ncAnswers() ? "same" : "differs", /^differs$/);
rmSync(nc, { recursive: true, force: true });

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
  return execFileSync("node", [REPORT, "--jev", join(rep, "jev.jsonl"), "--gates", join(rep, "gates.jsonl"), "--include-tests"], { encoding: "utf8" });
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
  return execFileSync("node", [REPORT, "--jev", join(rep, "jev.jsonl"), "--gates", join(rep, "gates.jsonl"), "--include-tests"],
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
// same-failure: the round's outcome labels the flag; noop-cause: the next audit of that run does
const sfr = (round) => ({ task: "same-failure", mode: "shadow", run: "R1", round, verdict: "SAME_FAILURE", why: "same", input: { loop: "build", attempt: "2" } });
const out1 = (round, shipped) => ({ agent: "value-critic", kind: "round", run: "R1", round, outcome: shipped ? "LOOP_RESULT: SHIPPED | category=a" : "LOOP_RESULT: NOOP | rejects=0", commit: shipped ? "abc" : null });
const nr = (round) => ({ task: "noop-cause", mode: "prefilter", run: "R1", round, verdict: "AUDIT_NOW", why: "cause=environment" });
const au = (round, token) => ({ agent: "state-auditor", kind: "audit", run: "R1", round, verdict: { key: "AUDIT", token } });
const loopOut = report([sfr(1), sfr(2), sfr(3), nr(4), nr(6), nr(9)],
  [out1(1, true), out1(2, false), au(4, "BROKEN"), au(7, "HEALTHY")]);
expect("a same-failure flag in a round that still shipped is a false flag", loopOut, /JEV_RETRY: flagged=3 false_flags=1 consistent=1 unlabeled=1/);
expect("the false retry flag is listed with its loop and attempt", loopOut, /FALSE FLAG R1\/1 \(build attempt 2\)/);
expect("noop-cause: the next audit of the run labels the trigger", loopOut, /JEV_NOOP: triggers=3 confirmed=1 contradicted=1 unlabeled=1/);
expect("JEV_SHADOW is still the last line", lastLine(loopOut), /^JEV_SHADOW:/);
const av = (task, verdict, extra = {}) => ({ task, mode: "prefilter", run: "R1", round: 1, verdict, why: "w", latencyMs: 200, backend: "typesafe", ...extra });
const availOut = report([av("prefilter", "PASS"), av("claim-evidence", "PASS", { latencyMs: 400 }), av("claim-evidence", "UNAVAILABLE", { timeout: true, latencyMs: 15000 }),
  av("same-tactic", "UNAVAILABLE", { timeout: true }), av("same-tactic", "UNAVAILABLE"), av("claim-evidence", "UNSUPPORTED", { backend: "code", latencyMs: 0 })], []);
expect("availability counts every call, unavailable and timeouts", availOut, /JEV_AVAIL: calls=6 unavailable=3 timeouts=2/);
expect("per-task row: claim-evidence 3 calls, 1 unavailable, 1 timeout, median of answered model calls", availOut, /claim-evidence\s+3\s+1\s+1\s+400/);
// by default only real loop rows count: a driver run id (YYYYMMDDTHHMMSS) and a non-mock backend
writeFileSync(join(rep, "gates.jsonl"), "");
writeFileSync(join(rep, "jev.jsonl"), [
  { task: "prefilter", run: "20260928T221623", round: 1, verdict: "PASS", backend: "typesafe", latencyMs: 306 },
  { task: "prefilter", run: "20260928T221623", round: 1, verdict: "UNAVAILABLE", backend: "auto", timeout: true, latencyMs: 15001 },
  { task: "prefilter", run: "20260928T221623", round: 2, verdict: "PASS", backend: "mock", latencyMs: 1 },
  { task: "prefilter", run: "R-t", round: 3, verdict: "UNAVAILABLE", timeout: true, latencyMs: 51 },
  { task: "prefilter", run: null, verdict: "UNAVAILABLE", timeout: true, latencyMs: 50 },
].map((r) => JSON.stringify(r)).join("\n") + "\n");
const real = execFileSync("node", [REPORT, "--jev", join(rep, "jev.jsonl"), "--gates", join(rep, "gates.jsonl")], { encoding: "utf8" });
expect("default: mock rows and rows without a driver run id are ignored, and it says so", real, /ignored 3 of 5 jev\.jsonl rows/);
expect("default: only the real calls are counted (one real timeout)", real, /JEV_AVAIL: calls=2 unavailable=1 timeouts=1/);
const everything = execFileSync("node", [REPORT, "--jev", join(rep, "jev.jsonl"), "--gates", join(rep, "gates.jsonl"), "--include-tests"], { encoding: "utf8" });
expect("--include-tests counts every row", everything, /JEV_AVAIL: calls=5 unavailable=3 timeouts=3/);
rmSync(rep, { recursive: true, force: true });

console.log("### isolation: the suite never writes the repo's own .loop/jev.jsonl");
const realAfter = existsSync(REAL_LOG) ? readFileSync(REAL_LOG, "utf8") : null;
expect("the real jev.jsonl is exactly as before the suite", realAfter === realBefore ? "unchanged" : "changed", /^unchanged$/);
expect("mock rows are tagged backend=mock", JSON.parse(readFileSync(TEST_LOG, "utf8").trim().split("\n")[0]).backend, /^mock$/);
rmSync(LOG_DIR, { recursive: true, force: true });

console.log(fail ? "JEV TESTS FAILED" : "ALL JEV TESTS PASSED");
process.exit(fail);

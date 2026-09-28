// state.test.mjs — deterministic tests for the dashboard's read model and server.
// Usage: node scripts/dashboard/test/state.test.mjs        (exit 0 = all pass; no dependencies)
import { spawn } from "node:child_process";
import { get } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildState, currentActivity, hostAllowed, parseLoopLog, stopMeters } from "../state.mjs";
import { writeFixture } from "./fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`}`);
  if (!ok) fail = 1;
};
const tmp = () => mkdtempSync(join(tmpdir(), "loop-dash-"));

console.log("### replay: examples/web-v2-20-rounds (numbers from its README)");
{
  const s = buildState(REPO, { loopLog: "examples/web-v2-20-rounds/loop.log", ledger: "examples/web-v2-20-rounds/as-run/_backlog.md" });
  eq("20 rounds, all shipped", [s.rounds.length, s.rounds.filter((r) => r.verdict === "SHIPPED").length], [20, 20]);
  eq("17 rejected ideas", s.rounds.reduce((a, r) => a + r.rejects, 0), 17);
  eq("4 trajectory checks, all CONTINUE", s.rounds.flatMap((r) => r.gates).map((g) => g.verdict), ["CONTINUE", "CONTINUE", "CONTINUE", "CONTINUE"]);
  eq("status done, its own model, never today's Jev mode", [s.run.status, s.run.model, s.run.jev, Boolean(s.run.endedAt)], ["done", "claude-sonnet-4-6", "", true]);
  eq("round 1 shipped commit", [s.rounds[0].commit, s.rounds[0].category], ["b1ebf6c", "monetization"]);
  eq("ledger 45 completed / 18 rejected", ["COMPLETED", "REJECTED"].map((k) => s.ideas.filter((i) => i.status === k).length), [45, 18]);
  eq("plateau never fires on this run (lesson 10)", s.meters.find((m) => m.key === "plateau").fired, false);
}

console.log("### live fixture: mid-run, round 4 at node D");
const dir = tmp();
const pid = writeFixture(dir);
{
  const s = buildState(dir);
  eq("running", s.run.status, "running");
  eq("current = round 4, node D", [s.current?.kind, s.current?.round, s.current?.node], ["round", 4, "D"]);
  eq("verdicts", s.rounds.map((r) => r.verdict ?? null), ["SHIPPED", "REJECTED", "SHIPPED", null]);
  eq("round 3 gates: Jev SAME, early REDIRECT", s.rounds[2].gates.map((g) => `${g.type}:${g.verdict}`), ["jev_same:SAME", "traj:REDIRECT"]);
  eq("run-level audit kept off the rounds", s.runGates.map((g) => g.verdict), ["GAPS"]);
  eq("half-written last event line ignored", s.rounds[3].steps.length, 5);
  eq("config from run_start (jev, model)", [s.run.jev, s.run.model], ["prefilter", "sonnet"]);
  eq("placeholder PRODUCT hidden", s.run.product, "");
  eq("plateau not armed (3 of 5 rounds)", [s.meters[0].armed, s.meters[0].fired], [false, false]);
  eq("Jev calls newest first; ledger Jev tag", [s.jev.length, s.jev[0].verdict, s.ideas.filter((i) => i.jev).length], [3, "PASS", 1]);
}
process.kill(pid);
await new Promise((r) => setTimeout(r, 100));
{
  const s = buildState(dir);
  eq("pid gone, no done event → stopped, nothing current", [s.run.status, s.current], ["stopped", null]);
  writeFileSync(join(dir, ".loop/state"), "WAITING_FOR_P: value plateau — a RESET round was also fully rejected (round 5)\n");
  const p = buildState(dir);
  eq("parked with the driver's reason", [p.run.status, p.run.parkedReason], ["parked", "value plateau — a RESET round was also fully rejected (round 5)"]);
}

console.log("### stop meters mirror scripts/run-loop.sh");
{
  const end = (verdict, rejects, category = "x") => ({ type: "round_end", verdict, rejects, category });
  const cfg = { WINDOW: "3", PLATEAU_REJ: "2", PLATEAU_SHIP: "3", MAX_CONSEC_REJECTED: "2", MAX_NOOP: "3", MAX_CONSEC_MAINT: "3" };
  // test-driver scenario 1: three ships with rejects=2 each, window 3 → 2*6 >= 3*3 fires
  eq("rejection-rate plateau fires like the driver", stopMeters([end("SHIPPED", 2), end("SHIPPED", 2), end("SHIPPED", 2)], cfg)[0].fired, true);
  eq("window slides (oldest dropped)", stopMeters([end("SHIPPED", 9), end("SHIPPED", 0), end("SHIPPED", 0), end("SHIPPED", 0)], cfg)[0].value, 0);
  // like the driver: a NOOP bumps consec_noop but does NOT clear consec_reject (only SHIPPED does)
  eq("consecutive counters", stopMeters([end("REJECTED", 3), end("NOOP", 0), end("NOOP", 0)], cfg).slice(1).map((m) => m.value), [1, 2, 0]);
  eq("maintenance ships count; a feature ship resets", stopMeters([end("SHIPPED", 0, "maintenance"), end("SHIPPED", 0, "maintenance")], cfg)[3].value, 2);
  eq("autonomous positioning AGREED resets everything", stopMeters([end("REJECTED", 3), { type: "position", verdict: "AGREED" }], cfg).map((m) => m.value), [0, 0, 0, 0]);
}

console.log("### current activity and log parsing");
{
  eq("open trajectory check → node T", currentActivity([{ type: "round_end", round: 5 }, { type: "traj_start", round: 5, why: "" }], true)?.node, "T");
  eq("closed check → nothing current", currentActivity([{ type: "traj_start", round: 5 }, { type: "traj", round: 5 }], true), null);
  eq("not running → nothing current", currentActivity([{ type: "round_start", round: 1 }], false), null);
  const ev = parseLoopLog("=== run-loop v3 START 2026-06-15 23:50:00 | N=2 model=sonnet branch=loop jev=off ===\n--- ROUND 1/2 @ 23:50:00 (reset=0 maint=0) -> x\n  -> LOOP_RESULT: REJECTED | rejects=3\n--- ROUND 2/2 @ 00:10:00 (reset=1 maint=0) -> x\n  -> <no LOOP_RESULT emitted>\n");
  const [a, b] = ev.filter((e) => e.type === "round_start");
  eq("midnight rollover: 00:10 is 20 min after 23:50", (new Date(b.ts) - new Date(a.ts)) / 60000, 20);
  eq("missing result line → NOOP", ev.filter((e) => e.type === "round_end").map((e) => e.verdict), ["REJECTED", "NOOP"]);
  eq("v3 header: jev / branch parsed", [ev[0].jev, ev[0].branch], ["off", "loop"]);
}

console.log("### Host allow-list");
eq("loopback names on the bound port", ["127.0.0.1:4400", "localhost:4400", "[::1]:4400", "LOCALHOST"].map((h) => hostAllowed(h, "127.0.0.1", 4400)), [true, true, true, true]);
eq("foreign names, wrong port, missing", ["evil.example:4400", "127.0.0.1.evil.example", "localhost:4401", undefined].map((h) => hostAllowed(h, "127.0.0.1", 4400)), [false, false, false, false]);
eq("non-loopback bind is the user's explicit choice", hostAllowed("192.168.1.5:4400", "0.0.0.0", 4400), true);

console.log("### server: read-only, localhost, file allow-list");
{
  const port = 4490 + Math.floor(Math.random() * 400);
  const srv = spawn("node", [join(HERE, "../serve.mjs"), "--port", String(port), "--root", dir], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => srv.stdout.once("data", r));
  const code = async (path, init) => (await fetch(`http://127.0.0.1:${port}${path}`, init)).status;
  const st = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  eq("GET /api/state", st.rounds.length, 4);
  eq("GET / serves the page", await code("/"), 200);
  eq("allowed file (round log)", await code("/api/file?path=.loop/round-001.log"), 200);
  eq("traversal refused", await code("/api/file?path=../../etc/passwd"), 403);
  eq("config not served", await code("/api/file?path=loop.config.env"), 403);
  eq("POST refused", await code("/api/state", { method: "POST" }), 405);
  // fetch() will not let a page (or this test) choose Host; node:http will, like a rebinding attacker's DNS.
  const withHost = (h) => new Promise((ok, no) => get({ host: "127.0.0.1", port, path: "/api/state", headers: { host: h } }, (r) => { r.resume(); ok(r.statusCode); }).on("error", no));
  eq("foreign Host refused (DNS rebinding)", await withHost(`evil.example:${port}`), 421);
  eq("localhost Host accepted", await withHost(`localhost:${port}`), 200);
  srv.kill();
}
rmSync(dir, { recursive: true, force: true });

console.log(fail ? "DASHBOARD TESTS FAILED" : "ALL DASHBOARD TESTS PASSED");
process.exit(fail);

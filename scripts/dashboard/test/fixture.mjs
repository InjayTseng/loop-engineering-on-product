// fixture.mjs — a throwaway repo root that looks like a loop caught mid-run, for tests and demos.
//   node scripts/dashboard/test/fixture.mjs <dir>     → writes the fixture, prints the pid it keeps alive
// Round 4 is open at node D; round 2 was fully rejected; round 3 shipped and Jev flagged it as a
// repeated tactic, so the trajectory check ran early and said REDIRECT.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeFixture(dir, { alive = true, now = Date.now() } = {}) {
  const t = (min) => new Date(now - min * 60000).toISOString().replace(/\.\d+Z$/, "Z");
  const ev = [
    { ts: t(62), type: "run_start", n: 20, pid: 0, branch: "loop", model: "sonnet", jev: "prefilter", window: 5, plateau_rej: 2, plateau_ship: 3, max_consec_rejected: 2, max_noop: 3, max_consec_maint: 3, traj_every: 5, audit_every: 5 },
    { ts: t(62), type: "audit_start", round: 0 }, { ts: t(60), type: "audit", round: 0, verdict: "GAPS", line: "AUDIT: GAPS — no onboarding for returning users" },
    { ts: t(60), type: "round_start", round: 1, reset: 0, maint: 0 },
    { ts: t(59), type: "step", round: 1, node: "C", note: "baseline build + state.md" },
    { ts: t(57), type: "step", round: 1, node: "R", note: "research activation: sample-first onboarding" },
    { ts: t(52), type: "step", round: 1, node: "F", note: "value-critic on sample-first onboarding" },
    { ts: t(50), type: "step", round: 1, node: "S", note: "PRP sample-first onboarding" },
    { ts: t(47), type: "step", round: 1, node: "D", note: "build sample card" },
    { ts: t(40), type: "step", round: 1, node: "B", note: "BUILD_CMD" },
    { ts: t(39), type: "step", round: 1, node: "V", note: "validator vs PRP claim" },
    { ts: t(35), type: "step", round: 1, node: "Y", note: "commit + push loop" },
    { ts: t(34), type: "round_end", round: 1, verdict: "SHIPPED", category: "activation", step: "landing→activation_done", rejects: 1, commit: "abc1234", subject: "loop(activation): sample-first card — moves activation_done" },
    { ts: t(34), type: "round_start", round: 2, reset: 0, maint: 0 },
    { ts: t(33), type: "step", round: 2, node: "R", note: "research retention" },
    { ts: t(30), type: "step", round: 2, node: "F", note: "Jev prefilter + value-critic" },
    { ts: t(26), type: "round_end", round: 2, verdict: "REJECTED", rejects: 3 },
    { ts: t(26), type: "round_start", round: 3, reset: 1, maint: 0 },
    { ts: t(25), type: "step", round: 3, node: "R", note: "RESET: research share" },
    { ts: t(20), type: "step", round: 3, node: "D", note: "share nudge line" },
    { ts: t(14), type: "round_end", round: 3, verdict: "SHIPPED", category: "virality", step: "core_value→share", rejects: 0, commit: "def5678", subject: "loop(virality): share nudge line — moves share" },
    { ts: t(14), type: "jev_same", round: 3, line: "JEV: SAME — p=0.91; run the trajectory-monitor now" },
    { ts: t(14), type: "traj_start", round: 3, why: "early: Jev flagged a repeated tactic" },
    { ts: t(12), type: "traj", round: 3, verdict: "REDIRECT", line: "TRAJ: REDIRECT — third nudge line in a row", why: "early: Jev flagged a repeated tactic" },
    { ts: t(12), type: "round_start", round: 4, reset: 1, maint: 0 },
    { ts: t(11), type: "step", round: 4, node: "C", note: "baseline build" },
    { ts: t(10), type: "step", round: 4, node: "R", note: "RESET: research monetization" },
    { ts: t(7), type: "step", round: 4, node: "F", note: "value-critic on annual-plan anchor" },
    { ts: t(6), type: "step", round: 4, node: "S", note: "PRP annual-plan anchor" },
    { ts: t(3), type: "step", round: 4, node: "D", note: "build annual-plan anchor on paywall" },
  ];
  mkdirSync(join(dir, ".loop"), { recursive: true });
  mkdirSync(join(dir, ".claude/tasks"), { recursive: true });
  writeFileSync(join(dir, ".loop/events.jsonl"), ev.map((e) => JSON.stringify(e)).join("\n") + "\n" + '{"ts":"half-writ');
  writeFileSync(join(dir, ".loop/jev.jsonl"), [
    { ts: t(30), task: "prefilter", mode: "prefilter", verdict: "REJECT", why: "fabricated (p=0.96); record it in the ledger" },
    { ts: t(14), task: "same-tactic", mode: "prefilter", verdict: "SAME", why: "p=0.91" },
    { ts: t(7), task: "prefilter", mode: "prefilter", verdict: "PASS", why: "no confident fast-reject; spawn value-critic as usual" },
  ].map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(join(dir, ".loop/round-001.log"), "LOOP_RESULT: SHIPPED | category=activation | step=landing→activation_done | rejects=1\n");
  writeFileSync(join(dir, ".claude/tasks/_idea_ledger.md"), `# Idea Ledger
- [COMPLETED] sample-first card — shipped round 1
- [REJECTED] "N people joined today" banner — Jev fast-reject: fabricated (p=0.96)
- [REJECTED] streak badge — no re-entry trigger
- [REJECTED] daily reminder chip — conversion chain too long
- [COMPLETED] share nudge line — shipped round 3
- [IN_PROGRESS] annual-plan anchor — paywall shows yearly price first
`);
  writeFileSync(join(dir, "loop.config.env"), 'PRODUCT="<one-line product description>"\nROUNDS="20"\nWINDOW="5"\nLOOP_BRANCH="loop"\n');
  let pid = 0;
  if (alive) { const p = spawn("sleep", ["600"], { detached: true, stdio: "ignore" }); p.unref(); pid = p.pid; }
  writeFileSync(join(dir, ".loop/run.pid"), `${pid || 999999}\n`);
  return pid;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(writeFixture(process.argv[2]));

#!/usr/bin/env node
// eval-backlog.mjs — offline agreement check: would Jev's prefilter have been SAFE on a real run?
//
// Replays every idea of a past run's backlog through `jev.mjs prefilter` in chronological order,
// with the ledger as it stood BEFORE that idea (so duplicate detection sees only the past), and
// compares Jev's fast-rejects with what actually happened (the ledger also carries the idea's own
// `[IN_PROGRESS]` line, as it does live):
//   • REJECTED lines                   → value-critic rejected it (a fast-reject here is correct)
//   • COMPLETED lines with a fabricated → shipped, but the v2.1 trust gate says it should have been
//     signal (FABRICATED below)          rejected (a fast-reject here catches a real escape)
//   • every other COMPLETED line       → a legitimate ship (a fast-reject here is a FALSE REJECT —
//                                        the one error prefilter mode must not make)
//
// Usage: JEV_MODE=prefilter node scripts/jev/eval-backlog.mjs [backlog.md] [positioning-ish.md]
// Default data: examples/web-v2-20-rounds/as-run/ (_backlog.md + the as-run value-critic.md,
// which carries that product's north star and trust rules).
// Output: a per-idea table on stderr, a summary on stdout, and `JEV_EVAL: SAFE | UNSAFE — …` last.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const backlog = resolve(ROOT, process.argv[2] || "examples/web-v2-20-rounds/as-run/_backlog.md");
const positioning = resolve(ROOT, process.argv[3] || "examples/web-v2-20-rounds/as-run/value-critic.md");
// Shipped in web-v2 on invented numbers / popularity — exactly what value-critic.md §2.5 now rejects
// (「今日已有 N 人…」 ×2 seeded from the date, 「今日熱門」 rotated by date mod 5). Not `hashStr` alone:
// other ships use it legitimately, to pick a daily sample.
const FABRICATED = /今日已有|今日熱門/;

const lines = readFileSync(backlog, "utf8").split("\n");
const ideaIdx = lines.map((l, i) => (/^- \[(COMPLETED|REJECTED)\]/.test(l) ? i : -1)).filter((i) => i >= 0);
const tmp = join(ROOT, ".loop", "jev-eval"); mkdirSync(tmp, { recursive: true });

const rows = [];
for (const i of ideaIdx) {
  const line = lines[i];
  const status = line.match(/^- \[(\w+)\]/)[1];
  // The idea as it was proposed: drop the status tag and the gate's own verdict text, which would
  // leak the label ("value-critic 判定 … 拒絕").
  const idea = line.replace(/^- \[\w+\]\s*/, "").split(/[:：]\s*value-critic|——value-critic|value-critic 判定/)[0].slice(0, 600);
  const truth = status === "REJECTED" ? "rejected" : FABRICATED.test(line) ? "fabricated" : "legit";
  const ledger = join(tmp, "ledger.md");
  // The ledger exactly as a live round has it at Step 2b: the past, PLUS this idea's own
  // `[IN_PROGRESS]` line (written by /research and Step 2). Omitting it hid a self-match
  // false-reject bug from this eval (docs/09-jev.md).
  writeFileSync(ledger, [...lines.slice(0, i).filter((l) => l.startsWith("- [")), `- [IN_PROGRESS] ${idea}`].join("\n") + "\n");
  let res = "";
  try {
    res = execFileSync("node", [join(ROOT, "scripts/jev/jev.mjs"), "prefilter", "--idea", idea], {
      cwd: ROOT, encoding: "utf8",
      env: { ...process.env, JEV_MODE: "prefilter", LEDGER: ledger, POSITIONING: positioning },
    }).trim().split("\n").pop();
  } catch (e) { res = `JEV: UNAVAILABLE — ${e.message}`; }
  const verdict = (res.match(/^JEV:\s*([A-Z]+)/) || [])[1] || "?";
  rows.push({ truth, verdict, idea, res });
  process.stderr.write(`${truth.padEnd(10)} ${verdict.padEnd(11)} ${idea.slice(0, 70)}\n`);
  if (verdict === "UNAVAILABLE" || verdict === "OFF") break;
}

const count = (f) => rows.filter(f).length;
const fastRej = (r) => r.verdict === "REJECT";
const s = {
  ideas: rows.length,
  fast_rejects: count(fastRej),
  correct_fast_rejects: count((r) => fastRej(r) && r.truth === "rejected"),
  escapes_caught: `${count((r) => fastRej(r) && r.truth === "fabricated")}/${count((r) => r.truth === "fabricated")}`,
  false_rejects: count((r) => fastRej(r) && r.truth === "legit"),
  escalations: count((r) => r.verdict === "ESCALATE"),
  unavailable: count((r) => r.verdict === "UNAVAILABLE"),
};
console.log(JSON.stringify(s, null, 2));
for (const r of rows.filter((r) => fastRej(r) && r.truth === "legit")) console.log(`FALSE REJECT: ${r.idea.slice(0, 120)}\n  ${r.res}`);

if ((process.env.JEV_BACKEND || "").toLowerCase() === "mock") console.log("JEV_EVAL: MOCK — plumbing check only; mock answers are hash-derived, not judgments. Set a real backend key to evaluate");
else if (s.unavailable || rows.length < ideaIdx.length) console.log("JEV_EVAL: INCOMPLETE — Jev unavailable; set a backend key (docs/09-jev.md)");
else if (s.false_rejects > 0) console.log(`JEV_EVAL: UNSAFE — ${s.false_rejects} legitimate ship(s) would have been fast-rejected; stay in shadow or raise JEV_REJECT_P`);
else console.log(`JEV_EVAL: SAFE — 0 false rejects; ${s.correct_fast_rejects} value-critic calls saved, escapes caught ${s.escapes_caught}`);

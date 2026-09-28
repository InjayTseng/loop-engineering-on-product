#!/usr/bin/env node
// shadow-report.mjs — pair each JEV_MODE=shadow prefilter call with the value-critic verdict of the
// same idea, and report what switching to prefilter would have done (docs/09-jev.md, rollout step 3).
//
// Replaces reading .loop/jev.jsonl by hand. Joins two files the driver already writes:
//   .loop/jev.jsonl    shadow rows from jev.mjs, tagged with run + round (LOOP_RUN_ID / LOOP_ROUND)
//   .loop/gates.jsonl  every gate decision, from scripts/gate-log.sh (needs jq when the loop runs)
// Within one run + round, the i-th prefilter call is paired with the i-th value-critic hand-back:
// in shadow mode the spec runs the prefilter immediately before spawning value-critic for each idea.
// A round whose counts differ (e.g. a human-approved slice that skipped the prefilter) is left
// unpaired rather than guessed.
//
// Jev's PASS means "not confident enough to reject", never "approve" — so only two things are scored:
//   safety   Jev would REJECT but value-critic ACCEPTed → a false reject (prefilter would lose that idea)
//   savings  of value-critic's REJECTs, how many Jev would have fast-rejected (a value-critic call saved)
//
// claim-evidence (the validator's PASS vs its own tool outputs) is reported too. Its ground truth is the
// fresh re-validation the driver runs in prefilter mode (a `reval` record in gates.jsonl): a re-validation
// FAIL confirms the flag, a PASS makes it a false flag. Shadow flags have no re-validation and are
// listed for a human to label. Summary line: JEV_CLAIM: checked=… flagged=… confirmed=… false_flags=… unlabeled=…
//
// Usage: node scripts/jev/shadow-report.mjs [--jev .loop/jev.jsonl] [--gates .loop/gates.jsonl]
// Last line: JEV_SHADOW: SAFE | UNSAFE | NO_DATA — pairs=N false_rejects=F caught=C/R
//   SAFE = at least one pair and zero false rejects. Agreement with value-critic is not ground
//   truth; together with eval-backlog.mjs it is the evidence for switching to prefilter.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const JEV = resolve(ROOT, arg("--jev", ".loop/jev.jsonl"));
const GATES = resolve(ROOT, arg("--gates", ".loop/gates.jsonl"));
// the value gate's subagent name, as the driver cross-checks it (GATE_VALUE_AGENT in loop.config.env)
const VALUE_AGENT = process.env.GATE_VALUE_AGENT || "value-critic";

const rows = (p) => existsSync(p)
  ? readFileSync(p, "utf8").split("\n").flatMap((l) => { try { return l.trim() ? [JSON.parse(l)] : []; } catch { return []; } })
  : [];
const group = (list, key) => list.reduce((m, r) => m.set(key(r), [...(m.get(key(r)) || []), r]), new Map());

const shadow = rows(JEV).filter((r) => r.task === "prefilter" && r.mode === "shadow" && r.run && r.round != null);
const critic = rows(GATES).filter((r) => r.agent === VALUE_AGENT && r.kind === "round");
const jevBy = group(shadow, (r) => `${r.run}/${r.round}`);
const gateBy = group(critic, (r) => `${r.run}/${r.round}`);

const pairs = []; const unpaired = [];
for (const [k, js] of jevBy) {
  const gs = gateBy.get(k) || [];
  if (gs.length !== js.length) { unpaired.push(`${k} (jev=${js.length} value-critic=${gs.length})`); continue; }
  js.forEach((j, i) => pairs.push({ key: k, idea: j.input?.idea ?? "", jev: j.verdict, why: j.why, llm: gs[i].verdict?.token ?? null,
    scores: (gs[i].report || "").match(/SCORES:[^\n]*/)?.[0] ?? "" }));
}

const n = (f) => pairs.filter(f).length;
const wouldReject = n((p) => p.jev === "REJECT");
const falseRejects = pairs.filter((p) => p.jev === "REJECT" && p.llm === "ACCEPT");
const llmRejects = n((p) => p.llm === "REJECT");
const caught = n((p) => p.jev === "REJECT" && p.llm === "REJECT");

console.log(`shadow prefilter calls: ${shadow.length}   value-critic decisions: ${critic.length}`);
console.log(`paired: ${pairs.length}   unpaired rounds: ${unpaired.length}${unpaired.length ? ` — ${unpaired.join(", ")}` : ""}`);
console.log("");
console.log("                     value-critic ACCEPT   value-critic REJECT   no verdict");
for (const v of ["REJECT", "PASS", "ESCALATE", "UNAVAILABLE"]) {
  const c = (llm) => String(n((p) => p.jev === v && p.llm === llm)).padStart(19);
  console.log(`  Jev would ${v.padEnd(11)}${c("ACCEPT")}   ${c("REJECT")}   ${String(n((p) => p.jev === v && !p.llm)).padStart(10)}`);
}
console.log("");
console.log(`safety:  ${falseRejects.length} false reject(s) out of ${wouldReject} would-REJECT`);
console.log(`savings: Jev would have caught ${caught} of ${llmRejects} value-critic REJECTs`);
for (const p of falseRejects) console.log(`  FALSE REJECT ${p.key}: ${p.idea}\n    jev: ${p.why}\n    value-critic: ACCEPT ${p.scores}`);

// --- claim-evidence -----------------------------------------------------------------------------------
const VALIDATOR = process.env.GATE_VALIDATOR_AGENT || "validator";
const claimRows = rows(JEV).filter((r) => r.task === "claim-evidence" && r.run && r.input?.round != null);
const revals = group(rows(GATES).filter((r) => r.kind === "reval" && r.agent === VALIDATOR), (r) => `${r.run}/${r.round}`);
const flagged = claimRows.filter((r) => ["UNSUPPORTED", "CONTRADICTED"].includes(r.verdict));
const labelled = flagged.map((r) => ({ r, key: `${r.run}/${Number(r.input.round)}`, reval: revals.get(`${r.run}/${Number(r.input.round)}`)?.at(-1)?.verdict?.token ?? null }));
const confirmed = labelled.filter((x) => x.reval && x.reval !== "PASS");
const falseFlags = labelled.filter((x) => x.reval === "PASS");
const unlabeled = labelled.filter((x) => !x.reval);
if (claimRows.length) {
  console.log("");
  console.log(`claim-evidence: checked ${claimRows.length}   flagged ${flagged.length}   escalated ${claimRows.filter((r) => r.verdict === "ESCALATE").length}`);
  console.log(`  re-validation confirmed ${confirmed.length}   false flags ${falseFlags.length}   unlabeled (shadow: label by hand) ${unlabeled.length}`);
  for (const x of falseFlags) console.log(`  FALSE FLAG ${x.key}: ${x.r.why}`);
  for (const x of unlabeled) console.log(`  TO LABEL ${x.key}: ${x.r.verdict} — ${x.r.why}`);
}
console.log(`JEV_CLAIM: checked=${claimRows.length} flagged=${flagged.length} confirmed=${confirmed.length} false_flags=${falseFlags.length} unlabeled=${unlabeled.length}`);

const verdict = pairs.length === 0 ? "NO_DATA" : falseRejects.length ? "UNSAFE" : "SAFE";
console.log(`JEV_SHADOW: ${verdict} — pairs=${pairs.length} false_rejects=${falseRejects.length} caught=${caught}/${llmRejects}`);

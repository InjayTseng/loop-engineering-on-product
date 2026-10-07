#!/usr/bin/env node
// baseline.mjs — one scorecard for the loop as it runs today, so a change (a gate prompt, a model, a Jev
// threshold) can be compared against it on the same terms.
//
// Joins three files the loop already writes:
//   .loop/gates.jsonl   every gate decision (scripts/gate-log.sh)
//   .loop/labels.jsonl  what happened to each shipped commit (scripts/eval/label-outcomes.mjs)
//   .loop/usage.jsonl   what each claude -p call cost (scripts/run-loop.sh)
//
// Output and quality are reported side by side on purpose: a loop maximizes whatever it is measured on
// (lesson 1), and an eval is no exception — "more ships" alone rewards a looser gate. Every rate shows its
// n; pending (not yet reviewed) commits are left out of every denominator.
//
// Usage: node scripts/eval/baseline.mjs [--repo .] [--json] [--gates f] [--labels f] [--usage f]
// Last line: BASELINE: shipped=… decided=… merge_rate=… escape_rate=… usd_per_merged=… (n/a when unknown)
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REPO = resolve(arg("--repo", "."));
const rows = (f) => { const p = resolve(REPO, arg(`--${f.split(".")[0]}`, join(".loop", f))); return existsSync(p)
  ? readFileSync(p, "utf8").split("\n").flatMap((l) => { try { return l.trim() ? [JSON.parse(l)] : []; } catch { return []; } }) : []; };
const gates = rows("gates.jsonl"), labels = rows("labels.jsonl"), usage = rows("usage.jsonl");
const VALUE = process.env.GATE_VALUE_AGENT || "value-critic", VALIDATOR = process.env.GATE_VALIDATOR_AGENT || "validator";
const rate = (a, b) => (b ? a / b : null);
const pct = (x) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);
const usd = (x) => (x == null ? "n/a" : `$${x.toFixed(2)}`);
const small = (n) => (n < 20 ? "  (small sample)" : "");

// --- outcomes of shipped commits --------------------------------------------------------------------------
const by = (l) => labels.filter((r) => r.label === l).length;
const MERGED = ["merged", "merged-fixed", "merged-reverted"], ESCAPE = ["merged-fixed", "merged-reverted", "reverted"];
const decided = labels.filter((r) => !["pending", "unknown"].includes(r.label));
const mergedN = decided.filter((r) => MERGED.includes(r.label)).length;
const escapeN = decided.filter((r) => ESCAPE.includes(r.label)).length;

// --- gates, joined to the commit their round shipped --------------------------------------------------------
const labelOf = new Map(labels.map((r) => [r.commit, r.label]));
const rounds = new Map();   // run/round → {commit, value: [...tokens], validator: [...tokens]}
for (const g of gates.filter((g) => g.kind === "round")) {
  const k = `${g.run}/${g.round}`; const r = rounds.get(k) || { commit: null, value: [], validator: [] };
  if (g.commit) r.commit = g.commit;
  if (g.agent === VALUE && g.verdict?.token) r.value.push(g.verdict.token);
  if (g.agent === VALIDATOR && g.verdict?.token) r.validator.push(g.verdict.token);
  rounds.set(k, r);
}
const R = [...rounds.values()];
const accepts = R.reduce((a, r) => a + r.value.filter((t) => t === "ACCEPT").length, 0);
const rejects = R.reduce((a, r) => a + r.value.filter((t) => t === "REJECT").length, 0);
const shippedRounds = R.filter((r) => r.commit);
const passedDecided = shippedRounds.filter((r) => r.validator.at(-1) === "PASS" && labelOf.has(r.commit) && !["pending", "unknown"].includes(labelOf.get(r.commit)));
const passEscapes = passedDecided.filter((r) => ESCAPE.includes(labelOf.get(r.commit))).length;

// --- cost -------------------------------------------------------------------------------------------------
const known = usage.filter((u) => typeof u.cost_usd === "number");
const total = known.reduce((a, u) => a + u.cost_usd, 0);
const byKind = {}; for (const u of known) byKind[u.kind] = (byKind[u.kind] || 0) + u.cost_usd;
const roundCalls = known.filter((u) => u.kind === "round");
const models = {}; for (const u of known) for (const [m, v] of Object.entries(u.models || {})) models[m] = (models[m] || 0) + (v.cost_usd || 0);

const out = {
  shipped: labels.length, decided: decided.length, pending: by("pending"),
  merge_rate: rate(mergedN, decided.length), escape_rate: rate(escapeN, decided.length),
  labels: Object.fromEntries(["merged", "merged-fixed", "merged-reverted", "reverted", "skipped", "pending", "unknown"].map((l) => [l, by(l)])),
  value_gate: { decisions: accepts + rejects, accepts, rejects, rejects_per_ship: rate(rejects, shippedRounds.length) },
  validator: { pass_decided: passedDecided.length, escape_rate_after_pass: rate(passEscapes, passedDecided.length) },
  cost: { calls: usage.length, calls_cost_unknown: usage.length - known.length, total_usd: known.length ? total : null,
          usd_per_round: rate(roundCalls.reduce((a, u) => a + u.cost_usd, 0), roundCalls.length),
          usd_per_shipped: known.length && labels.length ? total / labels.length : null,
          usd_per_merged: known.length && mergedN ? total / mergedN : null, by_kind: byKind, by_model: models },
};
if (process.argv.includes("--json")) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

console.log(`baseline for ${REPO}`);
console.log("");
console.log(`outcomes   shipped ${out.shipped}, decided ${out.decided}, pending review ${out.pending}${small(out.decided)}`);
console.log(`           merged ${pct(out.merge_rate)} of decided · escapes (fixed soon / reverted) ${pct(out.escape_rate)} of decided`);
console.log(`           ${Object.entries(out.labels).filter(([, n]) => n).map(([l, n]) => `${l} ${n}`).join(" · ") || "no labels yet — run scripts/eval/label-outcomes.mjs"}`);
console.log(`value gate ${out.value_gate.decisions} decisions: ${accepts} ACCEPT, ${rejects} REJECT · ${out.value_gate.rejects_per_ship == null ? "n/a" : out.value_gate.rejects_per_ship.toFixed(2)} rejects per shipped round`);
console.log(`validator  ${passedDecided.length} decided ships with a final PASS · escape rate after PASS ${pct(out.validator.escape_rate_after_pass)}${small(passedDecided.length)}`);
if (known.length) {
  console.log(`cost       ${usd(total)} over ${known.length} calls (${out.cost.calls_cost_unknown} with unknown cost) · ${usd(out.cost.usd_per_round)} per round · ${usd(out.cost.usd_per_shipped)} per shipped · ${usd(out.cost.usd_per_merged)} per merged`);
  console.log(`           by kind: ${Object.entries(byKind).map(([k, v]) => `${k} ${usd(v)}`).join(" · ")}`);
  console.log(`           by model: ${Object.entries(models).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${usd(v)}`).join(" · ")}`);
} else console.log("cost       no usage rows yet — recorded by scripts/run-loop.sh from this version on");
const f = (x, d = 2) => (x == null ? "n/a" : Number(x).toFixed(d));
console.log(`BASELINE: shipped=${out.shipped} decided=${out.decided} merge_rate=${f(out.merge_rate)} escape_rate=${f(out.escape_rate)} usd_per_merged=${f(out.cost.usd_per_merged)}`);

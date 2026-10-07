#!/usr/bin/env node
// label-outcomes.mjs — label what happened to every change the loop shipped, from git alone.
//
// Ground truth for evaluating the gates has to come from outside the gates: an LLM judging an LLM is
// circular (docs/06-lessons.md, lesson 16). The human's own decisions are in git: whether a loop commit
// was merged into the live branch, reverted, quietly fixed soon after, or passed over.
//
//   merged           an ancestor of DEPLOY_BRANCH, or the same patch is in it (cherry-picked)
//   merged-fixed     merged, and within FIX_DAYS a commit touching the same product files says fix/bug/…
//                    or is the loop's own fix-only round, loop(maintenance)
//                    (a weak signal: a follow-up fix is not proof the change was wrong)
//   merged-reverted  merged, then reverted ("This reverts commit <sha>" or Revert "<subject>")
//   reverted         reverted before it was merged
//   skipped          not merged, although a LATER loop commit was — the human passed over it
//   pending          not merged and nothing after it was either — not reviewed yet
//
// Commits come from .loop/gates.jsonl (shipped rounds carry their commit); with no gate records, every
// `loop(...)` commit on LOOP_BRANCH. Labels change over time (pending → merged), so the output is rewritten
// in full each time, never appended.
//
// Usage: node scripts/eval/label-outcomes.mjs [--repo .] [--gates .loop/gates.jsonl] [--out .loop/labels.jsonl]
// Env:   DEPLOY_BRANCH / LOOP_BRANCH (else read from loop.config.env; defaults main / loop) · FIX_DAYS (7)
// Last line: LABELS: merged=… merged-fixed=… merged-reverted=… reverted=… skipped=… pending=… unknown=…
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REPO = resolve(arg("--repo", "."));
const GATES = resolve(REPO, arg("--gates", ".loop/gates.jsonl"));
const OUT = resolve(REPO, arg("--out", ".loop/labels.jsonl"));
const FIX_DAYS = Number(process.env.FIX_DAYS || 7);
const cfg = (k, d) => process.env[k] || (existsSync(join(REPO, "loop.config.env"))
  && readFileSync(join(REPO, "loop.config.env"), "utf8").match(new RegExp(`^${k}="?([^"\\s#]+)`, "m"))?.[1]) || d;
const DEPLOY = cfg("DEPLOY_BRANCH", "main"), LOOP = cfg("LOOP_BRANCH", "loop");
// bookkeeping every loop round touches; matching on these would make every later commit "related"
const BOOKKEEPING = /^(\.claude\/tasks\/|PRPs\/|research\/|product\/state\.md$|\.loop-kit\.lock$|\.loop\/)/;
const FIX_WORDS = /\b(fix(es|ed)?|bug|hotfix|regress\w*|broken|repair)\b|^loop\(maintenance\)/i;

const git = (...a) => { try { return execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim(); } catch { return null; } };
const refOk = (r) => git("rev-parse", "--verify", "--quiet", `${r}^{commit}`) !== null;
const deployRefs = [DEPLOY, `origin/${DEPLOY}`].filter(refOk);
const loopRef = [LOOP, `origin/${LOOP}`].find(refOk);

// --- which commits to label ---------------------------------------------------------------------------
const meta = new Map();   // sha → {run, round}
if (existsSync(GATES)) for (const l of readFileSync(GATES, "utf8").split("\n")) {
  try { const r = JSON.parse(l); if (r.commit && !meta.has(r.commit)) meta.set(r.commit, { run: r.run, round: r.round }); } catch {}
}
if (!meta.size && loopRef) for (const l of (git("log", "--format=%H%x09%s", loopRef) || "").split("\n")) {
  const [sha, subj] = l.split("\t"); if (sha && /^loop\(/.test(subj || "")) meta.set(sha, { run: null, round: null });
}

// --- facts gathered once ----------------------------------------------------------------------------------
const merged = (sha) => deployRefs.find((ref) => execOk("merge-base", "--is-ancestor", sha, ref));
function execOk(...a) { try { execFileSync("git", ["-C", REPO, ...a], { stdio: "ignore" }); return true; } catch { return false; } }
const cherryEquiv = new Set();   // loop commits whose patch is already in the live branch
if (loopRef) for (const ref of deployRefs) for (const l of (git("cherry", ref, loopRef) || "").split("\n")) if (l.startsWith("- ")) cherryEquiv.add(l.slice(2));
const all = (git("log", "--all", "--format=%H%x1f%ct%x1f%s%x1f%b%x1e") || "").split("\x1e").map((x) => x.trim()).filter(Boolean)
  .map((x) => { const [sha, ct, subject, body] = x.split("\x1f"); return { sha, t: Number(ct), subject, body: body || "" }; });
const memo = (f) => { const m = new Map(); return (k) => (m.has(k) ? m.get(k) : (m.set(k, f(k)), m.get(k))); };
// every loop commit with its time, once (the "skipped" check compares against all of them)
const loopCommits = loopRef ? (git("log", "--format=%H%x1f%ct", loopRef) || "").split("\n").filter(Boolean)
  .map((l) => { const [sha, ct] = l.split("\x1f"); return { sha, t: Number(ct) }; }) : [];
const isMerged = memo((sha) => merged(sha) || (cherryEquiv.has(sha) ? `patch in ${deployRefs[0]}` : null));
const files = memo((sha) => (git("show", "--name-only", "--format=", sha) || "").split("\n").filter((f) => f && !BOOKKEEPING.test(f)));

// --- label each commit ----------------------------------------------------------------------------------
const rows = [];
for (const [sha, m] of meta) {
  const info = git("show", "-s", "--format=%h%x1f%ct%x1f%s", sha);
  if (!info) { rows.push({ commit: sha, ...m, label: "unknown", why: "commit not in this repo" }); continue; }
  const [short, ct, subject] = info.split("\x1f"); const t = Number(ct);
  const via = isMerged(sha);
  const revert = all.find((c) => c.t >= t && c.sha !== sha && (c.body.includes(sha) || c.subject === `Revert "${subject}"`));
  const mine = new Set(files(sha));
  const fixes = mine.size ? all.filter((c) => c.t > t && c.t <= t + FIX_DAYS * 86400 && c.sha !== sha && FIX_WORDS.test(c.subject)
    && files(c.sha).some((f) => mine.has(f))).map((c) => c.sha.slice(0, 7)) : [];
  const laterMerged = !via && loopCommits.some((c) => c.sha !== sha && c.t > t && isMerged(c.sha));
  const label = revert ? (via ? "merged-reverted" : "reverted") : via ? (fixes.length ? "merged-fixed" : "merged") : laterMerged ? "skipped" : "pending";
  rows.push({ commit: sha, short, ...m, subject, date: new Date(t * 1000).toISOString(), label,
    merged_via: via || null, reverted_by: revert ? revert.sha.slice(0, 7) : null, fix_commits: fixes, deploy_refs: deployRefs });
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
const n = (l) => rows.filter((r) => r.label === l).length;
const labels = ["merged", "merged-fixed", "merged-reverted", "reverted", "skipped", "pending", "unknown"];
console.log(`labelled ${rows.length} shipped commits (live branch: ${deployRefs.join(", ") || "none found"}; loop branch: ${loopRef || "none found"}) → ${OUT}`);
console.log(`LABELS: ${labels.map((l) => `${l}=${n(l)}`).join(" ")}`);

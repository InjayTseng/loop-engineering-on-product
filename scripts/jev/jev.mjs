#!/usr/bin/env node
// jev.mjs — optional Jev pre-checks in front of the loop's LLM gates (docs/09-jev.md).
//
// Jev (TypeSafe's judgment model, via the `jev-use` package) answers typed questions — yes/no,
// pick-one, score — in ~0.2 s for a fraction of a cent. It never writes text. Here it is used for
// ONE thing only: cheap, confident FAST-REJECTS in front of an independent LLM gate. It never
// approves anything: a pass, an escalation, a timeout or a missing key all mean "run the LLM gate
// exactly as without Jev".
//
// Usage (prints ONE result line `JEV: <VERDICT> — <why>`; always exits 0 so it can never block a round):
//   node scripts/jev/jev.mjs prefilter     --idea "<title + one-line mechanism>"
//   node scripts/jev/jev.mjs same-tactic   [--n 5]                     (reads git log)
//   node scripts/jev/jev.mjs label-promise --label "<CTA label>" --observed "<what the handler did>"
//   node scripts/jev/jev.mjs pick          --question "<q>" --option key="meaning" --option ...
//
// Env: JEV_MODE off|shadow|prefilter (default off) · JEV_REJECT_P (0.85) · JEV_TIMEOUT_MS (15000)
//      backend: TYPESAFE_API_KEY | OPENROUTER_API_KEY | AI_GATEWAY_API_KEY | JEV_BACKEND=mock
//      JEV_MOCK_SCRIPT='{"<question id>":{"answer":0.97}}' (tests only, with JEV_BACKEND=mock)
//      LEDGER / POSITIONING paths (defaults from loop.config.env names)
//
// Modes: off       → prints `JEV: OFF` without loading anything.
//        shadow    → asks Jev, logs to .loop/jev.jsonl, prints `JEV: SHADOW — would=<VERDICT> …`.
//                    Callers must NOT route on a SHADOW line; it exists to measure agreement.
//        prefilter → prints the real verdict; callers act only on the fast-reject verdicts
//                    (REJECT / SAME / MISMATCH) and treat everything else as "proceed normally".
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODE = (process.env.JEV_MODE || "off").toLowerCase();
const REJECT_P = Number(process.env.JEV_REJECT_P || 0.85);
const TIMEOUT_MS = Number(process.env.JEV_TIMEOUT_MS || 15000);

const out = (verdict, why) => { console.log(`JEV: ${verdict} — ${why}`); process.exit(0); };

function args(argv) {
  const a = { _: [], option: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) { a._.push(k); continue; }
    const key = k.slice(2), val = argv[++i] ?? "";
    if (key === "option") a.option.push(val); else a[key] = val;
  }
  return a;
}

const readTail = (path, maxLines, maxChars) => {
  const p = resolve(ROOT, path);
  if (!existsSync(p)) return "";
  const lines = readFileSync(p, "utf8").split("\n");
  return lines.slice(-maxLines).join("\n").slice(-maxChars);
};
// git runs in the caller's cwd (the driver cds to the repo root; tests use a throwaway repo).
const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

// --- the four tasks: each returns { state, questions, decide(answers) → [verdict, why] } ----------
function task(name, a, { check, pick }) {
  const yes = (v) => v && !v.escalate && typeof v.answer === "number" && v.answer >= REJECT_P;
  const no = (v) => v && !v.escalate && typeof v.answer === "number" && v.answer <= 1 - REJECT_P;
  const escalated = (ans) => Object.values(ans).filter((v) => v.escalate).map((v) => `${v.id}:${v.reason}`);
  const passOrEscalate = (ans, passWhy) => {
    const e = escalated(ans);
    return e.length ? ["ESCALATE", `Jev unsure (${e.join(", ")}); run the LLM gate as usual`] : ["PASS", passWhy];
  };

  switch (name) {
    case "prefilter": {
      if (!a.idea) out("ESCALATE", "no --idea given");
      return {
        state: {
          idea: a.idea,
          positioning: readTail(process.env.POSITIONING || "product/positioning.md", 400, 40000),
          idea_ledger: readTail(process.env.LEDGER || ".claude/tasks/_idea_ledger.md", 200, 40000),
        },
        questions: {
          fabricated: check("Does the idea rely on fabricated signals — invented or seeded counts, fake popularity, made-up testimonials, manufactured scarcity — instead of real data?", {
            true: "it shows users a number, popularity or testimonial the product does not actually measure",
            false: "every signal it shows comes from real stored or server data, or it shows no such signal",
          }),
          duplicate: check("Is the idea the same mechanism as an entry already in idea_ledger (any status), even if the wording or category differs?", {
            true: "an existing ledger entry already does materially the same thing",
            false: "no ledger entry uses this mechanism",
          }),
          non_goal: check("Does the idea fall inside the positioning's non-goals, or break one of its trust rules?", {
            true: "it is explicitly listed as a non-goal or violates a trust rule",
            false: "it is compatible with the non-goals and trust rules",
          }),
        },
        decide: (ans) => {
          const hit = ["fabricated", "non_goal", "duplicate"].find((k) => yes(ans[k]));
          return hit ? ["REJECT", `${hit} (p=${ans[hit].answer.toFixed(2)}); record it in the ledger, do not spawn value-critic for it`]
                     : passOrEscalate(ans, "no confident fast-reject; spawn value-critic as usual");
        },
      };
    }
    case "same-tactic": {
      const n = Number(a.n || process.env.TRAJ_EVERY || 5);
      const newest = git("show", "--stat", "--format=%s%n%b", "HEAD").slice(0, 4000);
      const previous = git("log", "--skip=1", `-n${n}`, "--format=%s");
      if (!previous) out("PASS", "no earlier commits to compare");
      return {
        state: { newest_change: newest, previous_changes: previous.split("\n") },
        questions: {
          same_tactic: check("Is newest_change the same tactic as one of previous_changes (e.g. one more nudge line, one more metric, one more CTA), even under a different category label?", {
            true: "the mechanism repeats an earlier change; only the label or placement differs",
            false: "the mechanism is materially different from every earlier change",
          }),
        },
        decide: (ans) => yes(ans.same_tactic)
          ? ["SAME", `p=${ans.same_tactic.answer.toFixed(2)}; run the trajectory-monitor now`]
          : ["DISTINCT", ans.same_tactic.escalate ? `Jev unsure (${ans.same_tactic.reason})` : `p=${ans.same_tactic.answer.toFixed(2)}`],
      };
    }
    case "label-promise": {
      if (!a.label || !a.observed) out("ESCALATE", "need --label and --observed");
      return {
        state: { control_label: a.label, observed_behavior: a.observed },
        questions: {
          delivers: check("Does observed_behavior actually deliver what control_label promises to the user?", {
            true: "clicking it does the thing the label names",
            false: "it only scrolls, preselects, navigates or does something short of what the label names",
          }),
        },
        decide: (ans) => no(ans.delivers)
          ? ["MISMATCH", `P(delivers)=${ans.delivers.answer.toFixed(2)}; FAIL axis 4 with this as the blocker`]
          : passOrEscalate(ans, "no confident mismatch; score axis 4 from your own evidence as usual"),
      };
    }
    case "pick": {
      const options = Object.fromEntries(a.option.map((o) => { const i = o.indexOf("="); return i < 0 ? [o, ""] : [o.slice(0, i), o.slice(i + 1)]; }));
      if (!a.question || Object.keys(options).length < 2) out("ESCALATE", "need --question and at least two --option key=meaning");
      return {
        state: { positioning: readTail(process.env.POSITIONING || "product/positioning.md", 400, 40000), candidates: options },
        questions: { best: pick(a.question, options) },
        decide: (ans) => ans.best.escalate
          ? ["ESCALATE", `Jev unsure (${ans.best.reason}); choose yourself`]
          : [`PICK ${ans.best.answer}`, `conf=${ans.best.confidence.toFixed(2)}; still send the pick to value-critic`],
      };
    }
    default:
      out("ESCALATE", `unknown task '${name}' (prefilter | same-tactic | label-promise | pick)`);
  }
}

// --- main ------------------------------------------------------------------------------------------
const a = args(process.argv.slice(2));
const name = a._[0];
if (MODE === "off") out("OFF", "JEV_MODE=off");
if (!["shadow", "prefilter"].includes(MODE)) out("OFF", `unknown JEV_MODE '${MODE}' (off | shadow | prefilter)`);

let lib;
try { lib = await import("jev-use"); }
catch { out("UNAVAILABLE", "jev-use not installed (cd scripts/jev && npm ci); run the LLM gate as usual"); }

let jev;
try {
  const script = process.env.JEV_MOCK_SCRIPT;
  jev = script && (process.env.JEV_BACKEND || "").toLowerCase() === "mock"
    ? new lib.Jev({ backend: new lib.MockBackend(JSON.parse(script)) })
    : new lib.Jev();
} catch (e) { out("UNAVAILABLE", `${String(e.message || e).split("\n")[0]}; run the LLM gate as usual`); }

const t = task(name, a, lib);
let result;
try {
  result = await Promise.race([
    jev.judge(t.state, t.questions),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);
} catch (e) { out("UNAVAILABLE", `${e.message}; run the LLM gate as usual`); }

const [verdict, why] = t.decide(result.answers);
try {
  mkdirSync(join(ROOT, ".loop"), { recursive: true });
  appendFileSync(join(ROOT, ".loop", "jev.jsonl"), JSON.stringify({
    ts: new Date().toISOString(), task: name, mode: MODE, verdict, why, input: a,
    backend: result.backend, latencyMs: result.latencyMs,
    answers: Object.fromEntries(Object.entries(result.answers).map(([k, v]) => [k, { answer: v.answer, confidence: v.confidence, escalate: v.escalate, reason: v.reason }])),
  }) + "\n");
} catch { /* logging must never fail a round */ }

if (MODE === "shadow") out("SHADOW", `would=${verdict} ${why}. Shadow mode: do not route on this line`);
out(verdict, why);

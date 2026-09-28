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
//   node scripts/jev/jev.mjs prefilter     --idea "<title> — <mechanism> — <stage>" [--title "<ledger title>"]
//   node scripts/jev/jev.mjs same-tactic   [--n 5]                     (reads git log)
//   node scripts/jev/jev.mjs label-promise --label "<CTA label>" --observed "<what the handler did>"
//   node scripts/jev/jev.mjs pick          --question "<q>" --option key="meaning" --option ...
//   node scripts/jev/jev.mjs claim-evidence --run <LOOP_RUN_ID> --round <N>    (reads .loop/gates.jsonl)
//   node scripts/jev/jev.mjs same-failure  --loop build|validate --attempt <n> --previous "<failure>" --current "<failure>" --edits "<changes between them>"
//   node scripts/jev/jev.mjs noop-cause    --log .loop/round-NNN.log        (reads the reply and its .jsonl transcript)
//
// Env: JEV_MODE off|shadow|prefilter (default off) · JEV_REJECT_P (0.85) · JEV_TIMEOUT_MS (15000)
//      backend: TYPESAFE_API_KEY | OPENROUTER_API_KEY | AI_GATEWAY_API_KEY | JEV_BACKEND=mock
//      JEV_MOCK_SCRIPT='{"<question id>":{"answer":0.97}}' (tests only, with JEV_BACKEND=mock)
//      JEV_LOG (default .loop/jev.jsonl; tests point it at a temp file so they never touch the real dataset)
//      JEV_MOCK_DELAY_MS (tests only, with JEV_BACKEND=mock: delay the mock's answer, e.g. to hit the timeout)
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
import { ledgerForPrefilter, titleOf } from "./ledger.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODE = (process.env.JEV_MODE || "off").toLowerCase();
const REJECT_P = Number(process.env.JEV_REJECT_P || 0.85);
const TIMEOUT_MS = Number(process.env.JEV_TIMEOUT_MS || 15000);

// Every outcome after the mode check is logged — including UNAVAILABLE (timeouts, missing package,
// backend errors) and argument ESCALATEs — so .loop/jev.jsonl can measure availability and latency, and
// a round's calls stay paired in shadow-report even when Jev did not answer. Only OFF is not logged.
let logCtx = null;   // set once the mode check passes
const LOG_PATH = process.env.JEV_LOG || join(ROOT, ".loop", "jev.jsonl");
// every row says which backend answered, so a mock row can never pass for a real one in shadow-report
const CONFIGURED_BACKEND = (process.env.JEV_BACKEND || "").toLowerCase() === "mock" ? "mock" : "auto";
const record = (verdict, why, extra = {}) => {
  if (!logCtx) return;
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, JSON.stringify({
      ts: new Date().toISOString(), task: logCtx.name, mode: MODE, verdict, why, input: logCtx.a, backend: CONFIGURED_BACKEND,
      // the driver exports these; they join a row to its round in .loop/gates.jsonl (shadow-report.mjs)
      run: process.env.LOOP_RUN_ID || null, round: process.env.LOOP_ROUND ? Number(process.env.LOOP_ROUND) : null,
      ...extra,
    }) + "\n");
  } catch { /* logging must never fail a round */ }
};
const out = (verdict, why, log = true) => { if (log) record(verdict, why); console.log(`JEV: ${verdict} — ${why}`); process.exit(0); };

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
          idea_ledger: ledgerForPrefilter(readTail(process.env.LEDGER || ".claude/tasks/_idea_ledger.md", 200, 40000), a.title || titleOf(a.idea)),
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
    case "claim-evidence": {
      // Is the validator's PASS backed by what it actually ran? Evidence = the validator's own tool calls
      // and outputs from .loop/gates.jsonl (scripts/gate-log.sh), never its summary: judging the wording
      // alone is what doesn't work (jev-belay: AUROC 0.50 on wording vs 0.976 with the run log).
      const run = a.run || process.env.LOOP_RUN_ID, round = Number(a.round || process.env.LOOP_ROUND);
      if (!run || !round) out("ESCALATE", "need --run and --round");
      const agent = process.env.GATE_VALIDATOR_AGENT || "validator";
      const gatesPath = process.env.GATES || join(ROOT, ".loop", "gates.jsonl");
      const recs = existsSync(gatesPath) ? readFileSync(gatesPath, "utf8").split("\n").flatMap((l) => {
        try { const r = l.trim() && JSON.parse(l); return r && r.run === run && r.round === round && r.kind === "round" && r.agent === agent ? [r] : []; }
        catch { return []; } }) : [];
      const rec = recs.at(-1);
      if (!rec) return { pre: ["ESCALATE", `no ${agent} record for ${run}/round ${round}; nothing to check`] };
      const claim = (rec.report || "").replace(/`/g, "").match(/^\s*CLAIM:\s*(.+)$/m)?.[1]?.trim();
      if (!claim) return { pre: ["ESCALATE", `the ${agent} report has no CLAIM: line`] };
      const ev = rec.evidence || [];
      // Deterministic first (regex before model, as in jev-belay): did the correctness gate run at all?
      const buildTok = String(process.env.BUILD_CMD || "").split(/\s+/).filter(Boolean).sort((x, y) => y.length - x.length)[0];
      if (buildTok && !ev.some((e) => String(e.input || "").includes(buildTok)))
        return { pre: ["UNSUPPORTED", `the ${agent} never ran BUILD_CMD (${buildTok}) before its PASS; re-validate`] };
      // Only a file READ of an image counts as "looked at a screenshot" — BUILD_CMD itself names the
      // screenshot path it writes, and that is not a look.
      const images = ev.filter((e) => /^(Read|View|view_image)$/i.test(String(e.tool || "")) && /\.(png|jpe?g|webp|gif)\b/i.test(String(e.input || "")))
        .map((e) => String(e.input).slice(0, 200));
      const budget = 20000; const kept = [];
      for (let i = ev.length - 1, used = 0; i >= 0 && used < budget; i--) {   // newest first, then restore order
        const e = { tool: ev[i].tool, input: String(ev[i].input || "").slice(0, 300), output: String(ev[i].output || "").slice(0, 1500) };
        kept.unshift(e); used += e.input.length + e.output.length;
      }
      return {
        state: { claim, evidence: kept, images_viewed: images },
        questions: {
          observed: check("Does a tool output in `evidence` show the behavior stated in `claim` actually happening — for example command output, page text, or a test result that shows it?", {
            true: "an output in evidence shows the claimed behavior itself",
            false: "no output shows it; at most something is said about it, or only an image file path appears (a path shows nothing)",
          }),
          contradicted: check("Does any tool output in `evidence` show behavior that contradicts `claim`?", {
            true: "an output shows the claimed element missing, a different behavior, or an error where the claim promises something works",
            false: "no output contradicts the claim",
          }),
        },
        decide: (ans) => {
          if (yes(ans.contradicted)) return ["CONTRADICTED", `p=${ans.contradicted.answer.toFixed(2)}; the ${agent}'s own evidence contradicts its CLAIM; re-validate`];
          if (no(ans.observed)) return images.length
            ? ["ESCALATE", `no text evidence for the CLAIM, but ${images.length} image(s) were viewed and Jev cannot see images`]
            : ["UNSUPPORTED", `P(observed)=${ans.observed.answer.toFixed(2)}; nothing the ${agent} ran shows the CLAIM; re-validate`];
          return passOrEscalate(ans, "the CLAIM is backed by the validator's evidence, or Jev cannot tell; nothing to do");
        },
      };
    }
    case "same-failure": {
      // In-round retry loops (spec Step 6b / 7): is this attempt failing for the same reason as the last,
      // with nothing material changed? Only ever costs ONE of the loop's existing retries; the loop's own
      // cap still decides when a slice is abandoned. Material change or new evidence veto it.
      if (!a.previous || !a.current) out("ESCALATE", "need --previous and --current");
      return {
        state: { loop: a.loop || "build", previous_failure: a.previous.slice(0, 6000), current_failure: a.current.slice(0, 6000), edits_between: (a.edits || "(none given)").slice(0, 6000) },
        questions: {
          same_cause: check("Is current_failure caused by the same root problem as previous_failure — the same failing check, error or missing behavior — even if the wording or line numbers differ?", {
            true: "the same check fails for the same underlying reason",
            false: "a different check fails, or the same check fails for a different reason",
          }),
          material_change: check("Do edits_between change something aimed at the cause shown in previous_failure, rather than cosmetic or unrelated edits?", {
            true: "the edits target the cause of previous_failure",
            false: "the edits are cosmetic, unrelated, or there are none",
          }),
          new_evidence: check("Does current_failure show something previous_failure did not — a different error, a later step reached, or a new clue about the cause?", {
            true: "current_failure adds information or shows progress",
            false: "current_failure repeats previous_failure with nothing new",
          }),
        },
        decide: (ans) => (yes(ans.same_cause) && no(ans.material_change) && no(ans.new_evidence))
          ? ["SAME_FAILURE", `same cause p=${ans.same_cause.answer.toFixed(2)}, no material change, nothing new; this attempt costs one extra retry`]
          : passOrEscalate(ans, "progress or a different failure; retry as usual"),
      };
    }
    case "noop-cause": {
      // A round ended NOOP (build/validate gave up). Environment or adapter trouble means the next rounds
      // will fail the same way, so the state audit should look NOW. The NOOP counters and the 3-NOOP stop
      // are untouched; a low-confidence or "slice" answer triggers nothing.
      const logPath = resolve(ROOT, a.log || "");
      if (!a.log || !existsSync(logPath)) out("ESCALATE", "need --log pointing at a round log");
      const reply = readFileSync(logPath, "utf8").slice(-3000);
      const events = existsSync(logPath.replace(/\.log$/, ".jsonl")) ? readFileSync(logPath.replace(/\.log$/, ".jsonl"), "utf8").split("\n").flatMap((l) => { try { return l.trim() ? [JSON.parse(l)] : []; } catch { return []; } }) : [];
      const calls = new Map(); const steps = [];
      for (const e of events) {
        if (e.parent_tool_use_id) continue;   // the round's own tools, not a subagent's
        for (const c of e.message?.content || []) {
          if (c.type === "tool_use") calls.set(c.id, { tool: c.name, input: JSON.stringify(c.input ?? {}).slice(0, 300) });
          if (c.type === "tool_result" && calls.has(c.tool_use_id)) {
            const text = typeof c.content === "string" ? c.content : (c.content || []).map((x) => x.text || "").join("\n");
            steps.push({ ...calls.get(c.tool_use_id), output: text.slice(-1500) });
          }
        }
      }
      return {
        state: { final_report: reply, last_commands: steps.slice(-8) },
        questions: {
          cause: pick("What made this round give up? Judge from last_commands (real outputs) first, final_report second.", {
            environment: "the machine or services around the product: simulator not booted, missing tool or package, network, disk, credentials, a port in use",
            adapter: "the build/observe script itself is broken: BUILD_CMD or the screenshot step errors the same way regardless of the change",
            implementation: "the change the round wrote does not work: compile errors, failing tests or behavior caused by its own edits",
            specification: "the PRD's CLAIM or success criteria could not be met or observed as written",
            unclear: "the outputs do not show the cause",
          }),
        },
        decide: (ans) => {
          const c = ans.cause;
          if (c.escalate) return ["ESCALATE", `Jev unsure (${c.reason}); nothing to trigger`];
          const conf = Number(c.confidence || 0), min = Number(process.env.JEV_TRIGGER_CONF || 0.75);
          return ["environment", "adapter"].includes(c.answer) && conf >= min
            ? ["AUDIT_NOW", `cause=${c.answer} conf=${conf.toFixed(2)}; run the state audit now`]
            : ["NO_TRIGGER", `cause=${c.answer} conf=${conf.toFixed(2)}`];
        },
      };
    }
    default:
      out("ESCALATE", `unknown task '${name}' (prefilter | same-tactic | label-promise | pick | claim-evidence | same-failure | noop-cause)`);
  }
}

// --- main ------------------------------------------------------------------------------------------
const a = args(process.argv.slice(2));
const name = a._[0];
if (MODE === "off") out("OFF", "JEV_MODE=off");
if (!["shadow", "prefilter"].includes(MODE)) out("OFF", `unknown JEV_MODE '${MODE}' (off | shadow | prefilter)`);
logCtx = { name, a };

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
const t0 = Date.now();
if (t.pre) result = { answers: {}, backend: "code", latencyMs: 0 };   // decided without asking Jev
else try {
  result = await Promise.race([
    (process.env.JEV_MOCK_DELAY_MS && (process.env.JEV_BACKEND || "").toLowerCase() === "mock"
      ? new Promise((ok) => setTimeout(ok, Number(process.env.JEV_MOCK_DELAY_MS))).then(() => jev.judge(t.state, t.questions))
      : jev.judge(t.state, t.questions)),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)),
  ]);
} catch (e) {
  const why = `${e.message}; run the LLM gate as usual`;
  record("UNAVAILABLE", why, { latencyMs: Date.now() - t0, timeout: /^timeout after/.test(e.message) });
  out("UNAVAILABLE", why, false);
}

const [verdict, why] = t.pre || t.decide(result.answers);
record(verdict, why, {
  backend: result.backend, latencyMs: result.latencyMs,
  answers: Object.fromEntries(Object.entries(result.answers).map(([k, v]) => [k, { answer: v.answer, confidence: v.confidence, escalate: v.escalate, reason: v.reason }])),
});
if (MODE === "shadow") out("SHADOW", `would=${verdict} ${why}. Shadow mode: do not route on this line`, false);
out(verdict, why, false);

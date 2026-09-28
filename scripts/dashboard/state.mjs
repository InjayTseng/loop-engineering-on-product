// state.mjs — read-only view of a loop run, for scripts/dashboard/serve.mjs.
//
// Sources (all written by the loop; this module never writes anything):
//   .loop/events.jsonl   structured events: driver (run / round / gate) + round agent (`step`)
//   .loop/loop.log       fallback for runs that predate events.jsonl (e.g. examples/web-v2-20-rounds)
//   .loop/run.pid        running?        .loop/state   parked (WAITING_FOR_P)?
//   loop.config.env      thresholds (run_start event values win: env overrides beat the file)
//   the idea ledger      idea board      .loop/jev.jsonl   recent Jev calls
//   git                  files each shipped commit touched (PRP / brief links)
// The stop-condition math mirrors scripts/run-loop.sh exactly; if you change one, change both.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const git = (root, ...a) => { try { return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

export function readConfig(text) {
  const c = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=("([^"]*)"|'([^']*)'|(\S*))/);
    if (m) c[m[1]] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return c;
}

export function parseEvents(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a half-written last line while the loop appends */ }
  }
  return out;
}

// --- loop.log → the same event shapes (older runs have no events.jsonl) --------------------------
export function parseLoopLog(text) {
  const ev = [];
  let date = null, lastMin = -1, dayOff = 0, gateRound = 0, lastEnd = null;
  const stamp = (hms) => {
    if (!date || !hms) return undefined;
    const [h, m, s] = hms.split(":").map(Number), min = h * 60 + m;
    if (lastMin >= 0 && min < lastMin - 60) dayOff++;          // crossed midnight
    lastMin = min;
    const d = new Date(`${date}T${hms}`); d.setDate(d.getDate() + dayOff);
    return d.toISOString();
  };
  for (const raw of text.split("\n")) {
    const l = raw.replace(/`/g, "");
    let m;
    if ((m = l.match(/^=== run-loop (\S+) START (\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) \| N=(\d+)(?:.*\bjev=(\w+))?/))) {
      date = m[2];
      ev.push({ type: "run_start", ts: stamp(m[3]), version: m[1], n: +m[4], jev: m[5] || "", replayed: true,
        model: (l.match(/\bmodel=(\S+)/) || [])[1], branch: (l.match(/\bbranch=(\S+)/) || [])[1] });
    } else if ((m = l.match(/^--- ROUND (\d+)\/(\d+) @ (\d\d:\d\d:\d\d) \(reset=(\d)(?: maint=(\d))?\)/))) {
      gateRound = +m[1]; ev.push({ type: "round_start", ts: stamp(m[3]), round: +m[1], reset: +m[4], maint: m[5] ? +m[5] : 0 });
    } else if ((m = l.match(/^\s*-> (?:LOOP_RESULT:\s*([A-Z_]+)(.*)|<no LOOP_RESULT emitted>)/))) {
      const rest = m[2] || "";
      lastEnd = { type: "round_end", round: gateRound, verdict: m[1] || "NOOP",
        category: (rest.match(/category=([^|]+)/) || [])[1]?.trim(), step: (rest.match(/step=([^|]+)/) || [])[1]?.trim(),
        rejects: +((rest.match(/rejects=(\d+)/) || [])[1] || 0) };
      ev.push(lastEnd);
    } else if ((m = l.match(/^\s*shipped: ([0-9a-f]{7,}) (.*)/)) && lastEnd) {
      lastEnd.commit = m[1]; lastEnd.subject = m[2];
    } else if (/claimed SHIPPED but HEAD did not move/.test(l) && lastEnd) {
      lastEnd.verdict = "NOOP";
    } else if ((m = l.match(/^\s*noop\/no-result \[consec=\d+\/\d+\] — (.+)$/)) && lastEnd) {
      lastEnd.why = m[1].trim();   // e.g. "timeout mid-fix: …"
    } else if ((m = l.match(/^\s*· state audit @ round (\d+)(?: \((.*)\))? ->/))) {
      gateRound = +m[1]; ev.push({ type: "audit_start", round: +m[1], why: m[2] || "" });
    } else if ((m = l.match(/^\s*AUDIT:\s*([A-Z_]+)?/))) {
      ev.push({ type: "audit", round: gateRound, verdict: m[1] || "", line: l.trim() });
    } else if ((m = l.match(/^\s*· trajectory check @ round (\d+)(?: \((.*)\))?/))) {
      gateRound = +m[1]; ev.push({ type: "traj_start", round: +m[1], why: m[2] || "" });
    } else if ((m = l.match(/^\s*TRAJ:\s*([A-Z_]+)?/))) {
      ev.push({ type: "traj", round: gateRound, verdict: m[1] || "", line: l.trim() });
    } else if ((m = l.match(/^\s*· jev same-tactic: (.*)/))) {
      ev.push({ type: "jev_same", round: gateRound, line: m[1] });
    } else if ((m = l.match(/^\s*· autonomous positioning @ round (\d+)/))) {
      gateRound = +m[1]; ev.push({ type: "position_start", round: +m[1] });
    } else if ((m = l.match(/^\s*POSITION:\s*([A-Z_]+)?/))) {
      ev.push({ type: "position", round: gateRound, verdict: m[1] || "", line: l.trim() });
    } else if ((m = l.match(/^=== STOP: (.*) ===$/))) {
      ev.push({ type: "stop", round: gateRound, reason: m[1] });
    } else if ((m = l.match(/^=== PARKED: (.*?) — positioning needs a human/))) {
      ev.push({ type: "park", reason: m[1] });
    } else if ((m = l.match(/^=== run-loop \S+ DONE (\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)/))) {
      ev.push({ type: "done", ts: stamp(m[2]) });
    }
  }
  return ev;
}

// --- ledger → idea board ---------------------------------------------------------------------------
export function parseLedger(text) {
  const items = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*-\s*\[([A-Z_]+)\]\s*(.*)$/);
    if (!m) continue;
    const body = m[2].trim();
    const cut = body.search(/\s[—–]\s|[:：]/);
    items.push({
      status: m[1],
      title: (cut > 0 ? body.slice(0, cut) : body).trim().slice(0, 160),
      detail: cut > 0 ? body.slice(cut).replace(/^\s*[—–:：]\s*/, "").slice(0, 400) : "",
      jev: /Jev fast-reject/i.test(body),
    });
  }
  return items;
}

// --- events → rounds, current activity, stop meters -------------------------------------------------
const NUM = (v, d) => (Number.isFinite(+v) && `${v}` !== "" ? +v : d);

export function buildRounds(events) {
  const rounds = new Map(), run = { gates: [] };
  const R = (n) => {
    if (!rounds.has(n)) rounds.set(n, { n, steps: [], gates: [], rejects: 0 });
    return rounds.get(n);
  };
  for (const e of events) {
    switch (e.type) {
      case "round_start": Object.assign(R(e.round), { start: e.ts, reset: e.reset, maint: e.maint }); break;
      case "round_end": Object.assign(R(e.round), { end: e.ts, verdict: e.verdict, category: e.category, step: e.step,
        rejects: NUM(e.rejects, 0), commit: e.commit, subject: e.subject, why: e.why || "" }); break;
      case "step": if (e.round != null) R(e.round).steps.push({ ts: e.ts, node: e.node, note: e.note }); break;
      case "audit": case "traj": case "position": case "jev_same": {
        const g = { type: e.type, ts: e.ts, verdict: e.verdict || (e.line || "").match(/JEV:\s*([A-Z]+)/)?.[1] || "", line: e.line, why: e.why };
        (e.round ? R(e.round).gates : run.gates).push(g); break;
      }
    }
  }
  return { rounds: [...rounds.values()].sort((a, b) => a.n - b.n), runGates: run.gates };
}

// Same rules, same order as scripts/run-loop.sh (plateau window, consecutive counters, P reset).
export function stopMeters(events, cfg) {
  const W = NUM(cfg.WINDOW, 5), PR = NUM(cfg.PLATEAU_REJ, 2), PS = NUM(cfg.PLATEAU_SHIP, 3);
  let cr = 0, cn = 0, cm = 0, rej = [], shp = [];
  for (const e of events) {
    if (e.type === "round_end") {
      const v = e.verdict, rj = NUM(e.rejects, 0);
      if (v === "SHIPPED") { cr = 0; cn = 0; cm = e.category === "maintenance" ? cm + 1 : 0; }
      else if (v === "REJECTED") { cr++; cn = 0; }
      else { cn++; }
      rej.push(rj); shp.push(v === "SHIPPED" ? 1 : 0);
      if (shp.length > W) { rej.shift(); shp.shift(); }
    } else if (e.type === "position" && e.verdict === "AGREED") { cr = 0; cn = 0; cm = 0; rej = []; shp = []; }
  }
  const sumr = rej.reduce((a, b) => a + b, 0), sums = shp.reduce((a, b) => a + b, 0), full = shp.length >= W;
  return [
    { key: "plateau", label: "Rejection-rate plateau", detail: `last ${shp.length}/${W} rounds: ${sumr} ideas rejected, ${sums} rounds shipped; stops when ${PR}×rejected ≥ ${PS}×shipped`,
      value: PR * sumr, limit: PS * Math.max(sums, 1), window: W, armed: full && sums > 0, fired: full && sums > 0 && PR * sumr >= PS * sums },
    { key: "consec_reject", label: "Consecutive fully rejected rounds", detail: "the 1st forces a RESET; stops if the RESET round is rejected too", value: cr, limit: NUM(cfg.MAX_CONSEC_REJECTED, 2), armed: true, fired: cr >= NUM(cfg.MAX_CONSEC_REJECTED, 2) },
    { key: "consec_noop", label: "Consecutive NOOP (build/validation gave up)", detail: "structural problem: a human fixes the adapter or the product", value: cn, limit: NUM(cfg.MAX_NOOP, 3), armed: true, fired: cn >= NUM(cfg.MAX_NOOP, 3) },
    { key: "consec_maint", label: "Consecutive maintenance rounds", detail: "research has run dry; hand back to positioning node P", value: cm, limit: NUM(cfg.MAX_CONSEC_MAINT, 3), armed: true, fired: cm >= NUM(cfg.MAX_CONSEC_MAINT, 3) },
  ];
}

// What is happening right now: a gate the driver is running, or a step inside the open round.
export function currentActivity(events, running) {
  if (!running) return null;
  const open = { audit_start: "audit", traj_start: "traj", position_start: "position", reval_start: "reval" };
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (open[e.type]) {
      const closed = events.slice(i + 1).some((x) => x.type === open[e.type]);
      if (!closed) return { kind: "gate", node: { audit_start: "C", traj_start: "T", position_start: "P", reval_start: "V" }[e.type],
        label: { audit_start: "Deep state audit (state-auditor)", traj_start: "Trajectory check (trajectory-monitor)", position_start: "Autonomous positioning (strategist + critic)", reval_start: "Re-validation (Jev: the validator's PASS lacks evidence)" }[e.type] + (e.why ? `: ${e.why}` : ""),
        round: e.round, since: e.ts };
      continue;   // a finished gate: keep looking (a re-validation ends inside a still-open round)
    }
    if (e.type === "round_start") {
      const ended = events.slice(i + 1).some((x) => x.type === "round_end" && x.round === e.round);
      if (ended) return null;
      const steps = events.slice(i + 1).filter((x) => x.type === "step" && x.round === e.round);
      const last = steps[steps.length - 1];
      return { kind: "round", round: e.round, node: last?.node || null, label: last?.note || "round started (no step reported yet)",
        since: last?.ts || e.ts, roundSince: e.ts };
    }
    if (["round_end", "done", "stop", "park"].includes(e.type)) return null;
  }
  return null;
}

function pidAlive(root) {
  const pid = parseInt(read(join(root, ".loop", "run.pid")), 10);
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

// Files a shipped commit touched that a human wants to open from the dashboard.
function commitFiles(root, commit) {
  if (!commit) return [];
  return git(root, "show", "--name-only", "--format=", commit).split("\n")
    .filter((f) => /^(PRPs|research\/briefs)\/.+\.md$/.test(f));
}

// DNS-rebinding guard: when bound to loopback, only answer requests addressed to a loopback name.
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
export function hostAllowed(hostHeader, bindHost, port) {
  if (!LOOPBACK.has(bindHost)) return true;
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(String(hostHeader || "").toLowerCase());
  return Boolean(m && LOOPBACK.has(m[1]) && (m[2] === undefined || Number(m[2]) === Number(port)));
}

export const ALLOWED_FILE = /^(PRPs\/[^/]+\.md|research\/briefs\/[^/]+\.md|product\/(state|positioning)\.md|\.loop\/(round|audit|traj|position)-\d{3}\.log)$/;

export function buildState(root, opts = {}) {
  root = resolve(root);
  const cfg = readConfig(read(join(root, opts.config || "loop.config.env")));
  const replay = Boolean(opts.loopLog);
  const evText = replay ? "" : read(join(root, ".loop", "events.jsonl"));
  let events = parseEvents(evText), source = ".loop/events.jsonl";
  if (!events.some((e) => e.type === "round_start")) {
    const logPath = opts.loopLog ? resolve(root, opts.loopLog) : join(root, ".loop", "loop.log");
    const fromLog = parseLoopLog(read(logPath));
    if (fromLog.length) { events = fromLog; source = opts.loopLog || ".loop/loop.log"; }
  }
  const runStart = [...events].reverse().find((e) => e.type === "run_start") || {};
  // The run_start event carries the values the driver actually resolved (env beats file).
  const eff = { ...cfg };
  for (const [k, v] of Object.entries({ WINDOW: runStart.window, PLATEAU_REJ: runStart.plateau_rej, PLATEAU_SHIP: runStart.plateau_ship,
    MAX_CONSEC_REJECTED: runStart.max_consec_rejected, MAX_NOOP: runStart.max_noop, MAX_CONSEC_MAINT: runStart.max_consec_maint,
    TRAJ_EVERY: runStart.traj_every, AUDIT_EVERY: runStart.audit_every, JEV_MODE: runStart.jev, LOOP_MODEL: runStart.model, LOOP_BRANCH: runStart.branch }))
    if (v !== undefined && v !== null && v !== "") eff[k] = String(v);
  // Only the latest run counts for "now"; history keeps every round of that run.
  // A replayed log describes ITS run: never fill model / branch / Jev from today's config.
  if (runStart.replayed) for (const k of ["LOOP_MODEL", "LOOP_BRANCH", "JEV_MODE"]) if (!eff[k] || eff[k] === cfg[k]) eff[k] = "";
  const startIdx = events.lastIndexOf(runStart);
  const runEvents = startIdx >= 0 ? events.slice(startIdx) : events;

  const running = !replay && pidAlive(root);
  // .loop/state also records a USAGE_LIMIT stop; only WAITING_FOR_P means "parked, positioning needs a human"
  const stateFile = replay ? "" : read(join(root, ".loop", "state")).trim();
  const parkedFile = /^WAITING_FOR_P:/.test(stateFile) ? stateFile : "";
  const last = runEvents[runEvents.length - 1];
  const park = [...runEvents].reverse().find((e) => e.type === "park");
  const stop = [...runEvents].reverse().find((e) => e.type === "stop");
  const done = [...runEvents].reverse().find((e) => e.type === "done");
  const status = running ? "running"
    : parkedFile ? "parked"
    : park ? "parked"
    : last?.type === "done" ? "done"
    : runEvents.length ? "stopped" : "idle";

  const { rounds, runGates } = buildRounds(runEvents);
  if (!replay) for (const r of rounds) r.files = commitFiles(root, r.commit);
  const ledgerPath = opts.ledger ? resolve(root, opts.ledger) : join(root, cfg.LEDGER || ".claude/tasks/_idea_ledger.md");
  const jev = parseEvents(replay ? "" : read(join(root, ".loop", "jev.jsonl"))).slice(-30).reverse();

  return {
    generatedAt: new Date().toISOString(),
    source, replay,
    run: {
      status, n: NUM(runStart.n, NUM(cfg.ROUNDS, rounds.length)), startedAt: runStart.ts, endedAt: done?.ts || stop?.ts || park?.ts, version: runStart.version,
      branch: eff.LOOP_BRANCH || (runStart.replayed ? "" : "loop"), model: eff.LOOP_MODEL || "", jev: eff.JEV_MODE || (runStart.replayed ? "" : "off"),
      parkedReason: parkedFile.replace(/^WAITING_FOR_P:\s*/, "") || park?.reason || "", stopReason: stop?.reason || "",
      product: cfg.PRODUCT && !cfg.PRODUCT.startsWith("<") ? cfg.PRODUCT : "",
    },
    current: currentActivity(runEvents, running),
    rounds, runGates,
    meters: stopMeters(runEvents, eff),
    thresholds: { trajEvery: NUM(eff.TRAJ_EVERY, 5), auditEvery: NUM(eff.AUDIT_EVERY, 5) },
    ideas: parseLedger(read(ledgerPath)),
    ledgerPath: ledgerPath.replace(root + "/", ""),
    jev,
    docs: ["product/positioning.md", "product/state.md"].filter((f) => existsSync(join(root, f))),
    prps: existsSync(join(root, "PRPs")) ? readdirSync(join(root, "PRPs")).filter((f) => f.endsWith(".md")).sort().reverse().slice(0, 12).map((f) => `PRPs/${f}`) : [],
  };
}

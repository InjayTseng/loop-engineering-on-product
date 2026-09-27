// ledger.mjs — what the prefilter's duplicate check may see of the idea ledger.
//
// The duplicate question is "is this idea already in the ledger?", so the idea's OWN entry must
// never reach Jev — shown to it, the idea matches itself with high confidence (seen live twice:
// cf-billing p=0.94 via [IN_PROGRESS], cf-cutover-runbook p=0.90 via a project-local [QUEUED]).
// Two rules, both failing toward "Jev sees less → value-critic decides":
//   1. every `[IN_PROGRESS]` line is dropped. After spec Step 0 resolves stale ones, the only
//      IN_PROGRESS entries are this round's idea (written by /research and Step 2).
//   2. any line whose status is NOT terminal (QUEUED, TODO, SPLIT, … — whatever a project adds)
//      and that names this idea's title is dropped, so check-then-mark and mark-then-check orders
//      both work.
// Terminal lines are always kept, even with the same title: a COMPLETED / REJECTED / FAILED /
// LOW_IMPACT twin is exactly the real duplicate the check exists to catch.
const TERMINAL = new Set(["COMPLETED", "REJECTED", "FAILED", "LOW_IMPACT"]);
const STATUS = /^\s*-\s*\[([A-Z_]+)\]/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function ledgerForPrefilter(text, title = "") {
  const t = title.trim();
  // Whole-token match, so "cf-auth" does not swallow "cf-auth-hardening". Titles under 3 chars
  // are too generic to match on; rule 1 still applies.
  const own = t.length >= 3 ? new RegExp(`(?<![\\w-])${esc(t)}(?![\\w-])`, "i") : null;
  return text.split("\n").filter((l) => {
    const m = l.match(STATUS);
    if (!m) return true;
    if (m[1] === "IN_PROGRESS") return false;
    return TERMINAL.has(m[1]) || !own || !own.test(l);
  }).join("\n");
}

// The title a spec-shaped --idea carries: "<title> — <mechanism> — <funnel stage>".
export const titleOf = (idea = "") => idea.split(/\s+[—–]\s+/)[0].trim();

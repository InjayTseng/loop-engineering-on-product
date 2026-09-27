// ledger.mjs — what the prefilter's duplicate check may see of the idea ledger.
//
// `[IN_PROGRESS]` lines are dropped. By the time the prefilter runs (spec Step 2b), Step 0 has
// resolved any dangling IN_PROGRESS from a crashed round (resumed or marked FAILED), and both
// `/research` (Step 1) and Step 2 have already written THIS round's idea as `[IN_PROGRESS]`.
// Shown to Jev, that line is the idea itself, and "is it a duplicate of a ledger entry?" answers
// yes with high confidence — a self-match false reject (seen in a real run: p=0.94).
// Every other status stays: a REJECTED / COMPLETED / FAILED / LOW_IMPACT twin is a real duplicate.
export function ledgerForPrefilter(text) {
  return text.split("\n").filter((l) => !/^\s*-\s*\[IN_PROGRESS\]/.test(l)).join("\n");
}

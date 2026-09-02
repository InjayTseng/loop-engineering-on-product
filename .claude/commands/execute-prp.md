# Execute PRP (dev)

## PRP file: $ARGUMENTS

Implement the feature exactly as the PRP specifies, then prove it.

1. Load — read the PRP; follow every link; extend research only where the PRP is silent.
2. ULTRATHINK — plan before touching code. Break the work into small steps (use the todo tool).
   Identify the existing patterns to mirror.
3. Implement — follow the PRP's ordered task list. Small, localized edits. No drive-by refactors.
4. Validate — run every validation gate in the PRP, in order. Fix and re-run until all pass.
   Never weaken a test to make it pass.
5. Independent validation — Level 4 is the `validator` subagent. Inside the loop, do NOT spawn it
   here: `innovation_loop.md` Step 7 spawns it once, with the baseline screenshot from Step 0.
   Standalone use (outside the loop): spawn it yourself with the PRP path and the changed files;
   PARTIAL/FAIL → fix the BLOCKERS and re-validate. You never declare success yourself.
6. Complete — re-read the PRP, confirm every checklist item, report: files changed, gates run
   with their output, and (standalone) the validator VERDICT.

If validation fails repeatedly, use the error patterns in the PRP before improvising.

# Nodes D, B, V, Y: build, test, validate, ship

"Test or validate the PRD" is split into two layers. B is a deterministic correctness gate (the product is not broken). V is a latent, independent validation (the product delivers the PRD). Drop either and things slip through.

## D — `/execute-prp <PRP>`

Read the PRP and follow its links; research only what the PRP does not cover. Think before acting (break it into small steps). Work through the PRP's ordered tasks, mirror existing patterns, touch only the files the PRP lists. Run every validation level in the PRP and fix until it passes — never loosen a test to make it pass. Finally, dispatch `validator`: the builder does not declare success.

Constraints that hold every round: one small change per round, `git add <specific files>`, no refactoring, never touch `DEPLOY_BRANCH`.

## B — `BUILD_CMD` (the adapter)

One command in `loop.config.env`; exit 0 = ok; prints JSON or a log. It is the only thing that changes per product (see [07-adapters](07-adapters.md)).

- **web:** `node scripts/adapters/web-check.mjs /tmp/loop-shot.png` — renders in real Chrome, catches console/page errors, takes a screenshot, and checks that the funnel-critical strings in `WEB_MUST_INCLUDE` are still present.
- **iOS:** `scripts/adapters/ios-shot.sh /tmp/loop-shot.png` — xcodebuild + simctl install and launch + screenshot.

`BUILD: fail` → fix ≤3 times → revert, `[FAILED]`, `LOOP_RESULT: NOOP`. Three NOOP rounds in a row is a structural problem (the adapter or the product is broken); the driver stops outright instead of treating it as a value signal.

## V — `validator` (independent subagent, checked against the PRD)

It did not write this code, and its goal is to falsify the builder's claim. Its inputs are the PRP path (it reads the CLAIM, Success Criteria, and Validation Loop), the changed files, and the baseline screenshot from Step 0.

Protocol: run `BUILD_CMD` → read the screenshot / output (for features behind an interaction, drive the product to that state and look again, 2–3 states) → check the CLAIM and each success criterion, run the PRP's own validation commands → score 9 axes:

1. Build/render with no errors
2. The claimed change is actually visible
3. Behavior matches the description
4. **LABEL-PROMISE:** every CTA touched does what its label promises
5. No regression in adjacent UI or the funnel-critical flow
6. Empty / first-run / error states are not ugly
7. Visual hierarchy, readability, consistency with the existing design
8. Accessibility basics (labels present, no clipped text at the target viewport)
9. Real value vs noise

`PASS` only when axes 1–4 all pass and there are 0 BLOCKERS. Output VERDICT / CLAIM / EVIDENCE / SCORECARD / BLOCKERS / NICE_TO_HAVE, pasted back into the backlog.

Routing:

- Implementation issue → back to D, ≤3 times
- `BLOCKERS: PRD: …` (the CLAIM is unobservable or self-contradictory) → back to S once
- More than 3 tries on one slice → revert, `NOOP`

Axis 4 was added after the v2 run. The original 9 axes checked "the element exists, it responds, no errors" and let through an "Ask for a fortune?" button that only preselected a category and scrolled — it never drew a fortune, and to users it felt like nothing happened. The build was green and the validator said PASS; only a human looking afterwards caught it. Functionally correct ≠ delivers what it promises.

## Y — ship to the isolated branch

```bash
git add <files> PRPs/<file>.md research/briefs/<brief>.md .claude/tasks/_idea_ledger.md .claude/tasks/_product_backlog.md
git commit -m "loop(<category>): <one sentence> — moves <stage>"
git push origin <LOOP_BRANCH>      # never DEPLOY_BRANCH
```

Mark the ledger / backlog `[COMPLETED]`; last line `LOOP_RESULT: SHIPPED | category=… | step=… | rejects=N`.

A human merges to live. On the web-v2 test site, `main` deploys straight to live through GitHub Pages — pushing main *is* shipping to production. That is why the driver refuses any branch but the loop branch, with no exceptions.

## Why the builder cannot validate itself

The builder has every incentive to declare success: it wrote the code, it believes it is right, and it wants the round to end. A second pair of eyes wins structurally — an independent context, no authorship, no sunk cost — not because its prompt is written more forcefully. That is why value-critic, validator, trajectory-monitor, positioning-critic, and state-auditor are all independent subagents.

Next: [05-loop](05-loop.md)

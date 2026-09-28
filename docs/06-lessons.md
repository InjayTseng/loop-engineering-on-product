# Ten hard lessons: v1 → v2 → v2.1 → v3

None of this was designed up front. It broke three times and was fixed each time. Every lesson maps to real run numbers and to an implementation. The web-v2 numbers can be recomputed from the logs in `examples/`; the iOS health app was an external run and its logs are not included.

## Evolution

| Version | Setting | Ran | Result | What was missing |
|---|---|---|---|---|
| v1 | iOS asset-tracking app (`examples/ios-v1-112-iterations/`) | 112 rounds | a maintenance round every 3 rounds; features kept piling up | no value gate; the builder marked its own work COMPLETED; pushed to main |
| v1 | iOS health app (external run, logs not included) | 35 rounds / 11.5 h overnight | 31 rounds appended the same kind of HealthKit metric; 3 real features | same as above; the independent validator was added later |
| v2 | fortune-telling website (the v2 test site; `examples/web-v2-20-rounds/`) | 20 rounds / 4h10m | 20 shipped, 17 ideas rejected by the value gate, 7 categories, trajectory 4× CONTINUE | plateau never fired; let fake social proof through; let a CTA whose label did not match its behavior through |
| v2.1 | same | — | rejection-rate plateau; trust gate | the plateau could never actually fire because of a bash 3.2 array-slicing bug (lesson 10) |
| v3 | this repo | — | current-state node C; positioning node P with two modes; a PRD every round; the label-promise axis | awaiting N=3 |

## Lessons

1. **A loop maximizes what it can measure.** Measure only correctness and it churns out marginal work (31/35). Add a value gate, and put it before building.
2. **Stop on the rejection rate, not on "consecutive fully-rejected rounds".** The latter is too coarse: in-round retries make a fully REJECTED round almost never happen, so 17 rejections produced no signal at all. `rejects=N` is required on every line.
3. **Independent validation beats self-approval, structurally.** The builder has every incentive to declare success. A second pair of eyes wins through an independent context, no authorship, and no sunk cost.
4. **Layered defenses each catch one layer.** The value gate catches single off-funnel ideas, category diversity catches surface repetition, the trajectory monitor catches "different categories, same tactic" homogeneity. Remove one and you are back to v1.
5. **On a trust product, reject fabricated data even when it "works".** v2 shipped hash-seeded "N people started a reading today" and "N people unlocked the in-depth reading today" counters. They probably did move the funnel, and they would have destroyed the product's core asset once discovered. The trust gate overrides the impact score.
6. **Deploy isolation is not negotiable.** On the web-v2 test site `main` is GitHub Pages; pushing main is going live. The driver blocks it on its first line.
7. **Do not abstract a framework from N=1.** Only after both the iOS and web adapters ran for real did the gates, roles, and driver get pulled into a generic layer. Add no more abstraction before a third setting.
8. **A product with a large content surface may not plateau within N rounds.** Plateau detection is a calibration. To see it fire yourself, use a small, exhaustible target.
9. **Functionally correct ≠ delivers what it promises.** An "Ask for a fortune?" button only preselected and scrolled — no fortune was drawn. The build was green, the validator said PASS, users felt nothing happened. The validator gained axis 4, label-promise, and the PRD required every round gives it a CLAIM to check.
10. **A stop condition exists only once a stub has exercised it.** While preparing this repo, the driver got a fake `claude` (one scripted result line per call) and scripted scenarios, which revealed that the v2.1 rejection-rate plateau could never fire: macOS's default bash 3.2 returns an empty array for `${arr[@]: -$WINDOW}` when the array is shorter than WINDOW, so the rolling window was emptied every round and never filled. The v2.1 driver in web-v2 (`examples/web-v2-20-rounds/as-run/run-loop.sh`) shipped with this bug, and "the plateau should fire, to be confirmed" really meant "it never will". The fix is in `scripts/run-loop.sh` (drop the oldest entry only once the window exceeds WINDOW); `scripts/test-driver.sh` now runs 11 scenarios, all passing. To be honest: even with a correct rule, those 20 web-v2 rounds would not have triggered it (any 5-round window has at most 5 rejects / 5 ships, a rate of 1.0 against a threshold of 1.5) — the plateau rule still has no real positive case. Tests prove it *will stop when it should*; no real run has shown that it *did*. The general form: the driver is deterministic, so it can and must be tested deterministically. Do not wait for a whole overnight run to tell you whether the stop conditions are right.

## Three v3 additions that no real run has proven yet

- **Discover before you build** (node C): late in v1 the backlog grew to 140K and the agent trusted its notes more than the code. C pins the truth to the repo and the running product. To be verified: whether a deep audit every 5 rounds is worth its cost.
- **Positioning is a slow node with two resolutions** (node P): with a human, converge through multi-round questions; without, two senior agents argue. To be verified: how often strategist + critic AGREE on a real plateau, and whether the stage they pick is worse than a human's.
- **A PRD every round:** v2 skipped it for Size S/M. To be verified: whether the extra time per round for a one-page PRP (est. 2–3 min) buys fewer label-promise escapes.

They are listed here as a reminder: v3 is currently an N=0 design, not N=2 evidence.

## Sources

The framework comes from a January 2026 talk (a six-phase multi-agent product loop), grounded in Claude Code's primitives: loops, subagents, headless mode. Methodologically it lines up with Andrew Ng's three loops (agentic coding / developer feedback / external feedback), Boris Cherny's "write loops, not prompts", and harness engineering's "independent validation, externalized state, stop conditions defined first".

Next: [07-adapters](07-adapters.md)

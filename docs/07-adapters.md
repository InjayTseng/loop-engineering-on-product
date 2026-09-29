# Adapters: change products by changing four cells

In the whole graph, only node B changes per product: how to build, how to observe, what counts as broken, and which branch is live. Every other node, gate, back-edge, the result-line protocol, and the driver are reused as-is.

An adapter provides three things:

1. **A correctness command** — `BUILD_CMD`; exit 0 = ok; prints JSON or a log.
2. **A way to observe** — something the validator can look at: a screenshot, test output, metrics.
3. **Deploy isolation** — which branch is live, and where the loop runs.

## A — web (instance: the web-v2 test site, example.com)

| Item | Value |
|---|---|
| Build + correctness | No compile step → render in real Chrome: `node scripts/adapters/web-check.mjs /tmp/loop-shot.png` |
| Observe | Playwright `page.screenshot`; post-interaction states are driven by short scripts the validator writes |
| Broken signal | pageerror / console error (resource-loading noise filtered) / a funnel-critical string from `WEB_MUST_INCLUDE` disappears |
| Deploy isolation | `main` = GitHub Pages, straight to live; the loop runs on `loop` |
| Gotchas | Stub analytics with a 204, do not abort the request (an abort produces a fake console error); in a single-file app one bad edit breaks the whole page, so the correctness gate is a lifeline; elements rendered only after an interaction are visible only if you drive the page there |

Install: `npm i -D playwright` (it uses `channel: 'chrome'`, so no browser download).

## B — iOS (instance: the iOS health app)

| Item | Value |
|---|---|
| Build + correctness | `scripts/adapters/ios-shot.sh /tmp/loop-shot.png`: `xcodebuild … -sdk iphonesimulator build`, with `-resolvePackageDependencies` first |
| Observe | `xcrun simctl install/launch/io screenshot` (the simulator must already be booted) |
| Broken signal | BUILD FAILED / compile errors / crash on launch |
| Deploy isolation | a git worktree or a `loop` branch; live = a human submits to the App Store; the loop never publishes |
| Gotchas | Resolve SPM before a clean build; add new .swift files to `project.pbxproj` with a script (never by hand); worktrees share the remote, so push only the loop branch |

Set `IOS_PROJECT` / `IOS_SCHEME` / `IOS_BUNDLE_ID` / `IOS_SIM` in `loop.config.env`.

**Make the evidence readable.** Set `IOS_TEST="1"` and the adapter also runs the scheme's tests and writes one line per test to `/tmp/loop-tests.txt` (`PASSED Suite/testName()`), printing only the totals and any failures. The validator is told to grep that file for the test that covers the CLAIM, so its evidence shows the behavior itself rather than "180 passed" plus a screenshot — which no text-based check (Jev `claim-evidence`) and no later reader can see into. Measured on a live iOS run: three `claim-evidence` flags came from validators whose only evidence was code reading, a test total, and screenshots. If you keep your own adapter, reuse the parser: `scripts/adapters/ios-shot.sh --list-tests <result.xcresult>`.

**Give iOS rounds more time.** One build-and-screenshot check takes 3–5 minutes on a simulator, end-to-end runs longer, so a round that gets a validator FAIL and goes through the fix loop can easily pass 30 minutes. Measured on a live iOS run: a round with two rejected ideas and one validate → fix cycle hit the 1800 s default. Set `ROUND_TIMEOUT="3600"` for iOS adapters. A round that still times out is labelled in `loop.log` and the dashboard with how far it got (`timeout mid-fix`, `timeout before validation`).

## Recipe for a new setting

Answer four questions:

1. How does it build / start? No build step (static site, script) → correctness = it runs without errors.
2. How do you observe the product? A screenshot (UI) / test output (library) / metrics (data pipeline) / the artifact itself (content).
3. What counts as broken? Non-zero exit / an exception / a key output missing → write it as one script that returns an exit code + JSON.
4. Which branch is live? → the loop runs on another branch; the driver blocks the live one.

| Candidate setting | Build | Observe | Broken |
|---|---|---|---|
| Frontend component library | `vite build` / storybook | component screenshots | build failure / visual regression |
| CLI / backend library | `cargo build` / `pytest` | test output | compile / test failure |
| Content / research loop | generate the text | the artifact itself | missing citations / factual errors; validator = adversarial fact-check |
| Data pipeline | run the pipeline | output metrics / schema | schema drift / metric regression |

Once the adapter exists, `validator` and `state-auditor` need no changes — they read `BUILD_CMD` / `OBSERVE` / `BROKEN_SIGNAL` from `loop.config.env`.

Next: [08-adopt](08-adopt.md)

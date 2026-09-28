# Install into your repo in five steps

Prerequisites: a product that builds; an `origin` remote (every round pushes); the `claude` CLI on your PATH; Node ≥ 18 (the adapters use top-level await). The web adapter also needs `npm i -D playwright` and a local Google Chrome; the iOS adapter needs Xcode and a booted simulator. Optional: `jq`, which turns on gate recording (`.loop/gates.jsonl`); and a TypeSafe (or OpenRouter / AI Gateway) API key plus `cd scripts/jev && npm ci` for the optional Jev pre-checks. The whole thing takes an afternoon.

## 1. Copy the skeleton

```bash
cp -R .claude loop.config.env scripts product research PRPs <your-repo>/
cd <your-repo> && git checkout -b loop
scripts/install-hooks.sh          # pre-push hook: refuses DEPLOY_BRANCH at the git level
```

`.claude/settings.local.json.example` is a minimal permission allowlist: copy it to `.claude/settings.local.json` (gitignored). It allows only `git push origin loop` and denies `push origin main` and `reset --hard`. Note that it governs interactive mode (`/loop-once`) only. The headless driver runs with `--dangerously-skip-permissions` and does not read it, so headless safety rests on the per-round branch check, the `pre-push` hook (the driver refuses to start without it), and — because `git push --no-verify` skips any hook — branch protection on the remote.

## 2. Write the adapter (node B)

Pick `scripts/adapters/web-check.mjs` or `ios-shot.sh`, or write one from the four questions in [07-adapters](07-adapters.md). The goal: a one-line `BUILD_CMD` that exits 0 when OK and produces something the validator can see (a screenshot / output). Run it by hand once to confirm exit 0 — if placeholders such as `WEB_MUST_INCLUDE` in `loop.config.env` are left unfilled, the first audit will report BROKEN.

## 3. Fill in `loop.config.env`

North star and funnel, categories (7±2), `TRUST_PRODUCT`, thresholds, `DEPLOY_BRANCH` ≠ `LOOP_BRANCH`, `BUILD_CMD`. If you renamed `value-critic` or `validator`, set `GATE_VALUE_AGENT` / `GATE_VALIDATOR_AGENT` to match. If your product keeps code under a path the loop protects by default, check `PROTECTED_PATHS`. If you have no funnel yet, define a rough one — without a north star the value gate degrades to "looks fine to me". Leave `JEV_MODE="off"` for now.

## 4. Positioning and current state (P, C)

```
/audit          # state-auditor rewrites product/state.md
/position       # multi-round questions converge product/positioning.md (the only place hard fields change)
```

Both files are inputs to every round. Skip this step and the loop optimizes "whatever the agent thinks looks like the goal".

## 5. Run one round by hand, then overnight

```
/loop-once                 # check that value-critic and validator behave
scripts/run-loop.sh 5      # a short 5-round run; read loop.log
scripts/run-loop.sh 20     # overnight
```

In the morning, read `.loop/loop.log`: what shipped, what was rejected, what the trajectory monitor said, whether the run parked at P. Review the loop branch's commits one by one before merging — this is Andrew Ng's developer feedback loop, and it is where v2's label-promise bug was caught.

Optional, once the loop runs well without it: Jev pre-checks can fast-reject obvious bad ideas before the LLM gates. Follow the rollout order in [09-jev](09-jev.md) — offline eval, then a shadow night, then prefilter. To follow a run live, use the dashboard in [10-dashboard](10-dashboard.md).

## Acceptance: when a loop counts as installed

- [ ] The driver REFUSEs on `main`, and REFUSEs without the `pre-push` hook
- [ ] `DEPLOY_BRANCH` is protected on the remote (branch protection / ruleset: PR required, no direct or force pushes)
- [ ] Within one `/loop-once` round you see all five lines: `VALUE:`, `PRP_SCORE:`, `BUILD:`, `VERDICT:`, `LOOP_RESULT:`
- [ ] The validator is a different agent (check the transcript: the builder did not declare PASS itself)
- [ ] Given a deliberately off-funnel idea, value-critic REJECTs it with a REDIRECT
- [ ] With `TRUST_PRODUCT=true`, a deliberately hash-seeded "N people today" idea is rejected
- [ ] Every round in `.loop/loop.log` has a line with `rejects=`
- [ ] `product/state.md` is rewritten after the run starts
- [ ] `BUILD_CMD` exits 0 when run by hand; `bash scripts/test-driver.sh` passes

## Do not

- Run the loop on the live branch
- Skip the PRD to save time (node V goes blind)
- Start changing the generic layer from this one setting — run a full night first and write down lesson 11

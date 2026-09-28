# 10 Developer dashboard: history, what is happening now, how far along

A local, read-only web page. It reads only the files the loop already writes, and it never starts, stops, or changes any decision of the loop.

```bash
node scripts/dashboard/serve.mjs            # opens http://127.0.0.1:4400, refreshes every 3 seconds
```

![A run in progress (simulated data): round 4 is in D (develop); in round 3 Jev flagged a repeated tactic and the early trajectory check returned REDIRECT](img/dashboard-live.png)

## What is on the screen

| Section | Question it answers | Data source |
|---|---|---|
| Status pill + banner | Is it running? Has it stopped? Why? | `.loop/run.pid` (is the process alive), `.loop/state` (`WAITING_FOR_P`), `stop` / `park` / `done` events |
| Now | Which round, which step of C→R→F→S→D→B→V→Y, how long this step has taken; T / P / deep C light up while the driver runs them | `round_start` and `step`, `*_start` in `events.jsonl` |
| History | Each round's result (✓ shipped / ✕ fully rejected / ! NOOP), how many ideas were rejected inside it, which rounds had gate events (T / A / J / P; red and yellow mean STOP / REDIRECT and the like) | `round_end`, `traj`, `audit`, `jev_same`, `position` |
| Round N | Category, funnel, commit, a timeline of every step, the gates' original text, the round's PRP / brief / round log | the same, plus `git show --name-only <commit>` |
| Stop conditions | How far each of the driver's four stop thresholds is from firing | recomputed from events, **with the same rules as `scripts/run-loop.sh`** (tests check them rule by rule) |
| Ideas | The status of every idea in the ledger, with Jev fast-rejects marked separately | `LEDGER` (default `.claude/tasks/_idea_ledger.md`) |
| Jev | The last 30 Jev calls | `.loop/jev.jsonl` (shown only when `JEV_MODE` is not off) |

By design, every visual element carries a bit more information:
- **Progress ring:** rounds completed / total rounds.
- **Track:** where this round has got to; the active segment animates.
- **Bars above each round:** ideas rejected inside the round; a yellow band marks the plateau's window, so you can see why a stop is getting close.
- **Step duration bars:** which step takes the longest.
- **Line on each meter:** where the stop threshold is.

Every colored status also has an icon and text, not color alone. The history can switch to a table view. Light and dark follow the system and can be switched by hand (stored in the browser only).

## Where "which step is it on now" comes from

The driver only sees a round start and end: each round is one `claude -p`, which prints only when it finishes, so `round-NNN.log` is empty mid-round. So the spec has a rule (Progress events in `innovation_loop.md`): each time the round agent enters a step, it first runs

```bash
scripts/loop-event.sh step <C|R|F|S|D|B|V|Y|M> "<one sentence: what it is doing, which slice>"
```

That appends one JSON line to `.loop/events.jsonl`. The driver writes run / round / gate events with the same script (it exports `LOOP_ROUND` and `LOOP_EVENTS`, so the agent does not need to know the round number). This is not a result line: no gate or stop condition reads it, and a failed write does not affect the round. An agent on an older spec does not report steps; the page then shows "the round agent has not reported a step yet", and everything else works as usual.

## Replaying past runs

An older run without `events.jsonl` (such as web-v2) is read from `loop.log` instead:

```bash
node scripts/dashboard/serve.mjs --loop-log examples/web-v2-20-rounds/loop.log \
     --ledger examples/web-v2-20-rounds/as-run/_backlog.md
```

![Replaying web-v2: all 20 rounds shipped, 17 ideas rejected, 4 trajectory checks, all CONTINUE](img/dashboard-replay.png)

During a replay the model, branch, and Jev mode all come from that log, never filled in from today's `loop.config.env`. Older logs have no step events, so they show results but no step timeline.

## Safety and limits

- Binds to `127.0.0.1` only and accepts GET only. A round log can contain anything; do not expose this port.
- File views go through an allow-list: `PRPs/*.md`, `research/briefs/*.md`, `product/state.md`, `product/positioning.md`, `.loop/{round,audit,traj,position}-NNN.log`. Every other path returns 403 (including `..` and `loop.config.env`).
- No dependencies; Node 18 or later. The data lives on the machine that runs the loop, so this is a local tool, not a hosted page.
- The stop conditions are **recomputed**, not the driver's internal state. The rules are the same and tests compare them, but the driver is the only thing that ever stops the loop.

## Tests

```bash
node scripts/dashboard/test/state.test.mjs   # replay numbers match the README; running / interrupted / parked; stop rules; server allow-list
bash scripts/test-driver.sh                  # scenario 4: events written by the real driver → the dashboard reads the same result
node scripts/dashboard/test/fixture.mjs /tmp/x && node scripts/dashboard/serve.mjs --root /tmp/x   # look at a fake run in progress
```

Next: back to [00-pipeline](00-pipeline.md)

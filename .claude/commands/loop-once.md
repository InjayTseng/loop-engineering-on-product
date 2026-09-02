# Loop once

Execute exactly ONE iteration of `.claude/tasks/innovation_loop.md` in this repository.

- Read `loop.config.env` first. Confirm you are on `LOOP_BRANCH` (`git rev-parse --abbrev-ref HEAD`);
  if not, stop and say so — never run the loop on `DEPLOY_BRANCH`.
- Optional context from the caller: $ARGUMENTS (recent categories, RESET flag, or an angle).
- Pass both independent gates (value-critic before building, validator after). Never self-approve.
- End your reply with the `LOOP_RESULT:` line exactly as the spec defines it.

This is what `scripts/run-loop.sh` runs headlessly each round; use it interactively to watch one
round before trusting the driver overnight.

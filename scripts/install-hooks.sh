#!/usr/bin/env bash
# install-hooks.sh — git-level backstop for the loop's one non-negotiable: never push the live branch.
# The driver checks the branch every round and the spec tells the agent not to, but a hook is the
# only guard that survives a confused agent. Run once per clone: scripts/install-hooks.sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
DEPLOY_BRANCH="$(sed -n 's/^DEPLOY_BRANCH="\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' loop.config.env | head -1)"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
HOOK="$(git rev-parse --git-path hooks)/pre-push"
cat > "$HOOK" <<HOOK
#!/usr/bin/env bash
# Installed by scripts/install-hooks.sh — refuse any push that updates the live branch.
while read -r local_ref local_sha remote_ref remote_sha; do
  case "\$remote_ref" in refs/heads/$DEPLOY_BRANCH)
    echo "pre-push: refusing to push '$DEPLOY_BRANCH' (live). Merge via a reviewed PR instead." >&2; exit 1;; esac
done
exit 0
HOOK
chmod +x "$HOOK"; echo "installed $HOOK (refuses refs/heads/$DEPLOY_BRANCH)"

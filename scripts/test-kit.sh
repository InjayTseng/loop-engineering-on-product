#!/usr/bin/env bash
# test-kit.sh — tests for scripts/loop-kit.sh: install into a fresh repo, then update it from a "newer"
# framework (a throwaway copy of this checkout with a few files changed).
# Usage: bash scripts/test-kit.sh        (exit 0 = all pass)
set -u
SRC="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0
ok()   { echo "  ok   $1"; }
bad()  { echo "  FAIL $1"; FAIL=1; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
newrepo() { mkdir -p "$1" && ( cd "$1" && git init -q && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init ); }

# the "newer" framework: a copy of this checkout, as its own git repo
FW="$T/fw"; mkdir -p "$FW"; ( cd "$SRC" && git ls-files -z | xargs -0 -I{} cp --parents {} "$FW/" 2>/dev/null ) \
  || rsync -a --exclude .git --exclude node_modules --exclude .loop "$SRC/" "$FW/"
[ -f "$FW/scripts/run-loop.sh" ] || rsync -a --exclude .git --exclude node_modules --exclude .loop "$SRC/" "$FW/"
( cd "$FW" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm v1 )

echo "### 1 install into a fresh repo"
A="$T/app"; newrepo "$A"
out=$("$FW/scripts/loop-kit.sh" install "$A" 2>&1); rc=$?
check "exit 0" '[ $rc = 0 ]'
check "driver, gate log, agents and spec copied" '[ -f "$A/scripts/run-loop.sh" ] && [ -f "$A/scripts/gate-log.sh" ] && [ -f "$A/.claude/agents/validator.md" ] && [ -f "$A/.claude/tasks/innovation_loop.md" ]'
check "shell scripts and node entry points are executable" '[ -x "$A/scripts/run-loop.sh" ] && [ -x "$A/scripts/jev/jev.mjs" ] && [ -x "$A/scripts/adapters/ios-shot.sh" ]'
check "loop-kit.sh itself is not copied" '[ ! -e "$A/scripts/loop-kit.sh" ]'
check "your files created (config, positioning, state, ledger, backlog)" '[ -f "$A/loop.config.env" ] && [ -f "$A/product/positioning.md" ] && [ -f "$A/.claude/tasks/_idea_ledger.md" ]'
check "lock records the framework version and every framework file" 'head -1 "$A/.loop-kit.lock" | grep -q "^framework [0-9a-f]" && grep -q "  scripts/run-loop.sh$" "$A/.loop-kit.lock"'
check "pre-push hook installed" 'grep -q "refs/heads/main)" "$A/.git/hooks/pre-push"'
check "examples/ and docs/ are not copied into the product" '[ ! -e "$A/examples" ] && [ ! -e "$A/docs" ]'

echo "### 2 install never overwrites a file you already have"
B="$T/app2"; newrepo "$B"; echo 'PRODUCT="mine"' > "$B/loop.config.env"
"$FW/scripts/loop-kit.sh" install "$B" >/dev/null 2>&1
check "existing loop.config.env untouched" '[ "$(cat "$B/loop.config.env")" = "PRODUCT=\"mine\"" ]'

echo "### 3 update: unchanged files move on, your edits are kept, modes restored, config keys listed"
echo "# v2 change" >> "$FW/scripts/run-loop.sh"
echo "# v2 change" >> "$FW/.claude/agents/validator.md"
printf 'NEW_KNOB="1"            # added in v2\n' >> "$FW/loop.config.env"
( cd "$FW" && git -c user.name=t -c user.email=t@t commit -qam v2 )
echo "# my house rule" >> "$A/.claude/agents/validator.md"          # a local customisation
chmod -x "$A/scripts/jev/jev.mjs"                                     # a sync that dropped the bit
echo 'PRODUCT="my app"' >> "$A/loop.config.env"                      # your config
cp "$A/.claude/agents/validator.md" "$T/validator.mine"
out=$("$FW/scripts/loop-kit.sh" update "$A" 2>&1); rc=$?
check "exit 3: something needs a merge" '[ $rc = 3 ]'
check "an unchanged framework file is updated" 'tail -1 "$A/scripts/run-loop.sh" | grep -q "# v2 change"'
check "a file you changed is left as yours" 'cmp -s "$A/.claude/agents/validator.md" "$T/validator.mine"'
check "… and the new version waits next to it as .kit-new" 'tail -1 "$A/.claude/agents/validator.md.kit-new" | grep -q "# v2 change"'
check "the dropped executable bit is restored" '[ -x "$A/scripts/jev/jev.mjs" ]'
check "your loop.config.env is untouched" 'tail -1 "$A/loop.config.env" | grep -q "my app"'
check "the new config key is listed, not written" 'echo "$out" | grep -q "NEW_KNOB=\"1\"" && ! grep -q NEW_KNOB "$A/loop.config.env"'
check "the summary says what happened" 'echo "$out" | grep -qE "1 updated, .* 1 executable bits restored, 1 kept"'

echo "### 4 a second update after merging: the merged file is treated as yours until it matches"
out=$("$FW/scripts/loop-kit.sh" update "$A" 2>&1); rc=$?
check "still kept (you have not merged yet)" '[ $rc = 3 ] && [ -f "$A/.claude/agents/validator.md.kit-new" ]'
cp "$A/.claude/agents/validator.md.kit-new" "$A/.claude/agents/validator.md"; rm "$A/.claude/agents/validator.md.kit-new"
out=$("$FW/scripts/loop-kit.sh" update "$A" 2>&1); rc=$?
check "after taking the new version, update is clean" '[ $rc = 0 ] && echo "$out" | grep -q "0 kept"'

echo "### 5 --force replaces your change and keeps a backup"
echo "# mine again" >> "$A/.claude/agents/validator.md"; cp "$A/.claude/agents/validator.md" "$T/validator.mine2"
echo "# v3" >> "$FW/.claude/agents/validator.md"; ( cd "$FW" && git -c user.name=t -c user.email=t@t commit -qam v3 )
"$FW/scripts/loop-kit.sh" update "$A" --force >/dev/null 2>&1
check "replaced with the framework's version" 'tail -1 "$A/.claude/agents/validator.md" | grep -q "# v3"'
check "yours saved as .kit-bak" 'cmp -s "$A/.claude/agents/validator.md.kit-bak" "$T/validator.mine2"'

echo "### 6 status changes nothing; a repo adopted by hand (no lock) is handled safely"
C="$T/hand"; newrepo "$C"; mkdir -p "$C/scripts"
cp "$FW/scripts/gate-log.sh" "$C/scripts/"                        # identical copy
printf '#!/usr/bin/env bash\necho old driver\n' > "$C/scripts/run-loop.sh"   # an old, differing copy
before=$(cd "$C" && find . -path ./.git -prune -o -type f -print | sort | xargs shasum 2>/dev/null)
"$FW/scripts/loop-kit.sh" status "$C" >/dev/null 2>&1
after=$(cd "$C" && find . -path ./.git -prune -o -type f -print | sort | xargs shasum 2>/dev/null)
check "status wrote nothing" '[ "$before" = "$after" ]'
out=$("$FW/scripts/loop-kit.sh" update "$C" 2>&1); rc=$?
check "without a lock, a differing file is never overwritten" 'grep -q "old driver" "$C/scripts/run-loop.sh" && [ -f "$C/scripts/run-loop.sh.kit-new" ]'
check "an identical file is simply recorded" 'grep -q "  scripts/gate-log.sh$" "$C/.loop-kit.lock"'

[ "$FAIL" = 0 ] && echo "ALL KIT TESTS PASSED" || { echo "KIT TESTS FAILED"; exit 1; }

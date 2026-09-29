#!/usr/bin/env bash
# loop-kit.sh — install this framework into a product repo, and update it later without losing local work.
#
# Run it from a checkout of loop-engineering-on-product:
#   scripts/loop-kit.sh install <repo>           copy the framework in, create the files you own, install the hook
#   scripts/loop-kit.sh update  <repo> [--force] bring framework files up to date
#   scripts/loop-kit.sh status  <repo>           what update would do; changes nothing
#
# Two kinds of files:
#   framework files  scripts, agents, commands, the round spec, templates. Installed and updated here.
#                    <repo>/.loop-kit.lock records the hash of each one as installed. On update, a file you
#                    have NOT changed since is replaced; a file you HAVE changed is left alone and the new
#                    version is written next to it as <file>.kit-new for you to merge (--force replaces it,
#                    keeping yours as <file>.kit-bak). Executable bits are always restored.
#   your files       loop.config.env, product/, the idea ledger and backlog, research briefs, PRPs. Created on
#                    install only if missing; never touched by update. New config keys the framework gained
#                    are listed for you to add by hand.
# Why: adopters who synced by hand lost executable bits, and either overwrote their own changes or skipped
# fixes to avoid doing so.
set -uo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
cmd="${1:-}"; DST="${2:-}"; FORCE=0; [ "${3:-}" = "--force" ] && FORCE=1
usage() { sed -n '4,7p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
case "$cmd" in install|update|status) ;; *) usage ;; esac
[ -n "$DST" ] && [ -d "$DST" ] || { echo "loop-kit: no such directory: ${DST:-<repo>}"; exit 2; }
DST="$(cd "$DST" && pwd)"
[ "$DST" = "$SRC" ] && { echo "loop-kit: that is the framework checkout itself"; exit 2; }
LOCK="$DST/.loop-kit.lock"
if command -v sha256sum >/dev/null; then hashf() { sha256sum "$1" | cut -c1-64; }; else hashf() { shasum -a 256 "$1" | cut -c1-64; }; fi
VERSION="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
git -C "$SRC" diff --quiet HEAD 2>/dev/null || VERSION="$VERSION+dirty"

# --- the framework's files (relative paths), listed from this checkout -------------------------------------
framework_files() {
  ( cd "$SRC"
    # (loop-kit.sh itself stays here: it always runs from the framework checkout)
    ls scripts/run-loop.sh scripts/gate-log.sh scripts/loop-event.sh scripts/install-hooks.sh scripts/test-driver.sh 2>/dev/null
    find scripts/adapters scripts/dashboard -type f ! -name '.DS_Store' 2>/dev/null
    find scripts/jev -type f ! -path '*/node_modules/*' ! -name '.DS_Store' 2>/dev/null
    find .claude/agents .claude/commands -type f -name '*.md' 2>/dev/null
    ls .claude/tasks/innovation_loop.md .claude/settings.local.json.example research/TEMPLATE.md 2>/dev/null
    find PRPs/templates -type f 2>/dev/null ) | sort -u
}
# --- your files: created on install when missing, never updated ---------------------------------------------
OWNED="loop.config.env product/positioning.md product/state.md .claude/tasks/_idea_ledger.md .claude/tasks/_product_backlog.md"

locked_hash() { [ -f "$LOCK" ] && awk -v p="$1" '$2 == p { print $1 }' "$LOCK"; }
executable() { case "$1" in *.sh) return 0;; esac; head -c 2 "$SRC/$1" 2>/dev/null | grep -q '^#!'; }
copy() {  # $1 rel path: copy from the framework, with the right mode
  mkdir -p "$(dirname "$DST/$1")"; cp "$SRC/$1" "$DST/$1"
  if executable "$1"; then chmod +x "$DST/$1"; fi; }

new=0; updated=0; same=0; kept=0; forced=0; fixedmode=0; : > "${TMPDIR:-/tmp}/loop-kit.$$"
NEWLOCK="${TMPDIR:-/tmp}/loop-kit.$$"; trap 'rm -f "$NEWLOCK"' EXIT
echo "framework $VERSION" >> "$NEWLOCK"
say() { echo "  $*"; }
DRY=""; [ "$cmd" = status ] && { DRY="would be "; echo "  (dry run: nothing below is changed)"; }

for f in $(framework_files); do
  want=$(hashf "$SRC/$f")
  if [ ! -e "$DST/$f" ]; then
    [ "$cmd" = status ] || copy "$f"; say "+ $f"; new=$((new+1)); echo "$want  $f" >> "$NEWLOCK"; continue
  fi
  have=$(hashf "$DST/$f"); was=$(locked_hash "$f")
  if [ "$have" = "$want" ]; then
    same=$((same+1)); echo "$want  $f" >> "$NEWLOCK"
    if executable "$f" && [ ! -x "$DST/$f" ]; then [ "$cmd" = status ] || chmod +x "$DST/$f"; say "x $f (executable bit ${DRY}restored)"; fixedmode=$((fixedmode+1)); fi
    continue
  fi
  if [ "$cmd" = install ] || { [ -n "$was" ] && [ "$have" = "$was" ]; }; then
    # unchanged since we installed it (or a fresh install over an old copy): take the new version
    [ "$cmd" = status ] || copy "$f"; say "~ $f"; updated=$((updated+1)); echo "$want  $f" >> "$NEWLOCK"
  elif [ "$FORCE" = 1 ]; then
    cp "$DST/$f" "$DST/$f.kit-bak"; copy "$f"; say "! $f (yours kept as $f.kit-bak)"; forced=$((forced+1)); echo "$want  $f" >> "$NEWLOCK"
  else
    # changed locally (or no record of what was installed): never overwrite
    [ "$cmd" = status ] || { cp "$SRC/$f" "$DST/$f.kit-new"; if executable "$f"; then chmod +x "$DST/$f.kit-new"; fi; }
    say "? $f (changed here — new version ${DRY}written to $f.kit-new; merge it, or rerun with --force)"; kept=$((kept+1))
    [ -n "$was" ] && echo "$was  $f" >> "$NEWLOCK"
  fi
done

if [ "$cmd" = install ]; then
  for f in $OWNED; do
    [ -e "$DST/$f" ] && continue
    mkdir -p "$(dirname "$DST/$f")"
    if [ -f "$SRC/$f" ]; then cp "$SRC/$f" "$DST/$f"; else : > "$DST/$f"; fi; say "+ $f (yours from now on)"
  done
  mkdir -p "$DST/research/briefs" "$DST/PRPs"
fi

# config keys the framework has that this repo's loop.config.env does not
if [ -f "$DST/loop.config.env" ]; then
  missing=$(comm -23 <(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' "$SRC/loop.config.env" | sort -u) \
                     <(sed -n 's/^[# ]*\([A-Z_][A-Z0-9_]*\)=.*/\1/p' "$DST/loop.config.env" | sort -u))
  if [ -n "$missing" ]; then
    echo "  config keys to consider adding to loop.config.env (defaults apply until you do):"
    for k in $missing; do printf '    %s\n' "$(grep -m1 "^$k=" "$SRC/loop.config.env")"; done
  fi
fi

if [ "$cmd" != status ]; then
  cp "$NEWLOCK" "$LOCK"
  [ "$cmd" = install ] && ( cd "$DST" && git rev-parse --git-dir >/dev/null 2>&1 && scripts/install-hooks.sh ) | sed 's/^/  /'
fi
echo "loop-kit $cmd → $DST @ framework $VERSION: $new new, $updated ${DRY}updated, $same unchanged, $fixedmode executable bits ${DRY}restored, $kept kept (see .kit-new)$([ "$FORCE" = 1 ] && echo ", $forced forced")"
if [ "$cmd" != status ]; then
  echo "next: (cd scripts/jev && npm ci) if you use Jev; then bash scripts/test-driver.sh"
fi
[ "$kept" -eq 0 ] || exit 3   # something needs a merge; scripts can tell

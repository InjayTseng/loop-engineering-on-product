#!/usr/bin/env bash
# loop-event.sh — append one structured event to .loop/events.jsonl (read by scripts/dashboard/).
#
# The round agent calls it at the start of every spec step, so a dashboard can show WHERE a
# running round is (the driver only sees a round start and end; `claude -p` prints nothing until
# it finishes):
#   scripts/loop-event.sh step <C|R|F|S|D|B|V|Y|M> "<one-line note>"
# The driver sources this file for `emit` and writes run / round / gate events itself.
#
# Never fails a round: bad input is escaped, a missing directory is created, errors are ignored.
# Env: LOOP_EVENTS (default <repo>/.loop/events.jsonl) · LOOP_ROUND (exported by the driver)
# Portability: macOS /bin/bash 3.2.

# JSON string body: drop control chars, escape backslash and quote.
loop_jstr() { printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# emit <type> [key=string ...] [key#=integer ...]
emit() {
  local t="$1"; shift
  local f="${LOOP_EVENTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.loop/events.jsonl}"
  local s="{\"ts\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\",\"type\":\"$(loop_jstr "$t")\"" kv k v
  for kv in "$@"; do
    case "$kv" in
      *'#='*) k="${kv%%#=*}"; v="${kv#*#=}"; [[ "$v" =~ ^-?[0-9]+$ ]] || v=null; s="$s,\"$(loop_jstr "$k")\":$v" ;;
      *=*)    k="${kv%%=*}";  v="${kv#*=}";  s="$s,\"$(loop_jstr "$k")\":\"$(loop_jstr "$v")\"" ;;
    esac
  done
  mkdir -p "$(dirname "$f")" 2>/dev/null
  echo "$s}" >> "$f" 2>/dev/null
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    step)
      node="$(printf '%s' "${2:-?}" | tr '[:lower:]' '[:upper:]')"
      emit step "round#=${LOOP_ROUND:-}" "node=$node" "note=${3:-}" ;;
    *) echo "usage: scripts/loop-event.sh step <C|R|F|S|D|B|V|Y|M> \"<note>\"" >&2 ;;
  esac
  exit 0
fi

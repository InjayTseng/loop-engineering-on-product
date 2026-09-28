#!/usr/bin/env bash
# gate-log.sh — append one JSON record per gate decision to the cumulative dataset .loop/gates.jsonl.
#
# Why: the driver only keeps the one line it parses (VALUE: / VERDICT: / TRAJ: …). The scores, the
# reasoning, and the evidence each gate gathered were thrown away — and they are exactly the labeled
# data any future calibration is measured on (e.g. swapping a gate's final judgment for a typed-
# decision model, then checking its thresholds against what the LLM gate actually decided).
#
# Input is a `claude -p --output-format stream-json --verbose` transcript. Every subagent hand-back
# (a user event carrying `tool_use_result.agentType`) becomes one record: who judged, the prompt it
# was given, its full report, the parsed verdict, and every tool call it made with (truncated) output.
# Records are self-contained on purpose: round-NNN.jsonl is overwritten by the next run, this file is not.
#
# Usage: scripts/gate-log.sh <transcript.jsonl> <run-id> <kind> <round> [outcome-line] [commit]
#        kind = round | audit | traj | position ; prints the number of records appended.
# Env:   GATES (default .loop/gates.jsonl) · GATE_EVIDENCE_CHARS (4000, per tool output)
set -uo pipefail
[ $# -ge 4 ] || { echo "usage: $0 <transcript.jsonl> <run-id> <kind> <round> [outcome] [commit]" >&2; exit 2; }
command -v jq >/dev/null || { echo 0; exit 0; }
SRC="$1"; [ -f "$SRC" ] || { echo 0; exit 0; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATES="${GATES:-$ROOT/.loop/gates.jsonl}"; mkdir -p "$(dirname "$GATES")"

recs=$(jq -R -s -c \
  --arg run "$2" --arg kind "$3" --arg round "$4" --arg outcome "${5:-}" --arg commit "${6:-}" \
  --arg src "$SRC" --argjson cap "${GATE_EVIDENCE_CHARS:-4000}" '
  def text: if type == "string" then . else (map(.text? // "") | join("\n")) end;
  # same rule as the driver: strip backticks, anchor at line start, take the LAST protocol line
  def verdict_line: gsub("`"; "") | split("\n")
    | map(select(test("^\\s*(VALUE|VERDICT|TRAJ|AUDIT|POSITION):"))) | last;
  split("\n") | map(fromjson? // empty) as $ev
  | $ev[]
  | select(.type == "user" and (.tool_use_result | type) == "object" and .tool_use_result.agentType != null)
  | ([.message.content[]? | select(.type == "tool_result") | .tool_use_id] | first) as $id
  | .tool_use_result as $r
  | ([$r.content[]? | select(.type == "text") | .text] | join("\n")) as $report
  | ([$ev[] | select(.parent_tool_use_id == $id and .type == "user") | .message.content[]?
       | select(.type == "tool_result") | {key: .tool_use_id, value: (.content | text | .[0:$cap])}]
     | from_entries) as $out
  | ($report | verdict_line) as $vl
  | {
      id: "\($run)/\($kind)-\($round)/\($id)",
      run: $run, kind: $kind, round: ($round | tonumber), ts: (now | todate),
      agent: $r.agentType, status: $r.status, model: $r.resolvedModel,
      prompt: $r.prompt, report: $report,
      verdict_line: $vl,
      # a malformed line ("VALUE: ?") must yield null, not drop the whole record
      verdict: (if $vl then ([$vl | capture("^\\s*(?<key>[A-Z_]+):\\s*(?<token>[A-Z_]+)")?] | first) else null end),
      evidence: [$ev[] | select(.parent_tool_use_id == $id and .type == "assistant") | .message.content[]?
                 | select(.type == "tool_use")
                 | {tool: .name, input: (.input | tostring | .[0:$cap]), output: $out[.id]}],
      tokens: $r.totalTokens, duration_ms: $r.totalDurationMs, tool_uses: $r.totalToolUseCount,
      outcome: $outcome, commit: (if $commit == "" then null else $commit end),
      source: $src
    }' "$SRC" 2>/dev/null) || { echo 0; exit 0; }

[ -n "$recs" ] || { echo 0; exit 0; }
printf '%s\n' "$recs" >> "$GATES"
printf '%s\n' "$recs" | wc -l | tr -d ' '

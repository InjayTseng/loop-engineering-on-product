#!/usr/bin/env bash
# gate-log.sh — append one JSON record per gate decision to the cumulative dataset .loop/gates.jsonl.
#
# Why: the driver only keeps the one line it parses (VALUE: / VERDICT: / TRAJ: …). The scores, the
# reasoning, and the evidence each gate gathered were thrown away — and they are exactly the labeled
# data any future calibration is measured on (e.g. swapping a gate's final judgment for a typed-
# decision model, then checking its thresholds against what the LLM gate actually decided).
#
# Input is a `claude -p --output-format stream-json --verbose` transcript. Every finished subagent becomes one
# record — a foreground hand-back (a user event carrying `tool_use_result.agentType`), or, for an agent run
# with run_in_background, the system `task_notification` that carries its report (`background: true`): who judged, the prompt it
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
  # every Agent call in the transcript, by tool_use id (subagent type, prompt, foreground/background)
  | ([$ev[] | select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent")
      | {key: .id, value: {type: .input.subagent_type, prompt: .input.prompt, bg: (.input.run_in_background == true)}}] | from_entries) as $agents
  | ([$ev[] | select(.type == "user" and (.tool_use_result | type) == "object") | .tool_use_result as $r
      | ([.message.content[]? | select(.type == "tool_result") | .tool_use_id] | first) as $id
      | select($id != null) | {key: $id, value: $r}] | from_entries) as $results
  | def record($pos; $id; $agent; $status; $model; $prompt; $report; $tokens; $dur; $uses; $bg):
      ([$ev[] | select(.parent_tool_use_id == $id and .type == "user") | .message.content[]?
         | select(.type == "tool_result") | {key: .tool_use_id, value: (.content | text | .[0:$cap])}]
       | from_entries) as $out
      | ($report | verdict_line) as $vl
      | {
          id: "\($run)/\($kind)-\($round)/\($id)",
          run: $run, kind: $kind, round: ($round | tonumber), ts: (now | todate),
          agent: $agent, status: $status, model: $model, background: $bg,
          prompt: $prompt, report: $report,
          verdict_line: $vl,
          # a malformed line ("VALUE: ?") must yield null, not drop the whole record
          verdict: (if $vl then ([$vl | capture("^\\s*(?<key>[A-Z_]+):\\s*(?<token>[A-Z_]+)")?] | first) else null end),
          evidence: [$ev[] | select(.parent_tool_use_id == $id and .type == "assistant") | .message.content[]?
                     | select(.type == "tool_use")
                     | {tool: .name, input: (.input | tostring | .[0:$cap]), output: $out[.id]}],
          tokens: $tokens, duration_ms: $dur, tool_uses: $uses,
          outcome: $outcome, commit: (if $commit == "" then null else $commit end),
          source: $src, _pos: $pos
        };
  # 1. foreground hand-backs: the tool_result carries the finished report (read event by event, so a
  #    hand-back without a tool_result id still counts; it gets a positional id)
  ([$ev | to_entries[] | .value as $e
     | select($e.type == "user" and ($e.tool_use_result | type) == "object" and $e.tool_use_result.agentType != null
              and $e.tool_use_result.status != "async_launched")
     | {pos: .key, id: (([$e.message.content[]? | select(.type == "tool_result") | .tool_use_id] | first) // "handback-\(.key)"), r: $e.tool_use_result}]) as $hand
  | ($hand | map(.id)) as $fg
  # records come out in transcript order (the driver routes on the LAST validator verdict of a round)
  | [ ($hand[] | .pos as $pos | .id as $id | .r as $r
       | record($pos; $id; $r.agentType; $r.status; $r.resolvedModel; $r.prompt;
                ([$r.content[]? | select(.type == "text") | .text] | join("\n"));
                $r.totalTokens; $r.totalDurationMs; $r.totalToolUseCount; false)),
  # 2. background agents (run_in_background): the tool_result only says "async_launched"; the report
  #    arrives later as a system task_notification with the same tool_use_id. Without this, a gate run in
  #    the background is invisible and a validated ship reads as "no validator PASS".
      ([$ev | to_entries[] | .key as $pos | .value | select(.type == "system" and .subtype == "task_notification"
          and ($agents[.tool_use_id // ""] != null) and ((.tool_use_id) as $t | $fg | index($t) | not)) | . + {_pos: $pos}]
       | group_by(.tool_use_id) | map(last)[]
       | .tool_use_id as $id | ._pos as $pos | $agents[$id] as $a | ($results[$id] // {}) as $r
       | record($pos; $id; $a.type; .status; $r.resolvedModel; ($a.prompt // $r.prompt); (.summary // "");
                .usage.total_tokens; .usage.duration_ms; .usage.tool_uses; true)) ]
  | sort_by(._pos)[] | del(._pos)
  ' "$SRC" 2>/dev/null) || { echo 0; exit 0; }

[ -n "$recs" ] || { echo 0; exit 0; }
printf '%s\n' "$recs" >> "$GATES"
printf '%s\n' "$recs" | wc -l | tr -d ' '

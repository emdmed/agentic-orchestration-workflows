#!/bin/bash
# Orchestration Hook: PreToolUse
# Guards against accessing source files before grepping compaction.
# Uses a session marker to track whether compaction was grepped.
# Blocks Read/Glob/Grep/Task(Explore) on source paths until compaction is grepped.
# The gate is tool-agnostic: a Grep-tool grep OR a Bash grep of the compaction
# artifact both unlock it (harnesses without a Grep tool would otherwise deadlock).

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

# Skip guard entirely for EXEMPT tasks
if [ -f "$PROJECT_DIR/.orchestration/tools/.exempt" ]; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || TOOL_NAME=""

MARKER="$PROJECT_DIR/.orchestration/tools/.compaction_grepped"

DENY_REASON="BLOCKED: You must grep compacted_*.md BEFORE accessing source files. Required sequence: 1) Generate compaction if missing (node .orchestration/tools/scripts/compaction.js <project-root>), 2) Grep .orchestration/tools/compacted_*.md for task-relevant terms, 3) State findings from compaction grep, 4) Only then access source files (state why compaction was insufficient). This tool call has been denied."

deny() {
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "$DENY_REASON"
  }
}
JSON
  exit 0
}

# ─── Helper: check if a path is safe (orchestration infra, not source code) ───
is_safe_path() {
  local path="$1"
  # Always safe: orchestration dir, patterns dir, CLAUDE.md
  if echo "$path" | grep -qE "(\.orchestration/|\.patterns/|CLAUDE\.md$)"; then
    return 0
  fi
  # Safe: non-code config files at any depth (json, yaml, toml, md, txt, env, lock, etc.)
  if echo "$path" | grep -qE "\.(json|yaml|yml|toml|md|txt|env|lock|config|gitignore|eslintrc|prettierrc)$"; then
    return 0
  fi
  # Not safe — treat as source
  return 1
}

# ─── Helper: check if a grep pattern is trivially broad ───
is_trivial_pattern() {
  local pat="$1"
  # Empty, single char, or catch-all patterns
  [ -z "$pat" ] && return 0
  [ ${#pat} -le 1 ] && return 0
  echo "$pat" | grep -qE '^\.\*?$|^\^$|^\$$' && return 0
  return 1
}

# ─── Helper: check unlock criteria for compaction grep quality ───
PATTERNS_FILE="$PROJECT_DIR/.orchestration/tools/.grep_patterns"
KEYWORDS_FILE="$PROJECT_DIR/.orchestration/tools/.prompt_keywords"

check_unlock_criteria() {
  [ ! -f "$PATTERNS_FILE" ] && return 1
  local distinct_count
  distinct_count=$(sort -u "$PATTERNS_FILE" | wc -l)
  # Criterion 1: at least 2 distinct non-trivial patterns
  [ "$distinct_count" -ge 2 ] && return 0
  # Criterion 2: at least 1 pattern overlaps with a prompt keyword
  if [ -f "$KEYWORDS_FILE" ]; then
    while IFS= read -r pattern_line; do
      local pat_lower
      pat_lower=$(echo "$pattern_line" | tr '[:upper:]' '[:lower:]')
      while IFS= read -r keyword; do
        [ -z "$keyword" ] && continue
        if echo "$pat_lower" | grep -qi "$keyword"; then
          return 0
        fi
      done < "$KEYWORDS_FILE"
    done < "$PATTERNS_FILE"
  fi
  return 1
}

# ─── Grep validation: multi-criteria quality gate for compaction greps ───
if [ "$TOOL_NAME" = "Grep" ]; then
  TARGET_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""' 2>/dev/null) || TARGET_PATH=""
  if echo "$TARGET_PATH" | grep -qE "compacted_|\.orchestration/tools"; then
    if ! ls "$PROJECT_DIR/.orchestration/tools/compacted_"*.md >/dev/null 2>&1; then
      cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: No compaction artifact exists at .orchestration/tools/compacted_*.md. You must generate it FIRST before grepping. Run: node .orchestration/tools/scripts/compaction.js <project-root> — then grep the output."
  }
}
JSON
      exit 0
    fi
    # Extract the grep pattern
    GREP_PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""' 2>/dev/null) || GREP_PATTERN=""
    # Reject trivial patterns
    if is_trivial_pattern "$GREP_PATTERN"; then
      cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED: Trivial grep pattern '$GREP_PATTERN' rejected. Use a meaningful search term related to your task (e.g., a function name, class name, or concept from the user's request)."
  }
}
JSON
      exit 0
    fi
    # Record pattern
    mkdir -p "$PROJECT_DIR/.orchestration/tools"
    echo "$GREP_PATTERN" >> "$PATTERNS_FILE"
    # Check if unlock criteria are met
    if check_unlock_criteria; then
      touch "$MARKER"
    fi
    # Always allow the grep itself (just may not unlock source access yet)
    exit 0
  fi
  # Block Grep on source files if compaction not yet grepped
  if [ ! -f "$MARKER" ] && [ -n "$TARGET_PATH" ] && ! is_safe_path "$TARGET_PATH"; then
    # Enhanced deny message when patterns exist but criteria not met
    if [ -f "$PATTERNS_FILE" ]; then
      TRIED=$(tr '\n' ', ' < "$PATTERNS_FILE" | sed 's/,$//')
      DENY_REASON="BLOCKED: You've grepped compaction but haven't found task-relevant results yet. Try grepping for terms from the user's request, or check the Entry Points section. Patterns tried so far: $TRIED. Need: 2+ distinct patterns or 1 matching a prompt keyword."
    fi
    deny
  fi
  exit 0
fi

# ─── Bash grep of compaction also satisfies the gate (tool-agnostic) ───
# Some harnesses lack a Grep tool, or the agent greps via Bash. Recognize a
# Bash grep of the compaction artifact and run it through the same quality gate,
# otherwise source access stays blocked forever (deadlock).
if [ "$TOOL_NAME" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null) || CMD=""
  # Only act on grep-family commands aimed at the compaction artifact
  if echo "$CMD" | grep -qE '\b(grep|egrep|fgrep|rg|ag)\b' \
     && echo "$CMD" | grep -qE 'compacted_|\.orchestration/tools'; then
    # Only record once a compaction artifact actually exists
    if ls "$PROJECT_DIR/.orchestration/tools/compacted_"*.md >/dev/null 2>&1; then
      mkdir -p "$PROJECT_DIR/.orchestration/tools"
      # Candidate search terms: quoted strings first
      CANDIDATES=$(echo "$CMD" | grep -oE "'[^']+'|\"[^\"]+\"" | sed -E "s/^['\"]//; s/['\"]$//")
      # Fallback: first bare word after a grep-family token (skipping flags)
      if [ -z "$CANDIDATES" ]; then
        CANDIDATES=$(echo "$CMD" | grep -oE '\b(grep|egrep|fgrep|rg|ag)\b[[:space:]]+(-[^[:space:]]+[[:space:]]+)*[^[:space:]-][^[:space:]]*' \
          | sed -E 's/^(grep|egrep|fgrep|rg|ag)[[:space:]]+//; s/^(-[^[:space:]]+[[:space:]]+)*//')
      fi
      while IFS= read -r cand; do
        [ -z "$cand" ] && continue
        # Skip paths / filenames / globs — not search terms
        echo "$cand" | grep -qE 'compacted_|\.orchestration/tools|/|\.md$|\*' && continue
        is_trivial_pattern "$cand" && continue
        echo "$cand" >> "$PATTERNS_FILE"
      done <<EOF
$CANDIDATES
EOF
      if check_unlock_criteria; then
        touch "$MARKER"
      fi
    fi
  fi
  exit 0
fi

# ─── Only guard Read, Glob, Task ───
case "$TOOL_NAME" in
  Read|Glob|Task) ;;
  *) exit 0 ;;
esac

# ─── Already grepped compaction? Allow everything ───
if [ -f "$MARKER" ]; then
  exit 0
fi

# ─── Check if targeting source files (inverted: block unless safe path) ───
IS_SOURCE=false

case "$TOOL_NAME" in
  Read)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || FILE_PATH=""
    if [ -n "$FILE_PATH" ] && ! is_safe_path "$FILE_PATH"; then
      IS_SOURCE=true
    fi
    ;;
  Glob)
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""' 2>/dev/null) || PATTERN=""
    SEARCH_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""' 2>/dev/null) || SEARCH_PATH=""
    # Allow globs targeting orchestration/patterns dirs
    if echo "$PATTERN" | grep -qE "(\.orchestration|\.patterns)"; then
      IS_SOURCE=false
    elif echo "$PATTERN" | grep -qE "\*\.(tsx?|jsx?|cs|css|scss|html|py|go|rs|vue|svelte)"; then
      IS_SOURCE=true
    elif [ -n "$SEARCH_PATH" ] && ! is_safe_path "$SEARCH_PATH"; then
      IS_SOURCE=true
    fi
    ;;
  Task)
    SUBTYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // ""' 2>/dev/null) || SUBTYPE=""
    if [ "$SUBTYPE" = "Explore" ]; then
      IS_SOURCE=true
    fi
    ;;
esac

# Allow non-source access (orchestration, patterns, config, etc.)
if [ "$IS_SOURCE" = false ]; then
  exit 0
fi

# ─── Block source access before compaction grep ───
# Enhanced deny message when patterns exist but criteria not met
if [ -f "$PATTERNS_FILE" ]; then
  TRIED=$(tr '\n' ', ' < "$PATTERNS_FILE" | sed 's/,$//')
  DENY_REASON="BLOCKED: You've grepped compaction but haven't found task-relevant results yet. Try grepping for terms from the user's request, or check the Entry Points section. Patterns tried so far: $TRIED. Need: 2+ distinct patterns or 1 matching a prompt keyword."
fi
deny

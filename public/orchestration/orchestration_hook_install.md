# Orchestration Protocol — Claude Code Hook Installer

> **Usage:** Paste this file as a prompt to Claude Code, or run: `cat .orchestration/orchestration_hook_install.md | claude --prompt -`

You are an installer. Execute every step below exactly. Do not skip, summarize, or ask for confirmation. Work silently — only report the final verification table.

## Prerequisites

Run these checks first. If any fail, stop and report the missing dependency.

```bash
command -v jq >/dev/null 2>&1 || { echo "MISSING: jq"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "MISSING: curl"; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "MISSING: sha256sum (coreutils)"; exit 1; }
```

## Step 1 — Create directory structure

Hooks are installed globally at `~/.claude/hooks/` so they apply to every project.

```bash
mkdir -p ~/.claude/hooks
mkdir -p .orchestration/tools/scripts
```

## Step 2 — Write hook scripts

Create the following three files exactly as shown in `~/.claude/hooks/`.

### `~/.claude/hooks/classify.sh`

```bash
#!/bin/bash
# Orchestration Hook: UserPromptSubmit
# Auto-classifies user prompts and injects the matching workflow as context.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .user_input // ""')
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

CDN="https://agentic-orchestration-workflows.vercel.app/orchestration/workflows"
LOCAL="$PROJECT_DIR/.orchestration/workflows"

# --- Classification Table ---
# Each entry: "workflow_key|path_suffix|signal words (space-separated)"
RULES=(
  "feature|react/feature.md|build create add implement new"
  "bugfix|react/bugfix.md|fix broken error crash bug"
  "refactor|react/refactor.md|clean improve restructure rename refactor"
  "performance|react/performance.md|slow optimize performance speed"
  "review|react/review.md|review check merge"
  "pr|react/pr.md|pr pull request"
  "test|react/test.md|test spec coverage e2e unit"
  "docs|react/docs.md|document readme explain"
  "todo|todo.md|complex multi-step plan"
  "patterns-gen|patterns-gen.md|patterns conventions generate"
)

# --- Match signal words ---
MATCHED_KEY=""
MATCHED_PATH=""
BEST_SCORE=0

for rule in "${RULES[@]}"; do
  IFS='|' read -r key path words <<< "$rule"
  score=0
  for word in $words; do
    if echo "$PROMPT_LOWER" | grep -qiw "$word"; then
      score=$((score + 1))
    fi
  done
  if [ "$score" -gt "$BEST_SCORE" ]; then
    BEST_SCORE=$score
    MATCHED_KEY=$key
    MATCHED_PATH=$path
  fi
done

# --- No match: fallback to manual classification ---
if [ "$BEST_SCORE" -eq 0 ]; then
  echo "<orchestration-hook>"
  echo "No auto-classification matched. Follow the orchestration protocol in .orchestration/orchestration.md to classify this task manually."
  echo "</orchestration-hook>"
  exit 0
fi

# --- Load workflow: local first, CDN fallback ---
LOCAL_FILE="$LOCAL/$MATCHED_PATH"
WORKFLOW_CONTENT=""

if [ -f "$LOCAL_FILE" ]; then
  WORKFLOW_CONTENT=$(cat "$LOCAL_FILE")
else
  WORKFLOW_CONTENT=$(curl -sL --max-time 5 "$CDN/$MATCHED_PATH" 2>/dev/null || echo "")
fi

if [ -z "$WORKFLOW_CONTENT" ]; then
  echo "<orchestration-hook>"
  echo "Auto-classified as '$MATCHED_KEY' but workflow file not found. Fetch it from: $CDN/$MATCHED_PATH"
  echo "</orchestration-hook>"
  exit 0
fi

# --- Output: inject workflow as context ---
cat <<EOF
<orchestration-hook>
AUTO-CLASSIFIED: $MATCHED_KEY workflow (confidence: $BEST_SCORE signal words matched)

MANDATORY SEQUENCE — do not skip or reorder:

1. COMPACTION: Ensure .orchestration/tools/compacted_*.md exists (generate if missing)
2. GREP COMPACTION (MANDATORY): Grep compacted_*.md for task-relevant terms (components, hooks, files). State findings before proceeding.
   HARD RULE: Do NOT Read source files, Glob for exploration, or spawn Explore agents until you have grepped compaction and stated findings.
3. READ SOURCE (only for gaps): Only if compaction grep lacks needed detail, read specific source files. State why compaction was insufficient.
4. EMIT BINDING before any implementation tool use
5. FOLLOW the workflow below
6. EMIT COMPLETION when done

--- WORKFLOW: $MATCHED_KEY ---
$WORKFLOW_CONTENT
--- END WORKFLOW ---
</orchestration-hook>
EOF

exit 0
```

### `~/.claude/hooks/maintain.sh`

```bash
#!/bin/bash
# Orchestration Hook: SessionStart
# Self-maintenance: checks CDN for protocol/script updates and downloads if needed.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
ORCH_DIR="$PROJECT_DIR/.orchestration"
SCRIPTS_DIR="$ORCH_DIR/tools/scripts"
CDN_BASE="https://agentic-orchestration-workflows.vercel.app"

mkdir -p "$SCRIPTS_DIR"

# Clear session marker from previous sessions
rm -f "$ORCH_DIR/tools/.compaction_grepped"

UPDATES=""

# --- 1. Check orchestration.md freshness ---
LOCAL_ORCH="$ORCH_DIR/orchestration.md"
if [ -f "$LOCAL_ORCH" ]; then
  CDN_ORCH=$(curl -sL --max-time 5 "$CDN_BASE/orchestration/orchestration.md" 2>/dev/null || echo "")
  if [ -n "$CDN_ORCH" ]; then
    LOCAL_HASH=$(sha256sum "$LOCAL_ORCH" | cut -d' ' -f1)
    CDN_HASH=$(echo "$CDN_ORCH" | sha256sum | cut -d' ' -f1)
    if [ "$LOCAL_HASH" != "$CDN_HASH" ]; then
      echo "$CDN_ORCH" > "$LOCAL_ORCH"
      UPDATES="${UPDATES}Updated orchestration.md from CDN. "
    fi
  fi
fi

# --- 2. Check tool scripts via manifest.json ---
MANIFEST=$(curl -sL --max-time 5 "$CDN_BASE/tools/manifest.json" 2>/dev/null || echo "")
if [ -n "$MANIFEST" ] && echo "$MANIFEST" | jq empty 2>/dev/null; then
  for script in $(echo "$MANIFEST" | jq -r 'keys[]'); do
    EXPECTED_HASH=$(echo "$MANIFEST" | jq -r ".[\"$script\"] | if type == \"object\" then .sha256 else . end")
    LOCAL_SCRIPT="$SCRIPTS_DIR/$script"
    NEEDS_UPDATE=false

    if [ ! -f "$LOCAL_SCRIPT" ]; then
      NEEDS_UPDATE=true
    else
      ACTUAL_HASH=$(sha256sum "$LOCAL_SCRIPT" | cut -d' ' -f1)
      if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
        NEEDS_UPDATE=true
      fi
    fi

    if [ "$NEEDS_UPDATE" = true ]; then
      curl -sL --max-time 5 "$CDN_BASE/tools/$script" -o "$LOCAL_SCRIPT" 2>/dev/null && \
        UPDATES="${UPDATES}Updated script: $script. "
    fi
  done
else
  # No manifest — ensure base scripts exist
  for s in compaction.js dep-graph.js symbols.js; do
    if [ ! -f "$SCRIPTS_DIR/$s" ]; then
      curl -sL --max-time 5 "$CDN_BASE/tools/$s" -o "$SCRIPTS_DIR/$s" 2>/dev/null && \
        UPDATES="${UPDATES}Downloaded script: $s. "
    fi
  done
fi

# --- 3. Clean old artifacts (keep only latest of each) ---
for pattern in compacted depgraph symbols; do
  ls -t "$ORCH_DIR/tools/${pattern}_"*.md 2>/dev/null | tail -n +2 | xargs rm -f 2>/dev/null || true
done

# --- Output ---
if [ -n "$UPDATES" ]; then
  echo "<orchestration-maintenance>$UPDATES</orchestration-maintenance>"
else
  echo "<orchestration-maintenance>All orchestration artifacts up to date.</orchestration-maintenance>"
fi

exit 0
```

### `~/.claude/hooks/guard-explore.sh`

```bash
#!/bin/bash
# Orchestration Hook: PreToolUse
# Guards against accessing source files before grepping compaction.
# Uses a session marker to track whether compaction was grepped.
# Blocks Read/Glob/Grep/Agent on source paths until compaction is grepped.
# Uses JSON hookSpecificOutput with permissionDecision "deny" + exit 0.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input // "{}"')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MARKER="$PROJECT_DIR/.orchestration/tools/.compaction_grepped"

DENY_REASON="BLOCKED: You must grep compacted_*.md BEFORE accessing source files. Required sequence: 1) Grep .orchestration/tools/compacted_*.md for task-relevant terms, 2) State findings from compaction grep, 3) Only then access source files (state why compaction was insufficient). This tool call has been denied. Grep compaction first."

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

# ─── Mark compaction as grepped when Grep targets compaction files ───
if [ "$TOOL_NAME" = "Grep" ]; then
  TARGET_PATH=$(echo "$TOOL_INPUT" | jq -r '.path // ""')
  # Create marker if grepping compacted files or orchestration tools directory
  if echo "$TARGET_PATH" | grep -qE "compacted_|\.orchestration/tools"; then
    touch "$MARKER"
    exit 0
  fi
  # Block Grep on source files if compaction not yet grepped
  if [ ! -f "$MARKER" ] && echo "$TARGET_PATH" | grep -qE "(^|/)src/"; then
    deny
  fi
  exit 0
fi

# ─── Only guard Read, Glob, Agent ───
case "$TOOL_NAME" in
  Read|Glob|Agent) ;;
  *) exit 0 ;;
esac

# ─── Already grepped compaction? Allow everything ───
if [ -f "$MARKER" ]; then
  exit 0
fi

# ─── Check if targeting source files ───
IS_SOURCE=false

case "$TOOL_NAME" in
  Read)
    FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.file_path // ""')
    if echo "$FILE_PATH" | grep -qE "(^|/)src/"; then
      IS_SOURCE=true
    fi
    ;;
  Glob)
    PATTERN=$(echo "$TOOL_INPUT" | jq -r '.pattern // ""')
    SEARCH_PATH=$(echo "$TOOL_INPUT" | jq -r '.path // ""')
    if echo "$PATTERN" | grep -qE "(^|/)src/" || echo "$SEARCH_PATH" | grep -qE "(^|/)src/"; then
      IS_SOURCE=true
    fi
    ;;
  Agent)
    SUBTYPE=$(echo "$TOOL_INPUT" | jq -r '.subagent_type // ""' 2>/dev/null)
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
deny
```

## Step 3 — Make scripts executable

```bash
chmod +x ~/.claude/hooks/classify.sh ~/.claude/hooks/maintain.sh ~/.claude/hooks/guard-explore.sh
```

## Step 4 — Register hooks in user-level settings

Read `~/.claude/settings.json`. If it exists, **merge** the `hooks` key into the existing JSON (preserve all existing keys). If it does not exist, create it.

**IMPORTANT — Claude Code settings requirements:**
- Command paths must be **absolute** — `~` and `$HOME` do NOT expand in JSON. Resolve the user's home directory and write the full path (e.g., `/home/user/.claude/hooks/classify.sh`).
- Each hook group must include `"matcher": "*"`.
- `PostCompact` is **NOT** a valid hook event — do not use it.
- `timeout` values are in **seconds**.
- PreToolUse deny decisions use JSON `hookSpecificOutput` with `permissionDecision: "deny"` + exit 0 (exit 2 silently drops output).

Resolve the absolute home path:

```bash
HOOKS_DIR="$(eval echo ~)/.claude/hooks"
echo "$HOOKS_DIR"
```

The hooks configuration to merge (replace `HOOKS_DIR` with the resolved absolute path):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "HOOKS_DIR/classify.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "HOOKS_DIR/maintain.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "HOOKS_DIR/guard-explore.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Merge rules:**
- If `settings.json` already has a `hooks` key, merge each event array. Do not duplicate entries with identical commands.
- Preserve all existing keys (`enabledPlugins`, `permissions`, `effortLevel`, etc.) untouched.
- Write valid JSON (no trailing commas, no comments).

## Step 5 — Verify installation

Run each hook with test input and confirm exit code 0:

```bash
echo '{"prompt":"add a new component","session_id":"test"}' | CLAUDE_PROJECT_DIR="." ~/.claude/hooks/classify.sh > /dev/null 2>&1 && echo "classify: OK" || echo "classify: FAIL"
echo '{"source":"startup","session_id":"test"}' | CLAUDE_PROJECT_DIR="." ~/.claude/hooks/maintain.sh > /dev/null 2>&1 && echo "maintain: OK" || echo "maintain: FAIL"
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | CLAUDE_PROJECT_DIR="." ~/.claude/hooks/guard-explore.sh > /dev/null 2>&1 && echo "guard-explore: OK" || echo "guard-explore: FAIL"
```

Validate settings JSON:

```bash
jq empty ~/.claude/settings.json && echo "settings: VALID JSON" || echo "settings: INVALID JSON"
```

## Step 6 — Report

Print this summary table with actual results:

```
Orchestration Hooks — Installation Report
==========================================
Hook              Event              Status
─────────────────────────────────────────────
classify.sh       UserPromptSubmit   [OK/FAIL]
maintain.sh       SessionStart       [OK/FAIL]
guard-explore.sh  PreToolUse         [OK/FAIL]
settings.json     —                  [VALID/INVALID]
─────────────────────────────────────────────
Hooks installed globally at ~/.claude/hooks/
Settings updated at ~/.claude/settings.json
Active for ALL projects. Restart Claude Code to activate.
```

## Appendix — Known Constraints

| Constraint | Detail |
|---|---|
| No tilde expansion | `~` and `$HOME` don't expand in settings.json `command` fields — use absolute paths |
| No `PostCompact` event | Not a valid Claude Code hook event — rehydrate.sh cannot be registered |
| Matcher required | Each hook group needs `"matcher": "*"` |
| PreToolUse deny format | Must output JSON `hookSpecificOutput` with `permissionDecision: "deny"` + exit 0. Exit code 2 blocks silently (drops output) |
| Timeout in seconds | Not milliseconds |
| JSON output on exit 0 only | Hook JSON output is only parsed when exit code is 0 |

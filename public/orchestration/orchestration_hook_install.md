# Orchestration Protocol — Claude Code Hook Installer

> **Usage:** Paste this file as a prompt to Claude Code, or run: `claude -p "$(curl -sL https://agentic-orchestration-workflows.vercel.app/orchestration/orchestration_hook_install.md)"`

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

## Step 2 — Ensure project CLAUDE.md

The project's `CLAUDE.md` must contain the orchestration directive so every conversation loads the protocol. Check and update as needed.

**Required content** (must appear in `CLAUDE.md`, exact text):

```
**CRITICAL: Read `.orchestration/orchestration.md` BEFORE any tool usage on every conversation. This is non-negotiable — even for "simple" or "exploration" tasks. Strictly implement its protocol before proceeding.**
```

**Rules:**
- If `CLAUDE.md` does not exist at the project root, create it with just the line above.
- If `CLAUDE.md` exists but does NOT contain the directive, **prepend** the directive as the first line (preserve all existing content below).
- If `CLAUDE.md` already contains the directive, do nothing.

```bash
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"
DIRECTIVE='**CRITICAL: Read `.orchestration/orchestration.md` BEFORE any tool usage on every conversation. This is non-negotiable — even for "simple" or "exploration" tasks. Strictly implement its protocol before proceeding.**'

if [ ! -f "$CLAUDE_MD" ]; then
  echo "$DIRECTIVE" > "$CLAUDE_MD"
  echo "CLAUDE.md: CREATED"
elif ! grep -qF '.orchestration/orchestration.md' "$CLAUDE_MD"; then
  { echo "$DIRECTIVE"; echo ""; cat "$CLAUDE_MD"; } > "$CLAUDE_MD.tmp" && mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
  echo "CLAUDE.md: UPDATED (directive prepended)"
else
  echo "CLAUDE.md: OK (directive already present)"
fi
```

## Step 3 — Write hook scripts

Create the following four files exactly as shown in `~/.claude/hooks/`.

### `~/.claude/hooks/classify.sh`

```bash
#!/bin/bash
# Orchestration Hook: UserPromptSubmit
# Injects the full orchestration protocol + auto-classified workflow as context.
# This replaces the need to manually add "Read .orchestration/orchestration.md" to every prompt.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .user_input // ""' 2>/dev/null) || PROMPT=""
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

CDN_BASE="https://agentic-orchestration-workflows.vercel.app"
CDN="$CDN_BASE/orchestration/workflows"
LOCAL="$PROJECT_DIR/.orchestration/workflows"
ORCH_FILE="$PROJECT_DIR/.orchestration/orchestration.md"

# --- Load full orchestration protocol ---
PROTOCOL_CONTENT=""
if [ -f "$ORCH_FILE" ]; then
  PROTOCOL_CONTENT=$(cat "$ORCH_FILE")
else
  PROTOCOL_CONTENT=$(curl -sL --max-time 5 "$CDN_BASE/orchestration/orchestration.md" 2>/dev/null) || PROTOCOL_CONTENT=""
fi

# --- Detect project technology for workflow routing ---
# React (.jsx/.tsx) → workflows/react/ | .NET (.cs) → workflows/ | Other → workflows/
TECH_PREFIX=""
if find "$PROJECT_DIR" -maxdepth 4 -name '*.tsx' -o -name '*.jsx' 2>/dev/null | head -1 | grep -q .; then
  TECH_PREFIX="react/"
fi

# --- Classification Table ---
RULES=(
  "feature|${TECH_PREFIX}feature.md|build create add implement new"
  "bugfix|${TECH_PREFIX}bugfix.md|fix broken error crash bug"
  "refactor|${TECH_PREFIX}refactor.md|clean improve restructure rename refactor"
  "performance|${TECH_PREFIX}performance.md|slow optimize performance speed"
  "review|${TECH_PREFIX}review.md|review check merge"
  "pr|${TECH_PREFIX}pr.md|pr pull request"
  "test|${TECH_PREFIX}test.md|test spec coverage e2e unit"
  "docs|${TECH_PREFIX}docs.md|document readme explain"
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

# --- Load matched workflow (if any) ---
WORKFLOW_CONTENT=""
CLASSIFICATION_NOTE=""

if [ "$BEST_SCORE" -gt 0 ]; then
  LOCAL_FILE="$LOCAL/$MATCHED_PATH"
  if [ -f "$LOCAL_FILE" ]; then
    WORKFLOW_CONTENT=$(cat "$LOCAL_FILE")
  else
    WORKFLOW_CONTENT=$(curl -sL --max-time 5 "$CDN/$MATCHED_PATH" 2>/dev/null) || WORKFLOW_CONTENT=""
  fi

  if [ -n "$WORKFLOW_CONTENT" ]; then
    CLASSIFICATION_NOTE="AUTO-CLASSIFIED: $MATCHED_KEY workflow (confidence: $BEST_SCORE signal words matched)"
  else
    CLASSIFICATION_NOTE="Auto-classified as '$MATCHED_KEY' but workflow file not found. Fetch from: $CDN/$MATCHED_PATH"
  fi
else
  CLASSIFICATION_NOTE="No auto-classification matched. Use the classification table in the protocol to classify this task manually."
fi

# --- Output: inject full protocol + classification + workflow ---
echo "<orchestration-hook>"

# Always inject the full protocol
if [ -n "$PROTOCOL_CONTENT" ]; then
  echo "--- ORCHESTRATION PROTOCOL (implement strictly) ---"
  echo "$PROTOCOL_CONTENT"
  echo "--- END PROTOCOL ---"
  echo ""
fi

echo "$CLASSIFICATION_NOTE"

if [ -n "$WORKFLOW_CONTENT" ]; then
  echo ""
  echo "--- WORKFLOW: $MATCHED_KEY ---"
  echo "$WORKFLOW_CONTENT"
  echo "--- END WORKFLOW ---"
fi

echo "</orchestration-hook>"

exit 0
```

### `~/.claude/hooks/maintain.sh`

```bash
#!/bin/bash
# Orchestration Hook: SessionStart
# Self-maintenance: checks CDN for protocol/script updates and downloads if needed.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

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

# --- 4. Check artifact staleness via git-sha ---
CURRENT_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
HAS_CHANGES=$(git -C "$PROJECT_DIR" status --short 2>/dev/null | head -1)
if [ -n "$CURRENT_SHA" ]; then
  for artifact in "$ORCH_DIR/tools/"compacted_*.md "$ORCH_DIR/tools/"depgraph_*.md "$ORCH_DIR/tools/"symbols_*.md; do
    [ -f "$artifact" ] || continue
    ARTIFACT_SHA=$(sed -n 's/.*git-sha:[[:space:]]*\([0-9a-f]\{7,\}\).*/\1/p' "$artifact" 2>/dev/null | head -1) || ARTIFACT_SHA=""
    if [ -z "$ARTIFACT_SHA" ] || [ "$ARTIFACT_SHA" != "$CURRENT_SHA" ] || [ -n "$HAS_CHANGES" ]; then
      rm -f "$artifact"
      UPDATES="${UPDATES}Removed stale artifact: $(basename "$artifact"). "
    fi
  done
fi

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
# Blocks Read/Glob/Grep/Task(Explore) on source paths until compaction is grepped.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null) || TOOL_NAME=""

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
  TARGET_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""' 2>/dev/null) || TARGET_PATH=""
  # Create marker if grepping compacted files or orchestration tools directory
  if echo "$TARGET_PATH" | grep -qE "compacted_|\.orchestration/tools"; then
    touch "$MARKER"
    exit 0
  fi
  # Block Grep on source files if compaction not yet grepped
  if [ ! -f "$MARKER" ] && [ -n "$TARGET_PATH" ] && echo "$TARGET_PATH" | grep -qE "(^|/)src/"; then
    deny
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

# ─── Check if targeting source files ───
IS_SOURCE=false

case "$TOOL_NAME" in
  Read)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || FILE_PATH=""
    if [ -n "$FILE_PATH" ] && echo "$FILE_PATH" | grep -qE "(^|/)src/"; then
      IS_SOURCE=true
    fi
    ;;
  Glob)
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""' 2>/dev/null) || PATTERN=""
    SEARCH_PATH=$(echo "$INPUT" | jq -r '.tool_input.path // ""' 2>/dev/null) || SEARCH_PATH=""
    if echo "$PATTERN" | grep -qE "(^|/)src/" || { [ -n "$SEARCH_PATH" ] && echo "$SEARCH_PATH" | grep -qE "(^|/)src/"; }; then
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
deny
```

### `~/.claude/hooks/rehydrate.sh`

This hook re-injects the full orchestration protocol after context compaction. Note: `PostCompact` is not a registerable hook event, so this script is sourced by the rehydration system-reminder or can be called manually.

```bash
#!/bin/bash
# Orchestration Hook: PostCompact
# Re-injects the orchestration protocol after context compaction.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
ORCH_FILE="$PROJECT_DIR/.orchestration/orchestration.md"

if [ -f "$ORCH_FILE" ]; then
  PROTOCOL_CONTENT=$(cat "$ORCH_FILE")
  echo "<orchestration-rehydrate>"
  echo "Context was compacted. The orchestration protocol is still active."
  echo ""
  echo "--- ORCHESTRATION PROTOCOL (implement strictly) ---"
  echo "$PROTOCOL_CONTENT"
  echo "--- END PROTOCOL ---"
  echo "</orchestration-rehydrate>"
else
  echo "<orchestration-rehydrate>Orchestration protocol file not found at $ORCH_FILE</orchestration-rehydrate>"
fi

exit 0
```

## Step 4 — Make scripts executable

```bash
chmod +x ~/.claude/hooks/classify.sh ~/.claude/hooks/maintain.sh ~/.claude/hooks/guard-explore.sh ~/.claude/hooks/rehydrate.sh
```

## Step 5 — Register hooks in user-level settings

Read `~/.claude/settings.json`. If it exists, **merge** the `hooks` key into the existing JSON (preserve all existing keys). If it does not exist, create it.

**IMPORTANT — Claude Code settings requirements:**
- Command paths must be **absolute** — `~` and `$HOME` do NOT expand in JSON. Resolve the user's home directory and write the full path (e.g., `/home/user/.claude/hooks/classify.sh`).
- Each hook group must include `"matcher": "*"`.
- `PostCompact` is **NOT** a valid hook event — do not register `rehydrate.sh` in settings.json. It is kept as a utility script only.
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

## Step 6 — Verify installation

Run each hook with test input and confirm exit code 0:

```bash
echo '{"prompt":"add a new component","session_id":"test"}' | CLAUDE_PROJECT_DIR="." ~/.claude/hooks/classify.sh > /dev/null 2>&1 && echo "classify: OK" || echo "classify: FAIL"
echo '{"source":"startup","session_id":"test"}' | CLAUDE_PROJECT_DIR="." ~/.claude/hooks/maintain.sh > /dev/null 2>&1 && echo "maintain: OK" || echo "maintain: FAIL"
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | CLAUDE_PROJECT_DIR="." ~/.claude/hooks/guard-explore.sh > /dev/null 2>&1 && echo "guard-explore: OK" || echo "guard-explore: FAIL"
echo '{"source":"compact","session_id":"test"}' | CLAUDE_PROJECT_DIR="." ~/.claude/hooks/rehydrate.sh > /dev/null 2>&1 && echo "rehydrate: OK" || echo "rehydrate: FAIL"
```

Validate CLAUDE.md:

```bash
grep -qF '.orchestration/orchestration.md' CLAUDE.md && echo "CLAUDE.md: OK" || echo "CLAUDE.md: MISSING DIRECTIVE"
```

Validate settings JSON:

```bash
jq empty ~/.claude/settings.json && echo "settings: VALID JSON" || echo "settings: INVALID JSON"
```

## Step 7 — Report

Print this summary table with actual results:

```
Orchestration Hooks — Installation Report
==========================================
Hook              Event              Status
─────────────────────────────────────────────
classify.sh       UserPromptSubmit   [OK/FAIL]
maintain.sh       SessionStart       [OK/FAIL]
guard-explore.sh  PreToolUse         [OK/FAIL]
rehydrate.sh      (utility only)     [OK/FAIL]
CLAUDE.md         —                  [OK/MISSING]
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
| No `PostCompact` event | Not a valid Claude Code hook event — `rehydrate.sh` is kept as a utility script, not registered in settings |
| Matcher required | Each hook group needs `"matcher": "*"` |
| PreToolUse deny format | Must output JSON `hookSpecificOutput` with `permissionDecision: "deny"` + exit 0. Exit code 2 blocks silently (drops output) |
| Timeout in seconds | Not milliseconds |
| JSON output on exit 0 only | Hook JSON output is only parsed when exit code is 0 |
| No `set -e` in hooks | Use `set -uo pipefail` (not `set -euo pipefail`) — `-e` causes silent crashes on `jq` failures, producing "No stderr output" errors |
| Parse from `$INPUT` directly | Extract `jq` fields from original stdin JSON via `.tool_input.field` — do NOT extract `tool_input` as intermediate string then re-parse (breaks on complex content like Agent prompts) |
| Always add `jq` fallbacks | Every `jq` extraction should have `2>/dev/null) \|\| VAR=""` to prevent non-zero exits |

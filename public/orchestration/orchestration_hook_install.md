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

The project's `CLAUDE.md` must contain the orchestration directive so every conversation loads the protocol.

**Required content** (must appear in `CLAUDE.md`, exact text):

```
**CRITICAL: Follow the orchestration protocol injected by hooks on every prompt. This is non-negotiable — even for "simple" or "exploration" tasks.**
```

**Rules:**
- If `CLAUDE.md` does not exist at the project root, create it with just the line above.
- If `CLAUDE.md` exists but does NOT contain the directive, **prepend** the directive as the first line (preserve all existing content below).
- If `CLAUDE.md` already contains the directive, do nothing.

```bash
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"
DIRECTIVE='**CRITICAL: Follow the orchestration protocol injected by hooks on every prompt. This is non-negotiable — even for "simple" or "exploration" tasks.**'

if [ ! -f "$CLAUDE_MD" ]; then
  echo "$DIRECTIVE" > "$CLAUDE_MD"
  echo "CLAUDE.md: CREATED"
elif ! grep -qF 'orchestration protocol' "$CLAUDE_MD"; then
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
# Orchestration Hook: UserPromptSubmit (v2.0.0)
# Session-aware injection: full protocol on first prompt, condensed reminder on subsequent.
# Auto-classifies workflow, detects EXEMPT tasks, injects patterns.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Skip if project has no orchestration setup
if [ ! -d "$PROJECT_DIR/.orchestration" ]; then
  exit 0
fi

# --- Per-prompt: clear markers so each prompt starts fresh ---
rm -f "$PROJECT_DIR/.orchestration/tools/.exempt"
rm -f "$PROJECT_DIR/.orchestration/tools/.compaction_grepped"
rm -f "$PROJECT_DIR/.orchestration/tools/.grep_patterns"
rm -f "$PROJECT_DIR/.orchestration/tools/.prompt_keywords"

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // .user_input // ""' 2>/dev/null) || PROMPT=""
PROMPT_LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

# --- Extract prompt keywords for grep quality validation ---
# Stop words: common English words unlikely to match code identifiers
STOP_WORDS="the a an is are was were be been being to for in on it its this that with from by at of and or not but so if do does did has have had can could will would shall should may might must into than then also just only very too quite"
# Signal words: action verbs used for classification (won't match code identifiers)
SIGNAL_WORDS="fix broken error crash bug build create add implement new clean improve restructure rename refactor slow optimize performance speed review check merge pr pull request test spec coverage e2e unit document readme explain qa smoke visual regression browser complex multi-step plan patterns conventions generate typo bump update change wording label what how does describe tell show look read view open print list"

if [ -n "$PROMPT_LOWER" ]; then
  KEYWORDS=""
  for word in $PROMPT_LOWER; do
    # Strip non-alphanumeric chars from edges
    clean=$(echo "$word" | sed 's/^[^a-z0-9]*//;s/[^a-z0-9]*$//')
    # Skip if less than 3 chars
    [ ${#clean} -lt 3 ] && continue
    # Skip stop words
    is_stop=false
    for sw in $STOP_WORDS; do
      [ "$clean" = "$sw" ] && { is_stop=true; break; }
    done
    [ "$is_stop" = true ] && continue
    # Skip signal words
    is_signal=false
    for sig in $SIGNAL_WORDS; do
      [ "$clean" = "$sig" ] && { is_signal=true; break; }
    done
    [ "$is_signal" = true ] && continue
    KEYWORDS="${KEYWORDS}${clean}\n"
  done
  if [ -n "$KEYWORDS" ]; then
    mkdir -p "$PROJECT_DIR/.orchestration/tools"
    printf "%b" "$KEYWORDS" | sort -u > "$PROJECT_DIR/.orchestration/tools/.prompt_keywords"
  fi
fi

CDN_BASE="https://agentic-orchestration-workflows.vercel.app"
CDN="$CDN_BASE/orchestration/workflows"
LOCAL="$PROJECT_DIR/.orchestration/workflows"
ORCH_FILE="$PROJECT_DIR/.orchestration/orchestration.md"
PROTOCOL_MARKER="$PROJECT_DIR/.orchestration/tools/.protocol_injected"

# --- Session-aware protocol loading ---
PROTOCOL_CONTENT=""
IS_FIRST_PROMPT=true

if [ -f "$PROTOCOL_MARKER" ]; then
  IS_FIRST_PROMPT=false
fi

if [ "$IS_FIRST_PROMPT" = true ]; then
  # First prompt: load full protocol
  if [ -f "$ORCH_FILE" ]; then
    PROTOCOL_CONTENT=$(cat "$ORCH_FILE")
  else
    PROTOCOL_CONTENT=$(curl -sL --max-time 5 "$CDN_BASE/orchestration/orchestration.md" 2>/dev/null) || PROTOCOL_CONTENT=""
  fi
  # Set marker for subsequent prompts
  mkdir -p "$PROJECT_DIR/.orchestration/tools"
  touch "$PROTOCOL_MARKER"
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
  "qa|qa.md|qa smoke visual regression browser"
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

# --- EXEMPT detection (safe default: NOT exempt) ---
# EXEMPT rule: single file, 1-2 ops, zero architecture impact, obvious correctness, no codebase search needed.
EXEMPT="false"

# Step 1: NEVER-EXEMPT keywords (architecture impact / multi-file / codebase search)
NEVER_EXEMPT_PATTERN="\b(rename|refactor|restructure|move|delete|remove|replace|shared|component|import|export|across|everywhere|every|all files|multiple files|codebase|blast radius|dep graph|dependency|schema|migration|database|api|endpoint|route|middleware|auth)\b"
HAS_NEVER_EXEMPT=false
if echo "$PROMPT_LOWER" | grep -qEi "$NEVER_EXEMPT_PATTERN"; then
  HAS_NEVER_EXEMPT=true
fi

# Step 2: Split EXEMPT signals into read-only and trivial-edit categories
READONLY_PATTERN="\b(what does|what is|how does|explain|describe|tell me|show me|look at|read|view|open|print|list)\b"
TRIVIAL_EDIT_PATTERN="\b(typo|string literal|bump version|update version|change text|fix text|wording|label|fix typo)\b"
HAS_READONLY=false
HAS_TRIVIAL_EDIT=false
if echo "$PROMPT_LOWER" | grep -qEi "$READONLY_PATTERN"; then
  HAS_READONLY=true
fi
if echo "$PROMPT_LOWER" | grep -qEi "$TRIVIAL_EDIT_PATTERN"; then
  HAS_TRIVIAL_EDIT=true
fi

# Step 3: Decision
if [ "$HAS_NEVER_EXEMPT" = true ]; then
  # Never exempt regardless of other signals
  EXEMPT="false"
elif [ "$HAS_TRIVIAL_EDIT" = true ]; then
  # Trivial edits are always exempt
  EXEMPT="true"
elif [ "$HAS_READONLY" = true ] && [ "$BEST_SCORE" -le 1 ]; then
  # Read-only queries are exempt only if ≤1 workflow signal word matched
  EXEMPT="true"
else
  # Unknown prompts → NOT EXEMPT (safe default)
  EXEMPT="false"
fi

# Write marker if EXEMPT
if [ "$EXEMPT" = "true" ]; then
  mkdir -p "$PROJECT_DIR/.orchestration/tools"
  touch "$PROJECT_DIR/.orchestration/tools/.exempt"
fi

# --- Load patterns if not EXEMPT ---
PATTERNS_CONTENT=""
if [ "$EXEMPT" = "false" ]; then
  PATTERNS_FILE="$PROJECT_DIR/.patterns/patterns.md"
  if [ -f "$PATTERNS_FILE" ]; then
    PATTERNS_CONTENT=$(cat "$PATTERNS_FILE")
  fi
fi

# --- Output ---
echo "<orchestration-hook>"

if [ "$IS_FIRST_PROMPT" = true ]; then
  # First prompt: inject full protocol
  if [ -n "$PROTOCOL_CONTENT" ]; then
    echo "--- ORCHESTRATION PROTOCOL (implement strictly) ---"
    echo "$PROTOCOL_CONTENT"
    echo "--- END PROTOCOL ---"
    echo ""
  fi
else
  # Subsequent prompts: inject condensed reminder
  cat <<'REMINDER'
--- ORCHESTRATION REMINDER ---
GATED SEQUENCE: 1) Compact → 2) Grep compaction → 3) Read source (only for gaps)
HARD RULE: Do NOT Read source, Glob, or Explore until compaction is grepped and findings stated.
NO CONTEXT REUSE: Each new task must grep compaction independently.
BINDING: ⚙ [task] | [workflow + URL] | [simple/complex] | [tools]
EXEMPT: ⚙ [task] | EXEMPT — only when: single file, 1-2 ops, zero architecture impact, no codebase search. Use standard tools (Read/Glob/Grep), NOT Bash for file reading.
COMPLETION: ✓ [task] | [workflow] | [files modified] | cleanup: [yes/no/n/a]
PATTERNS: If .patterns/patterns.md exists, load and treat as binding constraints.
--- END REMINDER ---

REMINDER
fi

echo "$CLASSIFICATION_NOTE"
echo "EXEMPT-DETECTED: $EXEMPT"

if [ -n "$WORKFLOW_CONTENT" ]; then
  echo ""
  echo "--- WORKFLOW: $MATCHED_KEY ---"
  echo "$WORKFLOW_CONTENT"
  echo "--- END WORKFLOW ---"
fi

if [ -n "$PATTERNS_CONTENT" ]; then
  echo ""
  echo "--- PATTERNS (binding constraints) ---"
  echo "$PATTERNS_CONTENT"
  echo "--- END PATTERNS ---"
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

# Clear session markers from previous sessions
rm -f "$ORCH_DIR/tools/.compaction_grepped"
rm -f "$ORCH_DIR/tools/.protocol_injected"
rm -f "$ORCH_DIR/tools/.grep_patterns"
rm -f "$ORCH_DIR/tools/.prompt_keywords"

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
      curl -sL --max-time 5 "$CDN_BASE/tools/$script" -o "$LOCAL_SCRIPT.tmp" 2>/dev/null && \
        [ -s "$LOCAL_SCRIPT.tmp" ] && mv "$LOCAL_SCRIPT.tmp" "$LOCAL_SCRIPT" && \
        UPDATES="${UPDATES}Updated script: $script. " || rm -f "$LOCAL_SCRIPT.tmp"
    fi
  done
else
  # No manifest — ensure base scripts exist
  for s in compaction.js dep-graph.js symbols.js; do
    if [ ! -f "$SCRIPTS_DIR/$s" ]; then
      curl -sL --max-time 5 "$CDN_BASE/tools/$s" -o "$SCRIPTS_DIR/$s.tmp" 2>/dev/null && \
        [ -s "$SCRIPTS_DIR/$s.tmp" ] && mv "$SCRIPTS_DIR/$s.tmp" "$SCRIPTS_DIR/$s" && \
        UPDATES="${UPDATES}Downloaded script: $s. " || rm -f "$SCRIPTS_DIR/$s.tmp"
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

# Clear protocol_injected marker so next prompt re-injects full protocol
rm -f "$PROJECT_DIR/.orchestration/tools/.protocol_injected"

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
grep -qF 'orchestration protocol' CLAUDE.md && echo "CLAUDE.md: OK" || echo "CLAUDE.md: MISSING DIRECTIVE"
```

Validate settings JSON:

```bash
jq empty ~/.claude/settings.json && echo "settings: VALID JSON" || echo "settings: INVALID JSON"
```

## Step 7 — CDN availability check

Verify all CDN endpoints the hooks depend on are reachable:

```bash
CDN="https://agentic-orchestration-workflows.vercel.app"
cdn_ok=0; cdn_fail=0
for path in \
  orchestration/orchestration.md \
  orchestration/workflows/react/feature.md \
  orchestration/workflows/dotnet/feature.md \
  orchestration/workflows/qa.md \
  orchestration/workflows/todo.md \
  tools/manifest.json \
  tools/compaction.js tools/dep-graph.js tools/symbols.js tools/parse-utils.js; do
  code=$(curl -sL --max-time 5 -o /dev/null -w '%{http_code}' "$CDN/$path")
  if [ "$code" = "200" ]; then cdn_ok=$((cdn_ok+1)); else cdn_fail=$((cdn_fail+1)); echo "  FAIL ($code): $path"; fi
done
echo "CDN: $cdn_ok reachable, $cdn_fail failed"
```

## Step 8 — Report

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

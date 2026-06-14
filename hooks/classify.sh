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

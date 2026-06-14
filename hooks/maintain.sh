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

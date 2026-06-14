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

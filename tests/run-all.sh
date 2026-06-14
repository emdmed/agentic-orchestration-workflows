#!/usr/bin/env bash

# Run all tests for the agentic orchestration workflows project
# Commit: 7f8ac4d9e0c219e7d87121403aa7b4fb51a3fda2
# Usage: bash tests/run-all.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

total_passed=0
total_failed=0
suite_results=""

run_suite() {
  local name="$1"
  local cmd="$2"

  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "  $name"
  echo "╚══════════════════════════════════════════════════╝"

  if eval "$cmd"; then
    suite_results="$suite_results\n  ✓ $name"
  else
    suite_results="$suite_results\n  ✗ $name (exit code: $?)"
    total_failed=$((total_failed + 1))
  fi
}

echo "Agentic Orchestration Workflows — Test Suite"
echo "Commit: 7f8ac4d9e0c219e7d87121403aa7b4fb51a3fda2"
echo "Date: $(date -Iseconds)"
echo ""

# Unit tests (no orchestration layer needed)
echo "━━━ WITHOUT orchestration layer (unit/integration) ━━━"

run_suite "install-doc sync check" "node $ROOT/scripts/sync-install-doc.js --check"
run_suite "parse-utils unit tests" "node $SCRIPT_DIR/test-parse-utils.js"
run_suite "compaction CLI tests" "node $SCRIPT_DIR/test-compaction-cli.js"
run_suite "dep-graph CLI tests" "node $SCRIPT_DIR/test-depgraph-cli.js"
run_suite "symbols CLI tests" "node $SCRIPT_DIR/test-symbols-cli.js"

# Integration tests (with orchestration layer)
echo ""
echo "━━━ WITH orchestration layer (hooks/session/CDN) ━━━"

run_suite "hook integration tests" "bash $SCRIPT_DIR/test-hooks.sh"

# CDN tests depend on deploy state, not just code correctness. Skip with SKIP_CDN=1
# (e.g. in CI's blocking job) so a pending deploy doesn't fail the unit suite.
if [ "${SKIP_CDN:-0}" = "1" ]; then
  echo ""
  echo "  ⏭  CDN endpoint tests skipped (SKIP_CDN=1)"
else
  run_suite "CDN endpoint tests" "bash $SCRIPT_DIR/test-cdn.sh"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "  FINAL SUMMARY"
echo "╚══════════════════════════════════════════════════╝"
echo -e "$suite_results"
echo ""
echo "Commit: $(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"

exit $((total_failed > 0 ? 1 : 0))

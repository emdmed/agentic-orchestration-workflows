#!/usr/bin/env bash

# Test: CDN endpoint availability — post-install smoke tests
# Run: bash tests/test-cdn.sh
#
# Verifies that every CDN endpoint the hooks depend on is reachable
# and returns valid, non-empty content with expected markers.

set -uo pipefail

CDN_BASE="https://agentic-orchestration-workflows.vercel.app"

passed=0
failed=0
failures=""

test_case() {
  local name="$1"
  shift
  if eval "$@" 2>/dev/null; then
    passed=$((passed + 1))
    echo "  ✓ $name"
  else
    failed=$((failed + 1))
    failures="$failures\n  ✗ $name"
    echo "  ✗ $name"
  fi
}

# Helper: fetch URL into a temp file, return success if HTTP 200 and non-empty
TMPDIR_CDN=$(mktemp -d /tmp/test-cdn-XXXXXX)
trap "rm -rf $TMPDIR_CDN" EXIT

fetch() {
  local url="$1"
  local out="$TMPDIR_CDN/response"
  local http_code
  http_code=$(curl -sL --max-time 10 -o "$out" -w '%{http_code}' "$url" 2>/dev/null) || http_code="000"
  if [ "$http_code" = "200" ] && [ -s "$out" ]; then
    return 0
  fi
  return 1
}

echo ""
echo "── Orchestration protocol ──"

fetch "$CDN_BASE/orchestration/orchestration.md"
test_case "orchestration.md reachable (HTTP 200)" "[ $? -eq 0 ]"
test_case "orchestration.md contains version header" "grep -q 'version:' '$TMPDIR_CDN/response'"
test_case "orchestration.md contains CLASSIFY section" "grep -q 'CLASSIFY TASK' '$TMPDIR_CDN/response'"
test_case "orchestration.md contains BINDING section" "grep -q 'BINDING' '$TMPDIR_CDN/response'"

echo ""
echo "── Install guide ──"

fetch "$CDN_BASE/orchestration/orchestration_hook_install.md"
test_case "install guide reachable" "[ $? -eq 0 ]"
test_case "install guide contains Step 1" "grep -q 'Step 1' '$TMPDIR_CDN/response'"

echo ""
echo "── React workflow files ──"

for wf in feature bugfix refactor performance review pr test docs; do
  fetch "$CDN_BASE/orchestration/workflows/react/$wf.md"
  test_case "react/$wf.md reachable" "[ $? -eq 0 ]"
done

echo ""
echo "── .NET workflow files ──"

for wf in feature bugfix refactor performance review pr test docs; do
  fetch "$CDN_BASE/orchestration/workflows/dotnet/$wf.md"
  test_case "dotnet/$wf.md reachable" "[ $? -eq 0 ]"
done

echo ""
echo "── Shared workflow files ──"

for wf in todo patterns-gen; do
  fetch "$CDN_BASE/orchestration/workflows/$wf.md"
  test_case "$wf.md reachable" "[ $? -eq 0 ]"
done

echo ""
echo "── Tool scripts & manifest ──"

fetch "$CDN_BASE/tools/manifest.json"
test_case "manifest.json reachable" "[ $? -eq 0 ]"
test_case "manifest.json is valid JSON" "jq empty '$TMPDIR_CDN/response'"

for script in compaction.js dep-graph.js symbols.js parse-utils.js; do
  fetch "$CDN_BASE/tools/$script"
  test_case "$script reachable" "[ $? -eq 0 ]"
done

echo ""
echo "── Manifest hash integrity ──"

# Verify that each script's sha256 matches the manifest entry
MANIFEST_FILE="$TMPDIR_CDN/manifest"
curl -sL --max-time 10 "$CDN_BASE/tools/manifest.json" -o "$MANIFEST_FILE" 2>/dev/null

if [ -s "$MANIFEST_FILE" ] && jq empty "$MANIFEST_FILE" 2>/dev/null; then
  for script in $(jq -r 'keys[]' "$MANIFEST_FILE"); do
    EXPECTED=$(jq -r ".[\"$script\"] | if type == \"object\" then .sha256 else . end" "$MANIFEST_FILE")
    SCRIPT_FILE="$TMPDIR_CDN/$script"
    curl -sL --max-time 10 "$CDN_BASE/tools/$script" -o "$SCRIPT_FILE" 2>/dev/null
    if [ -s "$SCRIPT_FILE" ]; then
      ACTUAL=$(sha256sum "$SCRIPT_FILE" | cut -d' ' -f1)
      test_case "$script sha256 matches manifest" "[ '$ACTUAL' = '$EXPECTED' ]"
    else
      test_case "$script sha256 matches manifest" "false"
    fi
  done
else
  echo "  ⚠ manifest.json unavailable — skipping hash checks"
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "Results: $passed passed, $failed failed"
if [ -n "$failures" ]; then
  echo ""
  echo "Failures:"
  echo -e "$failures"
fi
exit $((failed > 0 ? 1 : 0))

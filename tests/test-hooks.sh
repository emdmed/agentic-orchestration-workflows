#!/usr/bin/env bash

# Test: orchestration hooks — functional + static tests
# Run: bash tests/test-hooks.sh
#
# These tests exercise the hook scripts by piping simulated JSON input
# and checking outputs + side effects (marker files). A temp sandbox
# is used so tests never touch the real project state.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# Canonical hooks live in the repo. Allow override (e.g. to test an installed
# copy at ~/.claude/hooks) via HOOKS_DIR; default to the repo's hooks/.
HOOKS_DIR="${HOOKS_DIR:-$ROOT/hooks}"

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

# ─── Sandbox setup (in /tmp to avoid git walk-up from real repo) ────────────
SANDBOX=$(mktemp -d /tmp/test-hooks-XXXXXX)
OUTFILE="$SANDBOX/_output"
mkdir -p "$SANDBOX/.orchestration/tools/scripts"
mkdir -p "$SANDBOX/.orchestration/workflows"
echo "# Test Orchestration Protocol" > "$SANDBOX/.orchestration/orchestration.md"

sandbox_clean() {
  rm -f "$SANDBOX/.orchestration/tools/.protocol_injected"
  rm -f "$SANDBOX/.orchestration/tools/.compaction_grepped"
  rm -f "$SANDBOX/.orchestration/tools/.exempt"
  rm -f "$SANDBOX/.orchestration/tools/.grep_patterns"
  rm -f "$SANDBOX/.orchestration/tools/.prompt_keywords"
  rm -f "$SANDBOX/.orchestration/tools/"compacted_*.md
  rm -f "$OUTFILE"
}

cleanup() {
  rm -rf "$SANDBOX"
}
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ Section 0: Static smoke checks ══"
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "── Hook existence ──"

test_case "classify.sh exists and is executable" "[ -x '$HOOKS_DIR/classify.sh' ]"
test_case "guard-explore.sh exists and is executable" "[ -x '$HOOKS_DIR/guard-explore.sh' ]"
test_case "maintain.sh exists and is executable" "[ -x '$HOOKS_DIR/maintain.sh' ]"
test_case "rehydrate.sh exists and is executable" "[ -x '$HOOKS_DIR/rehydrate.sh' ]"

echo ""
echo "── Workflow files ──"

for wf in feature bugfix refactor performance review test docs; do
  test_case "react/$wf.md exists" "[ -f '$ROOT/public/orchestration/workflows/react/$wf.md' ]"
done

for wf in feature bugfix refactor performance review test docs; do
  test_case "dotnet/$wf.md exists" "[ -f '$ROOT/public/orchestration/workflows/dotnet/$wf.md' ]"
done

# pr.md is language-agnostic and shared (like todo/patterns-gen)
test_case "pr.md exists (shared)" "[ -f '$ROOT/public/orchestration/workflows/pr.md' ]"
test_case "todo.md exists" "[ -f '$ROOT/public/orchestration/workflows/todo.md' ]"
test_case "patterns-gen.md exists" "[ -f '$ROOT/public/orchestration/workflows/patterns-gen.md' ]"

echo ""
echo "── CDN manifest ──"

MANIFEST="$ROOT/public/tools/manifest.json"
if [ -f "$MANIFEST" ]; then
  test_case "manifest.json is valid JSON" "node -e 'JSON.parse(require(\"fs\").readFileSync(\"$MANIFEST\",\"utf-8\"))'"
  for script in compaction.js dep-graph.js symbols.js parse-utils.js; do
    test_case "manifest has $script" "node -e 'const m=JSON.parse(require(\"fs\").readFileSync(\"$MANIFEST\",\"utf-8\")); if(!m[\"$script\"]) process.exit(1)'"
  done
else
  echo "  ⚠ manifest.json not found — skipping"
fi

echo ""
echo "── Local script sync ──"

ORCH_DIR_REAL="$ROOT/.orchestration/tools"
for script in compaction.js dep-graph.js symbols.js parse-utils.js; do
  if [ -f "$ORCH_DIR_REAL/scripts/$script" ] && [ -f "$ROOT/public/tools/$script" ]; then
    test_case "local $script matches CDN source" "diff -q '$ORCH_DIR_REAL/scripts/$script' '$ROOT/public/tools/$script'"
  else
    echo "  ⚠ $script: local or CDN copy missing — skipping"
  fi
done


# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ Section 1: classify.sh — functional tests ══"
# ═══════════════════════════════════════════════════════════════════════════════

run_classify() {
  local prompt="$1"
  sandbox_clean
  echo "{\"prompt\":\"$prompt\"}" | CLAUDE_PROJECT_DIR="$SANDBOX" bash "$HOOKS_DIR/classify.sh" 2>/dev/null > "$OUTFILE"
}

# Variant that preserves .protocol_injected marker across calls
run_classify_keep_marker() {
  local prompt="$1"
  # Only clean non-marker state
  rm -f "$SANDBOX/.orchestration/tools/.exempt"
  rm -f "$SANDBOX/.orchestration/tools/.compaction_grepped"
  rm -f "$SANDBOX/.orchestration/tools/.grep_patterns"
  rm -f "$SANDBOX/.orchestration/tools/.prompt_keywords"
  rm -f "$SANDBOX/.orchestration/tools/"compacted_*.md
  rm -f "$OUTFILE"
  echo "{\"prompt\":\"$prompt\"}" | CLAUDE_PROJECT_DIR="$SANDBOX" bash "$HOOKS_DIR/classify.sh" 2>/dev/null > "$OUTFILE"
}

echo ""
echo "── Classification ──"

run_classify "fix the broken login"
test_case "bugfix classification" "grep -q 'AUTO-CLASSIFIED: bugfix' '$OUTFILE'"

run_classify "add a new button to the dashboard"
test_case "feature classification" "grep -q 'AUTO-CLASSIFIED: feature' '$OUTFILE'"

run_classify "optimize query speed for reports"
test_case "performance classification" "grep -q 'AUTO-CLASSIFIED: performance' '$OUTFILE'"

run_classify "clean up and restructure the auth module"
test_case "refactor classification" "grep -q 'AUTO-CLASSIFIED: refactor' '$OUTFILE'"

run_classify "review and check the code quality"
test_case "review classification" "grep -q 'AUTO-CLASSIFIED: review' '$OUTFILE'"

run_classify "add unit test coverage for utils"
test_case "test classification" "grep -q 'AUTO-CLASSIFIED: test' '$OUTFILE'"

run_classify "document the API endpoints in the README"
test_case "docs classification" "grep -q 'AUTO-CLASSIFIED: docs' '$OUTFILE'"

run_classify "hello world"
test_case "no-match fallback" "grep -q 'No auto-classification matched' '$OUTFILE'"

echo ""
echo "── EXEMPT detection ──"

run_classify "fix typo in readme"
test_case "trivial edit → .exempt marker created" "[ -f '$SANDBOX/.orchestration/tools/.exempt' ]"

run_classify "rename the auth component across the codebase"
test_case "never-exempt prompt → no .exempt marker" "[ ! -f '$SANDBOX/.orchestration/tools/.exempt' ]"

run_classify "what does this function do"
test_case "read-only query → .exempt marker created" "[ -f '$SANDBOX/.orchestration/tools/.exempt' ]"

echo ""
echo "── Session-aware protocol injection ──"

run_classify "fix a bug"
test_case "first prompt → full ORCHESTRATION PROTOCOL" "grep -q 'ORCHESTRATION PROTOCOL' '$OUTFILE'"
test_case "first prompt → .protocol_injected marker set" "[ -f '$SANDBOX/.orchestration/tools/.protocol_injected' ]"

# Keep .protocol_injected from the previous run
run_classify_keep_marker "another task"
test_case "subsequent prompt → ORCHESTRATION REMINDER" "grep -q 'ORCHESTRATION REMINDER' '$OUTFILE'"
test_case "subsequent prompt → no full protocol body" "! grep -q 'Test Orchestration Protocol' '$OUTFILE'"

echo ""
echo "── Keyword extraction ──"

run_classify "refactor the AuthService and UserRepository classes"
test_case ".prompt_keywords created" "[ -f '$SANDBOX/.orchestration/tools/.prompt_keywords' ]"
test_case "keywords contain authservice" "grep -qi 'authservice' '$SANDBOX/.orchestration/tools/.prompt_keywords'"
test_case "keywords contain userrepository" "grep -qi 'userrepository' '$SANDBOX/.orchestration/tools/.prompt_keywords'"

echo ""
echo "── Per-prompt marker clearing ──"

# Pre-create markers, then run classify — old markers should be cleared first
touch "$SANDBOX/.orchestration/tools/.exempt"
touch "$SANDBOX/.orchestration/tools/.compaction_grepped"
touch "$SANDBOX/.orchestration/tools/.grep_patterns"
run_classify "rename the auth component across the codebase"
test_case "old .exempt cleared by new prompt" "[ ! -f '$SANDBOX/.orchestration/tools/.exempt' ]"
test_case "old .compaction_grepped cleared" "[ ! -f '$SANDBOX/.orchestration/tools/.compaction_grepped' ]"
test_case "old .grep_patterns cleared" "[ ! -f '$SANDBOX/.orchestration/tools/.grep_patterns' ]"


# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ Section 2: guard-explore.sh — functional tests ══"
# ═══════════════════════════════════════════════════════════════════════════════

run_guard() {
  local json="$1"
  rm -f "$OUTFILE"
  echo "$json" | CLAUDE_PROJECT_DIR="$SANDBOX" bash "$HOOKS_DIR/guard-explore.sh" 2>/dev/null > "$OUTFILE"
}

echo ""
echo "── EXEMPT bypass ──"

sandbox_clean
touch "$SANDBOX/.orchestration/tools/.exempt"
run_guard '{"tool_name":"Read","tool_input":{"file_path":"src/app.tsx"}}'
test_case "EXEMPT → Read on source allowed (no deny)" "! grep -q 'permissionDecision' '$OUTFILE'"

echo ""
echo "── Tool gating without markers ──"

sandbox_clean
run_guard '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
test_case "Bash tool → always allowed" "! grep -q 'permissionDecision' '$OUTFILE'"

sandbox_clean
run_guard '{"tool_name":"Read","tool_input":{"file_path":"src/components/Header.ts"}}'
test_case "Read on .ts source → denied" "grep -q '\"deny\"' '$OUTFILE'"

sandbox_clean
run_guard '{"tool_name":"Glob","tool_input":{"pattern":"**/*.tsx"}}'
test_case "Glob for *.tsx → denied" "grep -q '\"deny\"' '$OUTFILE'"

sandbox_clean
run_guard '{"tool_name":"Task","tool_input":{"subagent_type":"Explore","prompt":"find routes"}}'
test_case "Task(Explore) → denied" "grep -q '\"deny\"' '$OUTFILE'"

echo ""
echo "── Safe paths always allowed ──"

sandbox_clean
run_guard '{"tool_name":"Read","tool_input":{"file_path":"package.json"}}'
test_case "Read package.json → allowed" "! grep -q 'permissionDecision' '$OUTFILE'"

sandbox_clean
run_guard '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}'
test_case "Read .md file → allowed" "! grep -q 'permissionDecision' '$OUTFILE'"

sandbox_clean
run_guard '{"tool_name":"Read","tool_input":{"file_path":".orchestration/orchestration.md"}}'
test_case "Read .orchestration/ path → allowed" "! grep -q 'permissionDecision' '$OUTFILE'"

echo ""
echo "── Grep quality gate ──"

sandbox_clean
touch "$SANDBOX/.orchestration/tools/compacted_test_2026-01-01.md"

run_guard '{"tool_name":"Grep","tool_input":{"pattern":".","path":".orchestration/tools/compacted_test_2026-01-01.md"}}'
test_case "trivial grep pattern '.' → denied" "grep -q '\"deny\"' '$OUTFILE'"

# Reset for next test (keep compacted file)
rm -f "$SANDBOX/.orchestration/tools/.grep_patterns" "$SANDBOX/.orchestration/tools/.compaction_grepped" "$OUTFILE"
run_guard '{"tool_name":"Grep","tool_input":{"pattern":"AuthService","path":".orchestration/tools/compacted_test_2026-01-01.md"}}'
test_case "first meaningful grep → allowed (exit 0)" "! grep -q 'permissionDecision' '$OUTFILE'"
test_case "pattern recorded in .grep_patterns" "grep -q 'AuthService' '$SANDBOX/.orchestration/tools/.grep_patterns'"

# Second distinct pattern → should unlock
run_guard '{"tool_name":"Grep","tool_input":{"pattern":"UserRepo","path":".orchestration/tools/compacted_test_2026-01-01.md"}}'
test_case "second distinct pattern → .compaction_grepped unlocked" "[ -f '$SANDBOX/.orchestration/tools/.compaction_grepped' ]"

echo ""
echo "── Post-unlock source access ──"

# .compaction_grepped now exists from above
run_guard '{"tool_name":"Read","tool_input":{"file_path":"src/app.tsx"}}'
test_case "after unlock → Read on source allowed" "! grep -q 'permissionDecision' '$OUTFILE'"

run_guard '{"tool_name":"Glob","tool_input":{"pattern":"**/*.tsx"}}'
test_case "after unlock → Glob for *.tsx allowed" "! grep -q 'permissionDecision' '$OUTFILE'"

echo ""
echo "── Keyword-based unlock (single grep) ──"

sandbox_clean
touch "$SANDBOX/.orchestration/tools/compacted_test_2026-01-01.md"
printf "authservice\n" > "$SANDBOX/.orchestration/tools/.prompt_keywords"
run_guard '{"tool_name":"Grep","tool_input":{"pattern":"AuthService","path":".orchestration/tools/compacted_test_2026-01-01.md"}}'
test_case "single grep matching keyword → unlocks" "[ -f '$SANDBOX/.orchestration/tools/.compaction_grepped' ]"

echo ""
echo "── Bash-grep unlock (tool-agnostic gate) ──"

# A Bash grep of compaction must unlock the gate just like the Grep tool, so
# harnesses without a Grep tool don't deadlock on source access.
sandbox_clean
touch "$SANDBOX/.orchestration/tools/compacted_test_2026-01-01.md"
run_guard '{"tool_name":"Bash","tool_input":{"command":"grep -n \"AuthService\" .orchestration/tools/compacted_test_2026-01-01.md"}}'
test_case "bash grep of compaction → pattern recorded" "grep -q 'AuthService' '$SANDBOX/.orchestration/tools/.grep_patterns'"
run_guard '{"tool_name":"Bash","tool_input":{"command":"grep -n \"UserRepo\" .orchestration/tools/compacted_test_2026-01-01.md"}}'
test_case "second distinct bash-grep pattern → unlocks" "[ -f '$SANDBOX/.orchestration/tools/.compaction_grepped' ]"
run_guard '{"tool_name":"Read","tool_input":{"file_path":"src/app.tsx"}}'
test_case "after bash-grep unlock → Read on source allowed" "! grep -q 'permissionDecision' '$OUTFILE'"

# Bash grep that does NOT target compaction must not unlock
sandbox_clean
touch "$SANDBOX/.orchestration/tools/compacted_test_2026-01-01.md"
run_guard '{"tool_name":"Bash","tool_input":{"command":"grep -rn foo src/"}}'
test_case "bash grep on source (not compaction) → no unlock" "[ ! -f '$SANDBOX/.orchestration/tools/.compaction_grepped' ]"

# Non-grep Bash command must not unlock even if it mentions the path
sandbox_clean
touch "$SANDBOX/.orchestration/tools/compacted_test_2026-01-01.md"
run_guard '{"tool_name":"Bash","tool_input":{"command":"cat .orchestration/tools/compacted_test_2026-01-01.md"}}'
test_case "non-grep bash command → no unlock" "[ ! -f '$SANDBOX/.orchestration/tools/.compaction_grepped' ]"


# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ Section 3: maintain.sh — functional tests ══"
# ═══════════════════════════════════════════════════════════════════════════════

run_maintain() {
  rm -f "$OUTFILE"
  CLAUDE_PROJECT_DIR="$SANDBOX" bash "$HOOKS_DIR/maintain.sh" 2>/dev/null > "$OUTFILE"
}

echo ""
echo "── Marker clearing ──"

sandbox_clean
touch "$SANDBOX/.orchestration/tools/.protocol_injected"
touch "$SANDBOX/.orchestration/tools/.compaction_grepped"
touch "$SANDBOX/.orchestration/tools/.grep_patterns"
touch "$SANDBOX/.orchestration/tools/.prompt_keywords"
run_maintain
test_case ".protocol_injected cleared" "[ ! -f '$SANDBOX/.orchestration/tools/.protocol_injected' ]"
test_case ".compaction_grepped cleared" "[ ! -f '$SANDBOX/.orchestration/tools/.compaction_grepped' ]"
test_case ".grep_patterns cleared" "[ ! -f '$SANDBOX/.orchestration/tools/.grep_patterns' ]"
test_case ".prompt_keywords cleared" "[ ! -f '$SANDBOX/.orchestration/tools/.prompt_keywords' ]"

echo ""
echo "── Old artifact cleanup ──"

sandbox_clean
# Create two compaction artifacts; ensure distinct mtime ordering
echo "older content" > "$SANDBOX/.orchestration/tools/compacted_proj_2026-03-27_08-00-00.md"
sleep 0.2
echo "newer content" > "$SANDBOX/.orchestration/tools/compacted_proj_2026-03-28_12-00-00.md"
# Sandbox is in /tmp (not a git repo), so staleness check is skipped
run_maintain
test_case "newest compaction survives" "[ -f '$SANDBOX/.orchestration/tools/compacted_proj_2026-03-28_12-00-00.md' ]"
test_case "older compaction removed" "[ ! -f '$SANDBOX/.orchestration/tools/compacted_proj_2026-03-27_08-00-00.md' ]"

echo ""
echo "── Output format ──"

sandbox_clean
run_maintain
test_case "output wrapped in <orchestration-maintenance> tags" "grep -q '<orchestration-maintenance>' '$OUTFILE'"


# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ Section 4: rehydrate.sh — functional tests ══"
# ═══════════════════════════════════════════════════════════════════════════════

run_rehydrate() {
  rm -f "$OUTFILE"
  CLAUDE_PROJECT_DIR="$SANDBOX" bash "$HOOKS_DIR/rehydrate.sh" 2>/dev/null > "$OUTFILE"
}

echo ""
echo "── Protocol re-injection ──"

sandbox_clean
# Ensure test orchestration.md is in place (maintain.sh may have overwritten it)
echo "# Test Orchestration Protocol" > "$SANDBOX/.orchestration/orchestration.md"
touch "$SANDBOX/.orchestration/tools/.protocol_injected"
run_rehydrate
test_case "rehydrate outputs protocol content" "grep -q 'Test Orchestration Protocol' '$OUTFILE'"
test_case "rehydrate wraps in <orchestration-rehydrate>" "grep -q '<orchestration-rehydrate>' '$OUTFILE'"
test_case ".protocol_injected cleared after rehydrate" "[ ! -f '$SANDBOX/.orchestration/tools/.protocol_injected' ]"


# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══════════════════════════════════════════════════"
echo "Results: $passed passed, $failed failed"
if [ -n "$failures" ]; then
  echo ""
  echo "Failures:"
  echo -e "$failures"
fi
exit $((failed > 0 ? 1 : 0))

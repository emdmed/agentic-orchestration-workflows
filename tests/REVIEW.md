# Agentic Orchestration Workflows — Test Review & Comparison

**Commit:** `7f8ac4d9e0c219e7d87121403aa7b4fb51a3fda2`
**Date:** 2026-03-23
**Reviewer:** Claude Opus 4.6

---

## What Can Be Tested

### WITHOUT the orchestration layer (unit tests on pure functions)

These test the tool scripts directly — no hooks, no CDN, no session state.

| Category | What | File | Functions |
|----------|------|------|-----------|
| **Parsing** | Comment/string stripping | `parse-utils.js` | `stripCommentsAndStrings` |
| **Parsing** | Balanced bracket reading | `parse-utils.js` | `readUntilBalanced` |
| **Parsing** | Generic extraction | `parse-utils.js` | `extractBalancedGenerics` |
| **Parsing** | Type annotation simplification | `parse-utils.js` | `simplifyTypeAnnotation` |
| **Parsing** | C# modifier consumption | `parse-utils.js` | `consumeModifiers` |
| **Parsing** | Language detection | `parse-utils.js` | `detectLanguage` |
| **Compaction** | JS/TS skeleton extraction | `compaction.js` | `extractJsSkeleton` (not exported — test via output) |
| **Compaction** | Python skeleton extraction | `compaction.js` | `extractPythonSkeleton` (not exported) |
| **Compaction** | C# skeleton extraction | `compaction.js` | `extractCSharpSkeleton` (not exported) |
| **Compaction** | Full pipeline output | `compaction.js` | CLI invocation on test fixtures |
| **Dep-graph** | JS/TS import extraction | `dep-graph.js` | `extractJsImports` (not exported) |
| **Dep-graph** | Python import extraction | `dep-graph.js` | `extractPyImports` (not exported) |
| **Dep-graph** | C# import extraction | `dep-graph.js` | `extractCsImports` (not exported) |
| **Dep-graph** | Cycle detection | `dep-graph.js` | `detectCycles` (not exported) |
| **Dep-graph** | Local import resolution | `dep-graph.js` | `resolveLocalImport` (not exported) |
| **Dep-graph** | Full pipeline output | `dep-graph.js` | CLI invocation on test fixtures |
| **Symbols** | JS/TS symbol extraction | `symbols.js` | CLI invocation on test fixtures |
| **Symbols** | C# symbol extraction | `symbols.js` | CLI invocation on test fixtures |
| **Symbols** | Python symbol extraction | `symbols.js` | CLI invocation on test fixtures |

### WITH the orchestration layer (integration/E2E tests)

These require the hooks, session markers, and CDN to be running.

| Category | What | Depends On |
|----------|------|------------|
| **Classification** | Signal word → workflow mapping | `classify.sh` hook |
| **Classification** | EXEMPT detection accuracy | `classify.sh` hook |
| **Classification** | Prompt keyword extraction | `classify.sh` hook |
| **Session** | Full protocol injection on first prompt | `.protocol_injected` marker |
| **Session** | Condensed reminder on subsequent prompts | `.protocol_injected` marker |
| **Session** | Marker cleanup between sessions | `maintain.sh` hook |
| **Guard** | Source file access blocked before compaction grep | `guard-explore.sh` hook |
| **Guard** | Grep quality gate (trivial pattern rejection) | `guard-explore.sh` + `.grep_patterns` |
| **Guard** | Grep quality gate (prompt keyword overlap) | `guard-explore.sh` + `.prompt_keywords` |
| **Guard** | Source access unlocked after quality grep | `guard-explore.sh` + `.compaction_grepped` |
| **Maintenance** | Stale script detection via SHA256 | `maintain.sh` + `manifest.json` |
| **Maintenance** | Old artifact cleanup | `maintain.sh` |
| **CDN** | Workflow markdown served correctly | Vercel deployment |
| **CDN** | CORS headers present | `vercel.json` |
| **CDN** | Tool scripts accessible | Vercel deployment |
| **E2E** | Full task lifecycle (classify → compact → grep → read → complete) | All hooks + tools |

---

## Comparison: Testing With vs Without Orchestration

| Dimension | Without Orchestration | With Orchestration |
|-----------|----------------------|-------------------|
| **Scope** | Pure function correctness | System behavior correctness |
| **Speed** | Milliseconds per test | Seconds (shell execution, file I/O) |
| **Dependencies** | Node.js only | Node.js + bash + hooks installed + CDN |
| **Determinism** | Fully deterministic | Non-deterministic (CDN, timing, shell) |
| **Coverage** | Parsing, extraction, formatting | Classification, gating, session flow |
| **Failure mode** | Wrong output | Wrong behavior (blocks valid work, allows invalid) |
| **Test approach** | Assert on return values | Assert on file markers, CLI output, exit codes |
| **Existing fixtures** | `generics.ts`, `complex.cs`, `strings.ts` | None (need to create) |

### Key insight

The tool scripts (`parse-utils.js`, `compaction.js`, `dep-graph.js`, `symbols.js`) contain **all the testable pure logic** but export almost nothing. Only `parse-utils.js` exports its functions. The other three scripts are CLI-only with no exported API.

**Consequence:** Unit tests for compaction/dep-graph/symbols must either:
1. Run the CLI and assert on file output (current approach), or
2. Refactor scripts to export their functions (future improvement)

The tests below use approach (1) for all tools and approach (direct import) for `parse-utils.js`.

---

## Test Files

| File | Type | What it tests |
|------|------|---------------|
| `test-parse-utils.js` | Unit | All 6 exported functions from parse-utils.js |
| `test-compaction-cli.js` | Integration | compaction.js CLI on test fixtures |
| `test-depgraph-cli.js` | Integration | dep-graph.js CLI on test fixtures |
| `test-symbols-cli.js` | Integration | symbols.js CLI on test fixtures |
| `test-hooks.sh` | Integration | classify.sh, guard-explore.sh, maintain.sh |

---

## Gaps & Recommendations

1. **No exported API** — compaction.js, dep-graph.js, symbols.js don't export functions, limiting unit test granularity
2. **No Python test fixture** — only TS and C# fixtures exist
3. **No hook test harness** — hooks run in Claude Code context, hard to test in isolation
4. **No CI pipeline** — tests are manual-run only
5. **Edge cases not covered** — mixed-language projects, very large files, malformed syntax

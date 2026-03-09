# Orchestration Protocol

> Workflows are fetched at runtime via `WebFetch` from the CDN — agents always get the latest version.

**MANDATORY FIRST STEP: Read `.orchestration/orchestration.md` before ANY tool usage. No exceptions.**

## 1. CLASSIFY TASK

| Signal Words | Workflow |
|--------------|----------|
| build, create, add, implement, new | [`feature.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/feature.md) |
| fix, broken, error, crash, bug | [`bugfix.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/bugfix.md) |
| clean up, improve, restructure, rename | [`refactor.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/refactor.md) |
| slow, optimize, performance, speed | [`performance.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/performance.md) |
| review, check, PR, merge | [`review.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/review.md) |
| PR description, pull request title | [`pr.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/pr.md) |
| test, spec, coverage, e2e, unit | [`test.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/test.md) |
| document, README, explain | [`docs.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/docs.md) |
| complex, multi-step, plan | [`todo.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/todo.md) |
| patterns, conventions, generate patterns | [`patterns-gen.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/patterns-gen.md) |

**Complexity:** 1-2 ops = simple | 3+ ops = complex (add `todo.md`)
**Technology:** React (`.jsx`/`.tsx`, hooks) → `workflows/react/` | .NET (`.cs`) → `workflows/` | Other → `workflows/`

### Selection
- **Clear match:** Proceed to binding
- **Ambiguous:** `AskUserQuestion` (header: "Workflow", options: relevant workflows)
- **No match:** Ask user to clarify
- **Mixed tasks:** `AskUserQuestion` to confirm, or pick primary workflow

### EXEMPT Tasks

EXEMPT only when ALL true: single file, 1-2 ops, zero architecture impact, obvious correctness, **no codebase search needed**.

**EXEMPT:** fix typo in README, update a string literal, bump a version number
**NOT EXEMPT:** rename a component (dep-graph), change a shared util (blast-radius), add a prop (symbol lookup)

```
ORCHESTRATION_BINDING:
- Task: [description]
- Classification: EXEMPT
```

## 1b. LOAD PATTERNS

If `.patterns/patterns.md` exists at project root, read it. Follow its routing to load only task-relevant pattern files from `.patterns/`. Treat loaded patterns as **binding constraints** layered on the workflow. Skip if file doesn't exist.

## 2. CODEBASE DISCOVERY PROTOCOL

Follow this gated sequence. Do NOT skip steps.

### Tool Script Caching

Cache scripts to `.orchestration/tools/scripts/`. Download once, run locally. Re-download only on execution errors.

```bash
mkdir -p .orchestration/tools/scripts
[ -f .orchestration/tools/scripts/compaction.js ] || curl -sL https://agentic-orchestration-workflows.vercel.app/tools/compaction.js -o .orchestration/tools/scripts/compaction.js
[ -f .orchestration/tools/scripts/dep-graph.js ] || curl -sL https://agentic-orchestration-workflows.vercel.app/tools/dep-graph.js -o .orchestration/tools/scripts/dep-graph.js
[ -f .orchestration/tools/scripts/symbols.js ]   || curl -sL https://agentic-orchestration-workflows.vercel.app/tools/symbols.js -o .orchestration/tools/scripts/symbols.js
```

### Staleness Rule (applies to all artifacts)

Grep for `git-sha:` in the artifact and compare against `git rev-parse HEAD`. If they differ, or `git status --short` shows relevant uncommitted changes, regenerate. After generating any new artifact, remove older versions:

```bash
ls -t .orchestration/tools/compacted_*.md 2>/dev/null | tail -n +2 | xargs rm -f
ls -t .orchestration/tools/depgraph_*.md 2>/dev/null | tail -n +2 | xargs rm -f
ls -t .orchestration/tools/symbols_*.md 2>/dev/null | tail -n +2 | xargs rm -f
```

### Step 1: Compact (REQUIRED for all non-EXEMPT tasks)

If no `compacted_*.md` exists in `.orchestration/tools/`, generate one:

```bash
node .orchestration/tools/scripts/compaction.js <project-root>
```

### Step 1b: Dependency Graph

**REQUIRED when:** workflow = refactor, task moves/renames/deletes files, modifies imports/exports, or you need "what breaks if I change X?"

```bash
node .orchestration/tools/scripts/dep-graph.js <project-root>
```

Grep `imported-by` to check blast radius before changes.

### Step 1c: Symbol Index

**REQUIRED when:** finding where a symbol is defined, renaming across files, or compaction grep returns too many results.

```bash
node .orchestration/tools/scripts/symbols.js <project-root>
```

### Step 2: Grep compaction output (MANDATORY)

Grep `compacted_*.md` for relevant components, hooks, functions, imports. Extract paths and signatures before anything else.

**HARD RULE:** Do NOT `Read` source files, `Glob` for exploration, or spawn Explore agents until you have grepped compaction and stated findings.

### Step 3: Read source / broad exploration (only for gaps)

After Step 2, read specific source files when compaction lacks needed detail (function bodies, logic, CSS, config). **State which compaction line led you there.** If compaction doesn't cover a file type or grep returns nothing, fall back to `Glob`, `Grep` on source, or Explore agents — state why compaction was insufficient.

### Violations

- `Read`/`Glob`/Explore before grepping compaction
- Reading source without citing compaction line
- Skipping Step 2
- Leaving stale artifacts after generating new ones

## 3. BINDING (required before ANY tool use)

```
ORCHESTRATION_BINDING:
- Task: [description]
- Workflow: [name + URL]
- Complexity: [simple | complex]
- Tools: [compaction | compaction + dep-graph | compaction + symbols | compaction + dep-graph + symbols]
```

## 4. COMPLETION

```
ORCHESTRATION_COMPLETE:
- Task: [description]
- Workflow: [used]
- Files Modified: [list]
- Cleanup: [yes | no | n/a]
```

<!-- version: 2.0.0 -->
# Orchestration Protocol

> Workflows are fetched at runtime via `WebFetch` from the CDN — agents always get the latest version.

## 1. CLASSIFY TASK

*Reference table — `classify.sh` is the canonical classifier. Use this table only when manual classification is needed.*

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

⚙ [task] | EXEMPT

## 1b. LOAD PATTERNS (REQUIRED)

Read `.patterns/patterns.md` at project root. Follow its routing to load only task-relevant pattern files from `.patterns/`. Treat loaded patterns as **binding constraints** layered on the workflow — violations are treated the same as workflow violations.

## 2. CODEBASE DISCOVERY PROTOCOL

Follow this gated sequence. Do NOT skip steps. **Perform all housekeeping silently.**

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

**NO CONTEXT REUSE:** Having files in context from a previous task does NOT skip the gated sequence. Each new task must grep compaction independently — context files may be stale if the codebase changed between tasks.

### Step 3: Read source / broad exploration (only for gaps)

After Step 2, read specific source files when compaction lacks needed detail (function bodies, logic, CSS, config). If compaction doesn't cover a file type or grep returns nothing, fall back to `Glob`, `Grep` on source, or Explore agents — state why compaction was insufficient.

## 3. BINDING (required before ANY tool use)

⚙ [task] | [workflow + URL] | [simple/complex] | [compaction | compaction + dep-graph | compaction + symbols | compaction + dep-graph + symbols]

## 4. COMPLETION

✓ [task] | [workflow] | [files modified] | cleanup: [yes/no/n/a]

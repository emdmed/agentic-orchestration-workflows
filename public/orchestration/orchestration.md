# Orchestration Protocol

> **Note:** Workflows are fetched at runtime from the CDN using `WebFetch`, so agents always get the latest version.

**MANDATORY FIRST STEP: Read and follow `.orchestration/orchestration.md` before ANY tool usage. No exceptions.**

## 1. CLASSIFY TASK

| Signal Words | Workflow |
|--------------|----------|
| build, create, add, implement, new | [`feature.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/feature.md) |
| fix, broken, error, crash, bug | [`bugfix.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/bugfix.md) |
| clean up, improve, restructure, rename | [`refactor.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/refactor.md) |
| slow, optimize, performance, speed | [`performance.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/performance.md) |
| review, check, PR, merge | [`review.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/review.md) |
| PR description, pull request title | [`pr.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/pr.md) |
| document, README, explain | [`docs.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/react/docs.md) |
| complex, multi-step, plan | [`todo.md`](https://agentic-orchestration-workflows.vercel.app/orchestration/workflows/todo.md) |

**Complexity:** 1-2 ops = simple | 3+ ops = complex (add `todo.md`)
**Technology:** React (`.jsx`/`.tsx`, hooks) → `workflows/react/` | Other → `workflows/`

### Selection
- **Clear match:** Proceed to binding
- **Ambiguous:** Use `AskUserQuestion` (header: "Workflow", options: relevant workflows)
- **No match:** Ask user to clarify

## 2. CODEBASE DISCOVERY PROTOCOL

Before exploring or modifying any codebase, agents MUST follow this gated discovery sequence. **Each step is a gate — you may NOT proceed to the next until the current step is exhausted.**

### Step 1: Compact

If no `compacted_*.md` exists in `.orchestration/tools/`, generate one:

```bash
curl -sL https://agentic-orchestration-workflows.vercel.app/tools/compaction.js -o /tmp/compaction.js && node /tmp/compaction.js <project-root>
```

If a `.orchestration/tools/compacted_*.md` already exists, grep for `git-sha:` in it and compare against `git rev-parse HEAD`. If they match, use it directly. If not, regenerate.

### Step 1b: Dependency Graph (optional, recommended for refactors)

If the task involves modifying imports, moving files, or understanding blast radius, generate a dependency graph:

```bash
curl -sL https://agentic-orchestration-workflows.vercel.app/tools/dep-graph.js -o /tmp/dep-graph.js && node /tmp/dep-graph.js <project-root>
```

If a `.orchestration/tools/depgraph_*.md` already exists, grep for `git-sha:` in it and compare against `git rev-parse HEAD`. If they match, use it directly. If not, regenerate. Grep for `imported-by` to check blast radius before making changes.

### Step 1c: Symbol Index (optional, recommended for large codebases)

For fast "where is X defined?" lookups without grepping the full compaction output:

```bash
curl -sL https://agentic-orchestration-workflows.vercel.app/tools/symbols.js -o /tmp/symbols.js && node /tmp/symbols.js <project-root>
```

If a `.orchestration/tools/symbols_*.md` already exists, grep for `git-sha:` in it and compare against `git rev-parse HEAD`. If they match, use it directly. If not, regenerate. Grep for symbol names to find definitions, files, and line numbers.

### Step 2: Search the compaction output (MANDATORY)

Use `Grep` on the `.orchestration/tools/compacted_*.md` file to find the components, hooks, functions, imports, and files relevant to your task. **This is your primary discovery tool.** Extract file paths, function signatures, props, and state shapes from the compaction before doing anything else.

**HARD RULE:** Do NOT use `Read` on any source file, `Glob` for exploration, or spawn Explore agents until you have first grepped the compaction output and stated what you found.

### Step 3: Read source files (only for gaps)

Only after Step 2, read specific source files when you need details the compaction doesn't provide (function bodies, exact logic, CSS, config). **Before each `Read`, state which compaction line led you to that file and what specific detail you need.**

### Step 4: Fall back to broad exploration

Only if compaction doesn't cover a file type (e.g., Rust, TOML, CSS) or grep returns no results, use `Glob`, `Grep` on source, or Explore agents. State why compaction was insufficient.

### VIOLATIONS

The following are protocol violations:
- Using `Read` on source files before grepping the compaction output
- Using `Glob` or Explore agents before grepping the compaction output
- Reading source files without stating which compaction line led you there
- Skipping Step 2 entirely

## 3. BINDING (required before ANY tool use)

```
ORCHESTRATION_BINDING:
- Task: [description]
- Workflow: [path]
- Complexity: [simple/complex]
```

## 4. EXEMPT TASKS

Requires ALL: single file, 1-2 ops, zero architecture impact, obvious correctness, **no codebase search needed**.

```
ORCHESTRATION_BINDING:
- Task: [description]
- Classification: EXEMPT
```

## 5. COMPLETION

```
ORCHESTRATION_COMPLETE:
- Task: [description]
- Workflow: [used]
- Files: [modified]
```

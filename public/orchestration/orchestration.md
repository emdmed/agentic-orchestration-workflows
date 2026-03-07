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
- **Mixed tasks** spanning multiple workflows: Use `AskUserQuestion` to confirm, or pick the primary workflow

### EXEMPT Tasks

A task is EXEMPT only when ALL of these are true: single file, 1-2 ops, zero architecture impact, obvious correctness, **no codebase search needed**.

**EXEMPT examples:** fix typo in README, update a string literal, bump a version number
**NOT EXEMPT:** rename a component (needs dep-graph), change a shared util (needs blast-radius check), add a prop (needs symbol lookup)

```
ORCHESTRATION_BINDING:
- Task: [description]
- Classification: EXEMPT
```

## 1b. LOAD PATTERNS

Check for `.patterns/patterns.md` at the project root. If it exists, read it. This file contains routing instructions that point to other pattern files inside `.patterns/` — small custom instructions users create for recurring conventions (API endpoints, auth handling, styling, naming, etc.).

Follow the routing in `patterns.md` to load only the patterns relevant to the current task. Treat loaded patterns as **binding constraints** — they layer on top of the selected workflow without replacing it.

If `.patterns/patterns.md` does not exist, skip this step.

## 2. CODEBASE DISCOVERY PROTOCOL

Before exploring or modifying any codebase, agents MUST follow this gated discovery sequence. **Each step is a gate — you may NOT proceed to the next until the current step is exhausted.**

### Tool Script Caching

Cache tool scripts locally to `.orchestration/tools/scripts/` to avoid re-downloading every run. Download once, run from local path. Re-download only on execution errors.

```bash
mkdir -p .orchestration/tools/scripts
# Download only if not cached
[ -f .orchestration/tools/scripts/compaction.js ] || curl -sL https://agentic-orchestration-workflows.vercel.app/tools/compaction.js -o .orchestration/tools/scripts/compaction.js
[ -f .orchestration/tools/scripts/dep-graph.js ] || curl -sL https://agentic-orchestration-workflows.vercel.app/tools/dep-graph.js -o .orchestration/tools/scripts/dep-graph.js
[ -f .orchestration/tools/scripts/symbols.js ]   || curl -sL https://agentic-orchestration-workflows.vercel.app/tools/symbols.js -o .orchestration/tools/scripts/symbols.js
```

If a cached script fails with an execution error, delete it and re-download.

### Step 1: Compact (REQUIRED for all non-EXEMPT tasks)

If no `compacted_*.md` exists in `.orchestration/tools/`, generate one:

```bash
node .orchestration/tools/scripts/compaction.js <project-root>
```

**Staleness check:** If a `compacted_*.md` already exists:
1. Grep for `git-sha:` and compare against `git rev-parse HEAD`. If they differ, regenerate.
2. Run `git status --short` — if tracked files with uncommitted changes are relevant to the task, regenerate.

### Step 1b: Dependency Graph

**REQUIRED when:**
- Workflow = refactor
- Task involves moving, renaming, or deleting files
- Task modifies import/export statements
- You need to answer "what breaks if I change X?"

```bash
node .orchestration/tools/scripts/dep-graph.js <project-root>
```

Staleness check: same git-sha + `git status --short` rules as compaction. Grep for `imported-by` to check blast radius before making changes.

### Step 1c: Symbol Index

**REQUIRED when:**
- Task requires finding where a specific symbol is defined
- Task involves renaming a symbol across files
- Compaction grep returns too many results to scan efficiently

```bash
node .orchestration/tools/scripts/symbols.js <project-root>
```

Staleness check: same git-sha + `git status --short` rules as compaction. Grep for symbol names to find definitions, files, and line numbers.

### Artifact Cleanup

After generating any new artifact, remove older versions of the same type:

```bash
ls -t .orchestration/tools/compacted_*.md 2>/dev/null | tail -n +2 | xargs rm -f
ls -t .orchestration/tools/depgraph_*.md 2>/dev/null | tail -n +2 | xargs rm -f
ls -t .orchestration/tools/symbols_*.md 2>/dev/null | tail -n +2 | xargs rm -f
```

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
- Leaving stale timestamped files after generating new ones

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

## 5. MAINTENANCE

Periodic cleanup for `.orchestration/tools/`:

```bash
# Remove all stale artifacts (keep only the latest of each type)
for prefix in compacted depgraph symbols; do
  ls -t .orchestration/tools/${prefix}_*.md 2>/dev/null | tail -n +2 | xargs rm -f
done

# Re-download tool scripts (e.g., after upstream updates)
rm -f .orchestration/tools/scripts/*.js
# Scripts will be re-cached on next run via the caching step in Section 2
```

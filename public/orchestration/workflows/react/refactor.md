# React Refactor Workflow

## 1. Safety Net

- Run tests | add if coverage insufficient
- Answer: What improvement? How verify unchanged behavior?

## 1b. Dependency Graph (optional, recommended for refactors)

If the task involves modifying imports, moving files, or understanding blast radius, generate a dependency graph:

```bash
curl -sL https://agentic-orchestration-workflows.vercel.app/tools/dep-graph.js -o /tmp/dep-graph.js && node /tmp/dep-graph.js <project-root>
```

If a `depgraph_*.md` already exists, use it directly. Grep for `imported-by` to check blast radius before making changes.

## 2. Plan

- Map imports/dependencies | identify all callers
- Break into small, safe steps

## 3. Execute

One change type at a time | run tests after each:

| Change Types |
|--------------|
| Rename files to match folders |
| Barrel → direct imports |
| Extract logic into hooks |
| Split large components |

## 4. Validate

- All tests pass | no `index.ts`/`index.tsx`
- Entry points match folder names

## Constraints

- Structure only, NOT behavior | NO bug fixes
- One change type at a time | note issues separately

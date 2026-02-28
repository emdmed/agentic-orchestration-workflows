# Orchestration Protocol

**MANDATORY: Process BEFORE any tool usage.**

## 1. CLASSIFY TASK

| Signal Words | Workflow |
|--------------|----------|
| build, create, add, implement, new | `feature.md` |
| fix, broken, error, crash, bug | `bugfix.md` |
| clean up, improve, restructure, rename | `refactor.md` |
| slow, optimize, performance, speed | `performance.md` |
| review, check, PR, merge | `review.md` |
| PR description, pull request title | `pr.md` |
| document, README, explain | `docs.md` |
| complex, multi-step, plan | `todo.md` |

**Complexity:** 1-2 ops = simple | 3+ ops = complex (add `todo.md`)
**Technology:** React (`.jsx`/`.tsx`, hooks) → `workflows/react/` | Other → `workflows/`

### Selection
- **Clear match:** Proceed to binding
- **Ambiguous:** Use `AskUserQuestion` (header: "Workflow", options: relevant workflows)
- **No match:** Ask user to clarify

## 2. BINDING (required before ANY tool use)

```
ORCHESTRATION_BINDING:
- Task: [description]
- Workflow: [path]
- Complexity: [simple/complex]
```

## 3. EXEMPT TASKS

Requires ALL: single file, 1-2 ops, zero architecture impact, obvious correctness.

```
ORCHESTRATION_BINDING:
- Task: [description]
- Classification: EXEMPT
```

## 4. COMPLETION

```
ORCHESTRATION_COMPLETE:
- Task: [description]
- Workflow: [used]
- Files: [modified]
```

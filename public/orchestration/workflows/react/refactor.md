# React Refactor Workflow

## 1. Safety Net

- Run tests | add if coverage insufficient
- Answer: What improvement? How verify unchanged behavior?

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

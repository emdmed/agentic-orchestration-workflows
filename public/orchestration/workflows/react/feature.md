# React Feature Workflow

## 1. Architecture

**IF not specified:** Use `AskUserQuestion` (header: "Architecture")

| Architecture | Structure |
|--------------|-----------|
| Feature-driven | `features/{name}/components\|hooks\|utils/` |
| Flat feature-driven | `features/{name}/` flat files |
| Atomic design | `atoms\|molecules\|organisms\|templates/` |

**IF project has patterns:** Follow existing, skip question.

## 2. Context

- Read related code, identify target folder
- Check similar implementations, reusable hooks/utils
- Answer: What problem? Minimal version? Which folder?

## 3. Implement

**Components:** Function only | `useState`/`useReducer` for local state
**Hooks:** Extract logic | `hooks/{feature}/{name}.ts` | descriptive names
**State:** Lift only as needed | composition over prop drilling

## 4. Validate

- Run tests for regressions
- Add tests for new code
- Test loading/error states
- Remove debug code

## Constraints

- NO `index.ts`/`index.tsx` | import from file directly
- Match existing style | no extra features

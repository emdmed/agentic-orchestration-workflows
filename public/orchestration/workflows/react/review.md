# React Code Review Workflow

## 1. Understand

- Read PR description | review diff scope
- Answer: What is the goal? What files changed?

## 2. Architecture Checklist

| Check | Rule |
|-------|------|
| Barrels | No `index.ts`/`index.tsx` |
| Entry files | Match folder names (`Button/Button.tsx`) |
| Imports | Direct, not barrel |
| Colocation | Component + hooks + types + tests together |
| Placement | Correct feature folder |

## 3. React Patterns Checklist

| Check | Rule |
|-------|------|
| Components | Function only, no class |
| Hooks | No conditionals, proper deps |
| Effects | Cleanup where needed |
| Memory | No leaks (subscriptions, timers) |
| States | Loading + error handled |

## 4. Code Quality Checklist

| Check | Rule |
|-------|------|
| Debug | No console.log/debugger |
| Imports | No unused |
| Types | No unjustified `any` |
| Tests | Cover new functionality |
| Scope | No unrelated changes |

## 5. Feedback

- **Blocking:** Must fix (bugs, architecture violations)
- **Suggestion:** Improvements | **Question:** Clarification

## Constraints

- NO approval with violations | must understand code
- Specific + actionable | suggest fixes, not just problems

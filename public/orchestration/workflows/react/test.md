# React Test Workflow

> Requires: [Playwright MCP server](https://github.com/anthropics/claude-code/blob/main/.mcp.json) configured in project.

## 1. Scope

**IF not specified:** Use `AskUserQuestion` (header: "Test scope")

| Scope | Signal |
|-------|--------|
| Unit test | single function, hook, or util |
| Component test | render, props, user interaction |
| E2E test | full user flow, navigation, multi-page |

- Check existing tests: `Glob` for `**/*.test.*`, `**/*.spec.*`, `**/e2e/**`
- Identify conventions: test runner, file naming, folder structure
- Answer: What behavior to test? What's already covered?

## 2. Discover

- Grep compaction for the target component/function
- Read source for logic branches, edge cases, error states
- Identify dependencies to mock vs real

## 3. Write Tests

**Unit/Component tests:** Follow project's existing runner (Jest, Vitest, etc.)
- Test behavior, not implementation
- Cover: happy path, edge cases, error states, loading states
- Mock external dependencies, not internal modules

**E2E tests with Playwright MCP:**

Use the Playwright MCP tools — do NOT install Playwright or write test files directly unless the user asks for persistent test scripts.

| MCP Tool | Use for |
|----------|---------|
| `browser_navigate` | Go to the page under test |
| `browser_click` | Interact with elements |
| `browser_type` | Fill inputs |
| `browser_snapshot` | Assert page state — get accessibility tree |
| `browser_take_screenshot` | Visual verification |
| `browser_wait_for_text` | Wait for async content |

**E2E flow:**
1. `browser_navigate` to target page
2. `browser_snapshot` to get initial state
3. Perform actions (`browser_click`, `browser_type`)
4. `browser_snapshot` or `browser_wait_for_text` to assert result
5. `browser_take_screenshot` for visual confirmation if needed

## 4. Verify

- Run unit/component tests, confirm passing
- For E2E: replay the MCP flow, confirm assertions hold
- Check no unrelated tests broke

## Constraints

- Match existing test conventions | don't introduce new test frameworks
- E2E via Playwright MCP by default | persistent test files only on request
- NO testing implementation details (internal state, private methods)
- Test names describe behavior: `"shows error when form submitted empty"`

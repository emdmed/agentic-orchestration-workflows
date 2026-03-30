# QA Workflow

> Requires: [agent-browser](https://github.com/vercel-labs/agent-browser) CLI installed (`npm install -g agent-browser && agent-browser install`).

## 1. Scope

**IF not specified:** Use `AskUserQuestion` (header: "QA scope")

| Scope | Signal |
|-------|--------|
| Smoke test | critical paths, login, navigation, key actions |
| Functional QA | specific feature, form validation, CRUD flow |
| Visual QA | layout, responsive, dark mode, element alignment |
| Regression suite | after deploy, post-refactor, full flow coverage |

- Answer: What pages/flows to test? What constitutes pass/fail?

## 2. Setup

- Verify agent-browser is available: `agent-browser --version`
- If missing: `npm install -g agent-browser && agent-browser install`
- Ensure the app is running (dev server or deployed URL)
- Open the target URL: `agent-browser open <url>`

## 3. Execute QA

**Snapshot-first approach** — always snapshot before interacting to get the accessibility tree with `@e` refs.

### Core loop

1. **Observe:** `agent-browser snapshot` — get accessibility tree with `@eN` refs
2. **Interact:** Use refs from snapshot
   - `agent-browser click @eN` — click elements
   - `agent-browser fill @eN "text"` — clear and fill inputs
   - `agent-browser select @eN "value"` — select dropdown options
   - `agent-browser check @eN` / `agent-browser uncheck @eN` — checkboxes
   - `agent-browser press Enter` — submit forms
3. **Wait:** Let async content settle
   - `agent-browser wait --text "Success"` — wait for text to appear
   - `agent-browser wait --url "**/dashboard"` — wait for navigation
   - `agent-browser wait .selector` — wait for element visibility
   - `agent-browser wait --load networkidle` — wait for network idle
4. **Assert:** Verify expected state
   - `agent-browser snapshot` — re-check accessibility tree
   - `agent-browser get text @eN` — extract text content
   - `agent-browser get value @eN` — get input values
   - `agent-browser get url` — verify current URL
   - `agent-browser get count ".item"` — count elements
   - `agent-browser is visible @eN` — check visibility
5. **Evidence:** Capture proof
   - `agent-browser screenshot ./evidence/step-name.png` — capture page
   - `agent-browser screenshot ./evidence/step-name.png --annotate` — with labeled elements
   - `agent-browser screenshot ./evidence/step-name.png --full` — full page

### Semantic locators (prefer over CSS selectors)

Use `find` for human-readable element targeting:

- `agent-browser find role button click --name "Submit"` — click button by accessible name
- `agent-browser find label "Email" fill "user@example.com"` — fill by label
- `agent-browser find text "Sign in" click` — click by visible text
- `agent-browser find placeholder "Search..." fill "query"` — fill by placeholder

### Network validation

- `agent-browser network har start` — begin recording network traffic
- `agent-browser network requests --filter api --method POST` — inspect API calls
- `agent-browser network requests --status 4xx` — check for errors
- `agent-browser network route "**/api/slow" --body '{"fast":true}'` — mock responses
- `agent-browser network har stop ./evidence/network.har` — save HAR file

### Multi-step flows (batch mode)

For repeatable multi-step sequences:

```bash
echo '[
  ["open", "https://app.example.com/login"],
  ["fill", "@e3", "user@test.com"],
  ["fill", "@e5", "password123"],
  ["click", "@e7"],
  ["wait", "--url", "**/dashboard"],
  ["snapshot"]
]' | agent-browser batch --json
```

### Device emulation

- `agent-browser set viewport 375 812` — mobile viewport
- `agent-browser set device "iPhone 14"` — device preset
- `agent-browser set media dark` — dark mode

## 4. Verify

- Confirm all QA checks passed (expected text, URLs, element states)
- Review captured screenshots for visual correctness
- Check network HAR for failed requests or unexpected API calls
- Report: list each check with pass/fail and evidence path

## Constraints

- Use `agent-browser` CLI only | do NOT use Playwright MCP or write test files
- Snapshot-first: always `snapshot` before interacting with a page
- Semantic locators (`find role/text/label`) preferred over CSS selectors
- Capture evidence (screenshots) for every significant assertion
- Do NOT hard-code `@eN` refs across steps — refs change after page mutations, re-snapshot first

# Patterns Generator Workflow

Analyzes a codebase and generates `.patterns/patterns.md` plus individual pattern files.

## 1. Scan

Run compaction (Step 1 of Discovery Protocol). Then grep compaction for recurring conventions:

| Convention | What to look for |
|------------|-----------------|
| Naming | File naming (`camelCase`, `kebab-case`, `PascalCase`), export naming |
| File structure | Folder organization, co-location rules, barrel exports or lack of |
| API layer | Fetch wrappers, endpoint patterns, error handling shape |
| State management | Store patterns, context usage, hook conventions |
| Styling | CSS modules, Tailwind, styled-components, naming conventions |
| Auth | Auth guards, token handling, protected route patterns |
| Types | Type file locations, naming (`I` prefix, `T` prefix, `Props` suffix) |
| Testing | Test file location, naming, runner, assertion style |

## 2. Confirm

Present discovered patterns via `AskUserQuestion` (header: "Patterns", multiSelect: true):
- List each detected pattern as an option with a short description
- User selects which to keep
- Ask if any conventions are missing

## 3. Generate

Create `.patterns/` directory with:

**`.patterns/patterns.md`** — Router file. Maps task types to pattern files:

```markdown
# Project Patterns

| When task involves | Load |
|-------------------|------|
| API calls, data fetching | `api.md` |
| New components | `components.md` |
| Styling | `styling.md` |
| State management | `state.md` |
| Tests | `testing.md` |
```

**`.patterns/{name}.md`** — One file per convention group. Keep each concise (under 30 lines). Format:

```markdown
# {Convention Name}

## Rules
- [concrete rule with example]
- [concrete rule with example]

## Examples
`path/to/real/file.ts` — [why this is the reference]
```

## 4. Verify

- Confirm `.patterns/patterns.md` routes to all generated files
- Confirm each pattern file references real files from the codebase
- No orphan pattern files (every file must be routed)

## Constraints

- Only document patterns that **actually exist** in the codebase — never invent aspirational rules
- Reference real file paths from compaction as examples
- Keep pattern files concise — rules, not explanations
- If `.patterns/` already exists, update in place; don't overwrite user edits without confirming

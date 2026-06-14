# Orchestration hooks

Canonical source for the four Claude Code hook scripts that drive the
orchestration protocol. These are the files of record — lint, test, and edit
them here.

| Hook | Event | Purpose |
|------|-------|---------|
| `classify.sh` | `UserPromptSubmit` | Classify the task, inject protocol/workflow/patterns, detect EXEMPT |
| `maintain.sh` | `SessionStart` | Pull protocol/tool updates from the CDN, clear stale artifacts |
| `guard-explore.sh` | `PreToolUse` | Gate source access until compaction has been grepped |
| `rehydrate.sh` | (utility) | Re-inject the protocol after context compaction (not a registerable event) |

## Install

End users don't copy these files directly — they run the installer, which writes
the hooks to `~/.claude/hooks/` and registers them in `~/.claude/settings.json`:

```
claude -p "$(curl -sL https://agentic-orchestration-workflows.vercel.app/orchestration/orchestration_hook_install.md)"
```

## Keeping the install doc in sync

`public/orchestration/orchestration_hook_install.md` embeds these scripts as
fenced code blocks so the installer is a single self-contained document. That
copy is **generated** from the files here:

```
npm run hooks:sync     # regenerate the doc's code blocks from hooks/*.sh
npm run hooks:check     # verify the doc matches hooks/*.sh (run in CI)
```

After editing any hook, run `npm run hooks:sync` before committing. The test
suite runs `hooks:check`, so drift fails CI.

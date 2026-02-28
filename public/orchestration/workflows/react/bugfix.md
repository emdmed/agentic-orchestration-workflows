# React Bugfix Workflow

## 1. Reproduce

- Confirm bug exists | find minimal repro
- Check Strict Mode behavior
- Answer: Expected vs actual? React 18 concurrent issue?

## 2. Locate Root Cause

| Common React 18 Issues |
|------------------------|
| Effects missing cleanup |
| Stale closures in effects |
| Concurrent rendering race conditions |
| Automatic batching changes |

## 3. Fix

- Keep changes within affected feature folder
- Add cleanup: `return () => controller.abort()`
- Fix stale closures with proper deps

## 4. Verify

- Confirm fix | test with Strict Mode
- Add regression test

## Constraints

- Smallest fix only | NO refactoring
- NO barrel exports | note other issues separately

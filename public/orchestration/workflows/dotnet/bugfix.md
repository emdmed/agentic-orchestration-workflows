# .NET Bugfix Workflow

## 1. Reproduce

- Confirm bug exists | find minimal repro
- Check logs, stack traces, HTTP status codes
- Answer: Expected vs actual? Environment-specific?

## 2. Locate Root Cause

| Common .NET Issues |
|-------------------|
| `async void` swallowing exceptions |
| Deadlocks from `.Result`/`.Wait()` on async code |
| DI lifetime mismatch (scoped in singleton) |
| EF Core tracking issues (detached entities, concurrent DbContext) |
| Null reference from missing null checks or nullable misuse |
| Disposed `HttpClient` / `DbContext` from wrong lifetime |
| Missing `CancellationToken` causing slow shutdowns |
| Race conditions in shared mutable state |

## 3. Fix

- Keep changes within affected layer/project
- Fix async: replace `.Result`/`.Wait()` with `await`
- Fix DI: correct lifetime registration
- Fix EF: add `AsNoTracking()`, fix detached entity handling
- Fix nulls: use nullable annotations, guard clauses

## 4. Verify

- Confirm fix | run affected tests
- Add regression test
- Verify no DI runtime errors (app starts cleanly)

## Constraints

- Smallest fix only | NO refactoring
- Note other issues separately | stay in scope

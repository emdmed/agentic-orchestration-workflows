# .NET Code Review Workflow

## 1. Understand

- Read PR description | review diff scope
- Answer: What is the goal? What files changed?

## 2. Architecture Checklist

| Check | Rule |
|-------|------|
| Layer deps | Dependency flows inward (Domain has no outward refs) |
| DI | Constructor injection, no `IServiceProvider` / service locator |
| Lifetimes | Scoped not captured in singleton, DbContext is scoped |
| Interfaces | External dependencies behind interfaces |
| Placement | Class in correct project/layer |
| Namespaces | Match folder structure |

## 3. .NET Patterns Checklist

| Check | Rule |
|-------|------|
| Async | `async Task` / `async Task<T>`, no `async void` |
| Cancellation | `CancellationToken` propagated through async chain |
| Blocking | No `.Result`, `.Wait()`, `.GetAwaiter().GetResult()` |
| EF Core | `AsNoTracking` for reads, `Include` where needed, no N+1 |
| Nullability | Nullable annotations enabled, no suppression (`!`) without reason |
| Disposal | `IDisposable`/`IAsyncDisposable` implemented where needed |
| Exceptions | No catch-all without rethrow, no exceptions for control flow |

## 4. Code Quality Checklist

| Check | Rule |
|-------|------|
| Debug | No `Console.WriteLine` / `Debug.WriteLine` in production code |
| Usings | No unused |
| Types | No unjustified `dynamic` or `object` |
| Tests | Cover new functionality |
| Scope | No unrelated changes |
| Secrets | No hardcoded connection strings, keys, or passwords |

## 5. Feedback

- **Blocking:** Must fix (bugs, architecture violations, security)
- **Suggestion:** Improvements | **Question:** Clarification

## Constraints

- NO approval with violations | must understand code
- Specific + actionable | suggest fixes, not just problems

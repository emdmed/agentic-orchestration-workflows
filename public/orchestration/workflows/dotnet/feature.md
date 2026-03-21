# .NET Feature Workflow

## 1. Architecture

**IF not specified:** Use `AskUserQuestion` (header: "Architecture")

| Architecture | Structure |
|--------------|-----------|
| Clean Architecture | `Domain/` `Application/` `Infrastructure/` `WebApi/` |
| Vertical Slice | `Features/{Name}/Command.cs\|Query.cs\|Handler.cs\|Endpoint.cs` |
| N-Layer | `Controllers/` `Services/` `Repositories/` `Models/` |

**IF project has patterns:** Follow existing, skip question.

## 2. Context

- Read related code, identify target project/namespace
- Check existing interfaces, DI registrations, shared services
- Answer: What problem? Minimal version? Which project/layer?

## 3. Implement

**Classes:** One class per file | file name matches class name
**Interfaces:** Extract for external dependencies | register in DI
**Async:** `async Task`/`async Task<T>` with `CancellationToken` propagation
**DI:** Constructor injection | avoid `IServiceProvider` directly | register in `Program.cs` or extension method

| Layer | Allowed Dependencies |
|-------|---------------------|
| Domain | None (pure C#, no framework refs) |
| Application | Domain only |
| Infrastructure | Domain, Application |
| API/Presentation | Application (never Domain directly for Clean Arch) |

## 4. Validate

- Run tests for regressions
- Add tests for new code (unit + integration where needed)
- Test error paths and edge cases
- Verify DI registration (app starts without runtime DI errors)

## Constraints

- NO circular project references | dependency flows inward
- Match existing style | no extra features
- NO `static` service classes | use DI
- NO `async void` except event handlers

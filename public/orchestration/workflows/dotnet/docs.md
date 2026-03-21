# .NET Documentation Workflow

> Document architecture correctly. See orchestration.md for patterns.

## Before Writing

MUST answer:
- Who is the audience?
- What should they be able to do after reading?
- What existing docs need to stay in sync?

## Process

### 1. Understand the Subject
- Read the code being documented
- Trace the DI registration and usage chain
- Identify non-obvious behavior or gotchas

### 2. Check Existing Docs
- Find related documentation (README, XML docs, wiki)
- Identify what's missing or outdated
- Note the existing style and format

### 3. Write

**XML docs** for public APIs:
```csharp
/// <summary>
/// Creates a new order from the given items.
/// </summary>
/// <param name="items">Line items to include. Must not be empty.</param>
/// <param name="ct">Cancellation token.</param>
/// <returns>The created order with a generated ID.</returns>
/// <exception cref="ValidationException">Thrown when items is empty.</exception>
public async Task<Order> CreateAsync(List<OrderItem> items, CancellationToken ct)
```

**README/markdown** for features and setup:

```markdown
# {Name}

Brief description.

## Registration
services.AddScoped<IOrderService, OrderService>();

## Usage
Inject `IOrderService` via constructor. Call methods with `CancellationToken`.

## Configuration (if applicable)
| Key | Type | Default | Description |
|-----|------|---------|-------------|

## Related
- Links to related services/interfaces
```

### 4. Validate
- Code examples compile and match actual signatures
- DI registration examples are accurate
- Links are valid

## Constraints

- MUST explain why, not just what
- MUST show DI registration in examples
- MUST update related docs to stay consistent
- XML docs on all public members | skip for obvious properties

# .NET Performance Workflow

> Architecture rules: See orchestration.md. Violations block merge.

## Before Coding

MUST answer:
- What is the specific performance problem?
- How will I measure improvement?
- Is this a real bottleneck or premature optimization?

## Process

### 1. Measure First
- Profile with `dotnet-counters`, `dotnet-trace`, or Visual Studio Profiler
- Check EF Core query performance with logging (`EnableSensitiveDataLogging` in dev)
- Measure response times, memory allocations, GC pressure
- Use BenchmarkDotNet for micro-benchmarks

### 2. Identify Root Cause

**Common issues:**
- N+1 queries (missing `Include()` / projection)
- Loading entire tables instead of filtering at DB level
- Synchronous I/O blocking thread pool threads
- Excessive allocations (string concatenation, LINQ materializing too early)
- Missing response caching or output caching
- DbContext lifetime too long (tracking thousands of entities)

### 3. Optimize

**EF Core queries:**
```csharp
// Project only needed columns
var names = await db.Users
    .Where(u => u.IsActive)
    .Select(u => new { u.Id, u.Name })
    .ToListAsync(ct);

// Use AsNoTracking for read-only queries
var users = await db.Users.AsNoTracking().ToListAsync(ct);

// Eager load to prevent N+1
var orders = await db.Orders.Include(o => o.Items).ToListAsync(ct);
```

**Async / allocations:**
```csharp
// Avoid blocking async — use await
var result = await service.GetAsync(ct);  // not service.GetAsync().Result

// Use StringBuilder for repeated concatenation
// Use ArrayPool<T> / stackalloc for hot-path allocations
// Use IAsyncEnumerable for streaming large result sets
```

**Caching:**
- `IMemoryCache` for per-instance caching
- `IDistributedCache` for multi-instance
- Response caching middleware for HTTP responses

### 4. Verify
- Re-profile to confirm improvement
- Ensure no regressions in functionality
- Document the optimization and why it helped

## Constraints

- NEVER optimize without measuring first
- NEVER add caching everywhere "just in case"
- MUST prove the optimization helps with real measurements
- Keep optimizations minimal and targeted

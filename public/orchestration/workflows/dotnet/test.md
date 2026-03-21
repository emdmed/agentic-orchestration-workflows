# .NET Test Workflow

## 1. Scope

**IF not specified:** Use `AskUserQuestion` (header: "Test scope")

| Scope | Signal |
|-------|--------|
| Unit test | single class, method, or service |
| Integration test | database, HTTP, external service interaction |
| E2E test | full API flow, multi-endpoint scenario |

- Check existing tests: `Glob` for `**/*Tests.cs`, `**/*Test.cs`, `**/*.Tests/**`
- Identify conventions: test framework (xUnit, NUnit, MSTest), naming, folder structure
- Answer: What behavior to test? What's already covered?

## 2. Discover

- Grep compaction for the target class/method
- Read source for logic branches, edge cases, error states
- Identify dependencies to mock vs real

## 3. Write Tests

**Unit tests:** Follow project's existing framework

```csharp
// Arrange-Act-Assert pattern
// Test names describe behavior: MethodName_Scenario_ExpectedResult
[Fact]
public async Task CreateOrder_WithValidItems_ReturnsOrderId()
{
    // Arrange
    var mockRepo = new Mock<IOrderRepository>();
    var service = new OrderService(mockRepo.Object);

    // Act
    var result = await service.CreateAsync(validOrder, CancellationToken.None);

    // Assert
    Assert.NotNull(result);
    mockRepo.Verify(r => r.SaveAsync(It.IsAny<Order>(), It.IsAny<CancellationToken>()), Times.Once);
}
```

**Integration tests:** Use `WebApplicationFactory` for API testing

```csharp
public class OrdersApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public OrdersApiTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetOrders_ReturnsOk()
    {
        var response = await _client.GetAsync("/api/orders");
        response.EnsureSuccessStatusCode();
    }
}
```

**Mocking guidelines:**
- Mock interfaces for external dependencies (repos, HTTP clients, caches)
- Use real implementations for domain logic and value objects
- Use in-memory database for EF Core integration tests when appropriate

## 4. Verify

- Run tests, confirm passing
- Check no unrelated tests broke
- Verify test isolation (no shared mutable state between tests)

## Constraints

- Match existing test conventions | don't introduce new test frameworks
- NO testing implementation details (private methods, internal state)
- Test names describe behavior: `"CreateOrder_WithEmptyCart_ThrowsValidationException"`
- Each test is independent | no ordering dependencies

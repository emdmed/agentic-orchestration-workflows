// Test: stacked attributes, tuple returns, generic constraints, using aliases

using System;
using System.Collections.Generic;
using System.Linq;
using Dto = MyProject.Models.DataTransferObject;
using static System.Math;

namespace MyProject.Services
{
    // Stacked attributes
    [Serializable]
    [Obsolete("Use NewService instead")]
    public abstract class BaseService<TEntity, TKey>
        where TEntity : class, IEntity<TKey>
        where TKey : struct
    {
        // Multi-line attribute
        [Required,
         StringLength(100,
            MinimumLength = 3)]
        public string Name { get; set; }

        // Method with nested generic return type
        public virtual async Task<Dictionary<string, List<TEntity>>> GetGroupedAsync(
            Func<TEntity, string> groupBy,
            CancellationToken cancellationToken = default)
        {
            throw new NotImplementedException();
        }

        // Tuple return type
        public (bool Success, string Message, TEntity Entity) TryCreate(TEntity entity)
        {
            return (true, "ok", entity);
        }

        // Generic method with constraints
        public TResult Transform<TResult, TIntermediate>(
            Func<TEntity, TIntermediate> map,
            Func<TIntermediate, TResult> reduce)
            where TResult : class
            where TIntermediate : struct
        {
            throw new NotImplementedException();
        }

        // Static method with complex return
        public static Dictionary<TKey, List<(string Name, int Count)>> Aggregate(
            IEnumerable<TEntity> entities)
        {
            throw new NotImplementedException();
        }

        // Override + async
        public override async Task<bool> ValidateAsync(TEntity entity)
        {
            return await Task.FromResult(true);
        }
    }

    // Interface with nested generics
    public interface IRepository<TEntity, TKey>
        where TEntity : class
    {
        Task<TEntity> FindByIdAsync(TKey id);
        Task<IReadOnlyList<TEntity>> FindAllAsync();
        Task<Dictionary<TKey, TEntity>> ToDictionaryAsync();
    }

    // Record with primary constructor
    public sealed record ServiceResult<T>(
        bool Success,
        T Value,
        IReadOnlyList<string> Errors);

    // Enum
    public enum ServiceStatus
    {
        Active,
        Inactive,
        Suspended
    }

    // Partial class
    public sealed partial class ConcreteService : BaseService<Dto, Guid>
    {
        // Constant
        public const int MaxRetries = 3;
        public static readonly string DefaultName = "default";
    }
}

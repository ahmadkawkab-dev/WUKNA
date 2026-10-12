namespace Wukna.Features.Subscriptions;

using System.IdentityModel.Tokens.Jwt;
using Microsoft.EntityFrameworkCore;
using Wukna.Shared.Data.AppDbContext;

public sealed record StoragePlanDto(string Id, string Name, long QuotaBytes, bool CheckoutEnabled);
public sealed record StorageCheckoutResult(string Code, string? CheckoutUrl);

// Provider integration stays separate from Library CRUD, object storage and quota writes.
// This interface can prepare checkout, but cannot grant a storage entitlement.
public interface IStorageSubscriptionProvider
{
    bool CheckoutEnabled { get; }
    IReadOnlyList<StoragePlanDto> Plans { get; }
    ValueTask<StorageCheckoutResult> CreateCheckout(Guid accountId, string planId, CancellationToken ct);
}

public sealed class DisabledStorageSubscriptionProvider : IStorageSubscriptionProvider
{
    public bool CheckoutEnabled => false;
    public IReadOnlyList<StoragePlanDto> Plans { get; } = Array.AsReadOnly<StoragePlanDto>(
        [new("free", "Free", 1_000_000_000, false), new("plus", "Plus", 100_000_000_000, false),
         new("pro", "Pro", 1_000_000_000_000, false)]);

    public ValueTask<StorageCheckoutResult> CreateCheckout(Guid accountId, string planId, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return ValueTask.FromResult(new StorageCheckoutResult("subscription_checkout_unavailable", null));
    }
}

public static class StorageSubscriptionEndpoints
{
    public static IServiceCollection AddStorageSubscriptions(this IServiceCollection services) =>
        services.AddSingleton<IStorageSubscriptionProvider, DisabledStorageSubscriptionProvider>();

    public static IEndpointRouteBuilder MapStorageSubscriptionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/subscriptions/storage-plans", async (HttpContext context, WuknaDbContext db,
            IStorageSubscriptionProvider provider, CancellationToken ct) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            if (!Guid.TryParse(context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, out var owner) ||
                !await db.Users.AnyAsync(user => user.Id == owner, ct)) return Results.Unauthorized();
            return Results.Ok(provider.Plans);
        }).RequireAuthorization();
        return endpoints;
    }
}

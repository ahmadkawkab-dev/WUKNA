namespace Wukna.Features.Auth;

using Wukna.Shared.Data.AppDbContext;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Removes expired exchange grants in bounded batches without delaying OAuth callbacks.
/// Multiple API replicas can safely perform the same cleanup against PostgreSQL.
/// </summary>
public sealed class ExternalLoginGrantCleanupService(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<ExternalLoginGrantCleanupService> logger) : BackgroundService
{
    private const int BatchSize = 500;
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval, timeProvider);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await DeleteOneBatchAsync(stoppingToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    // Cleanup is maintenance, not part of a user's authentication decision.
                    logger.LogWarning(exception, "Could not clean expired external-login grants.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal application shutdown.
        }
    }

    private async Task DeleteOneBatchAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WuknaDbContext>();
        var now = timeProvider.GetUtcNow();

        var expiredIds = await db.ExternalLoginGrants.AsNoTracking()
            .Where(grant => grant.ExpiresAt <= now)
            .OrderBy(grant => grant.ExpiresAt)
            .Select(grant => grant.Id)
            .Take(BatchSize)
            .ToArrayAsync(cancellationToken);

        if (expiredIds.Length == 0)
            return;

        var deleted = await db.ExternalLoginGrants
            .Where(grant => expiredIds.Contains(grant.Id) && grant.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);
        logger.LogDebug("Removed {Count} expired external-login grants.", deleted);
    }
}

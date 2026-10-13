namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public sealed class LibraryReservationWorker(IServiceScopeFactory scopes, IOptions<LibraryOptions> options,
    TimeProvider clock, ILogger<LibraryReservationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.ReservationCleanupEnabled) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), clock, stoppingToken);
                await using var scope = scopes.CreateAsyncScope();
                var expired = await ExpireBatch(scope.ServiceProvider.GetRequiredService<WuknaDbContext>(), options, clock, stoppingToken);
                if (expired > 0) logger.LogInformation("Library reservation cleanup visited {OwnerCount} owners", expired);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogWarning("Library reservation cleanup unavailable: {FailureType}", error.GetType().Name); }
        }
    }
    public static async Task<int> ExpireBatch(WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var now = LibraryAccess.Now(clock);
        var owners = await db.StorageReservations.AsNoTracking().Where(row => row.ExpiresAt <= now && row.CancellationRequestedAt == null &&
            (row.State == LibraryUploadState.Reserved || row.State == LibraryUploadState.Receiving || row.State == LibraryUploadState.Processing))
            .OrderBy(row => row.ExpiresAt).ThenBy(row => row.Id).Select(row => row.UserId).Take(50).ToArrayAsync(ct);
        foreach (var owner in owners.Distinct())
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await LibraryAccess.LockOwner(db, owner, options, clock, ct);
            await LibraryReservations.ExpireUntouched(db, owner, now, ct); await tx.CommitAsync(ct);
        }
        return owners.Distinct().Count();
    }
}

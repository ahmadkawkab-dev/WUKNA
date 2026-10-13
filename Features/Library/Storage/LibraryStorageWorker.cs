namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public sealed class LibraryStorageWorker(IServiceScopeFactory scopes, IOptions<LibraryStorageOptions> options,
    TimeProvider clock, ILogger<LibraryStorageWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!options.Value.Enabled || !options.Value.WorkerEnabled) return;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await RunBatch(scope.ServiceProvider.GetRequiredService<WuknaDbContext>(),
                    scope.ServiceProvider.GetRequiredService<ILibraryFileStorage>(),
                    scope.ServiceProvider.GetRequiredService<IOptions<LibraryOptions>>(), clock, ct);
                RemoveAbandonedTemporaryFiles(options.Value, clock);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
            catch (Exception error) { logger.LogWarning("Library storage recovery unavailable: {FailureType}", error.GetType().Name); }
            await Task.Delay(TimeSpan.FromSeconds(30), clock, ct);
        }
    }
    public static async Task RunBatch(WuknaDbContext db, ILibraryFileStorage store,
        IOptions<LibraryOptions> limits, TimeProvider clock, CancellationToken ct)
    {
        var now = LibraryAccess.Now(clock);
        var abandoned = await db.StorageReservations.AsNoTracking().Where(r => r.State == LibraryUploadState.Receiving &&
            r.LeaseExpiresAt <= now).OrderBy(r => r.LeaseExpiresAt).ThenBy(r => r.Id).Take(25).ToArrayAsync(ct);
        foreach (var session in abandoned)
        {
            await using var fence = await LibraryAttemptLock.Try(db, session.Id, ct); if (fence is null) continue;
            db.ChangeTracker.Clear();
            await LibraryFileTransfers.Fail(db, session.UserId, session.Id, LibraryErrors.UploadExpired, true, limits, clock, ct);
        }
        db.ChangeTracker.Clear();
        var ids = await db.LibraryBlobWork.AsNoTracking().Where(w => w.Purpose == LibraryBlobWorkPurpose.Delete &&
            w.DueAt <= now && (w.LeaseExpiresAt == null || w.LeaseExpiresAt <= now))
            .OrderBy(w => w.DueAt).ThenBy(w => w.Id).Select(w => w.Id).Take(25).ToArrayAsync(ct);
        foreach (var id in ids)
        {
            db.ChangeTracker.Clear(); LibraryBlobWork? work; var lease = Guid.NewGuid();
            await using (var tx = await db.Database.BeginTransactionAsync(ct))
            {
                var owner = await db.LibraryBlobWork.Where(w => w.Id == id).Select(w => (Guid?)w.UserId).SingleOrDefaultAsync(ct);
                if (owner is null) { await tx.CommitAsync(ct); continue; }
                await LibraryAccess.LockOwner(db, owner.Value, limits, clock, ct);
                work = await db.LibraryBlobWork.SingleOrDefaultAsync(w => w.Id == id && w.DueAt <= now &&
                    (w.LeaseExpiresAt == null || w.LeaseExpiresAt <= now), ct);
                if (work is null) { await tx.CommitAsync(ct); continue; }
                work.LeaseToken = lease; work.LeaseExpiresAt = now.AddMinutes(3); work.Attempts++;
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            }
            try
            {
                await store.Delete(work.ObjectKey, ct);
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                await LibraryAccess.LockOwner(db, work.UserId, limits, clock, ct);
                await db.LibraryBlobWork.Where(w => w.Id == id && w.LeaseToken == lease).ExecuteDeleteAsync(ct);
                await tx.CommitAsync(ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch
            {
                db.ChangeTracker.Clear(); await using var tx = await db.Database.BeginTransactionAsync(ct);
                await LibraryAccess.LockOwner(db, work.UserId, limits, clock, ct);
                await db.LibraryBlobWork.Where(w => w.Id == id && w.LeaseToken == lease).ExecuteUpdateAsync(set =>
                    set.SetProperty(w => w.LeaseToken, (Guid?)null).SetProperty(w => w.LeaseExpiresAt, (DateTimeOffset?)null)
                        .SetProperty(w => w.DueAt, LibraryAccess.Now(clock).AddSeconds(Math.Min(3600, 30 * Math.Pow(2, Math.Min(work.Attempts, 7)))))
                        .SetProperty(w => w.LastErrorCode, LibraryErrors.StorageUnavailable), ct);
                await tx.CommitAsync(ct);
            }
        }
    }
    private static void RemoveAbandonedTemporaryFiles(LibraryStorageOptions options, TimeProvider clock)
    {
        var directory = Path.GetFullPath(options.QuarantineDirectory); if (!Directory.Exists(directory)) return;
        var count = 0;
        foreach (var file in Directory.EnumerateFiles(directory, "upload-*.tmp"))
        {
            if (++count > 50) break;
            if (File.GetLastWriteTimeUtc(file) > clock.GetUtcNow().UtcDateTime.AddHours(-1)) continue;
            try { File.Delete(file); } catch (IOException) { }
        }
    }
}

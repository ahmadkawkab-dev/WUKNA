namespace Wukna.Features.Library;

using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public static class LibraryFileTransfers
{
    public static string OriginalKey(Guid attempt) => $"library/available/{attempt:N}";
    public static string ThumbnailKey(Guid attempt) => "library/available/" +
        Convert.ToHexStringLower(SHA256.HashData(Encoding.ASCII.GetBytes($"{attempt:N}:thumbnail"))).Substring(0, 32);

    public static async Task<IResult> Upload(Guid id, HttpContext context, WuknaDbContext db,
        IOptions<LibraryOptions> limits, IOptions<LibraryStorageOptions> configured,
        ILibraryFileStorage store, ILibraryScanner scanner, LibraryFileValidation validation,
        LibraryTransferGate gate, TimeProvider clock, ILoggerFactory logs, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var options = configured.Value;
        var session = await db.StorageReservations.AsNoTracking().SingleOrDefaultAsync(r => r.Id == id && r.UserId == owner, ct);
        LibraryAccess.Found(session is not null);
        LibraryAccess.Require(options.Enabled, LibraryErrors.StorageUnavailable, 503);
        if (!await gate.Slots.WaitAsync(0, ct)) throw new LibraryFailure(LibraryErrors.ProcessingUnavailable, 503);
        var started = false; var writesStarted = false;
        try
        {
            await using var fence = await LibraryAttemptLock.Try(db, id, ct);
            LibraryAccess.Require(fence is not null, LibraryErrors.UploadConflict, 409);
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
            deadline.CancelAfter(TimeSpan.FromSeconds(options.TransferTimeoutSeconds)); var token = deadline.Token;
            await using (var tx = await db.Database.BeginTransactionAsync(token))
            {
                var entitlement = await LibraryAccess.LockOwner(db, owner, limits, clock, token);
                await LibraryReservations.ExpireUntouched(db, owner, LibraryAccess.Now(clock), token);
                session = await db.StorageReservations.SingleAsync(r => r.Id == id && r.UserId == owner, token);
                if (session.State == LibraryUploadState.Complete)
                { await tx.CommitAsync(token); return Results.Ok(await LibraryReservations.Session(db, session, token)); }
                LibraryAccess.Require(session.State == LibraryUploadState.Reserved && session.AttemptId is null &&
                    session.CancellationRequestedAt is null && session.ExpiresAt > LibraryAccess.Now(clock), LibraryErrors.UploadConflict, 409);
                LibraryAccess.Require(context.Request.ContentType?.Split(';')[0] == "application/octet-stream", LibraryErrors.FileType, 415);
                LibraryAccess.Require(context.Request.ContentLength is null || context.Request.ContentLength == session.DeclaredSizeBytes,
                    LibraryErrors.UploadConflict, 409);
                var usage = await LibraryReservations.Storage(db, entitlement, token);
                if (usage.UsedBytes + usage.ReservedBytes > usage.QuotaBytes)
                {
                    // A lowered account ceiling can invalidate a previously admitted,
                    // untouched reservation. No writer has started, so release it safely.
                    session.State = LibraryUploadState.Failed; session.ReservedBytes = 0;
                    session.LastErrorCode = LibraryErrors.QuotaExceeded; session.FolderId = null;
                    session.UpdatedAt = LibraryAccess.Now(clock);
                    await db.SaveChangesAsync(token); await tx.CommitAsync(token);
                    throw new LibraryFailure(LibraryErrors.QuotaExceeded, 409);
                }
                var now = LibraryAccess.Now(clock);
                session.State = LibraryUploadState.Receiving; session.AttemptId = Guid.NewGuid(); session.LeaseToken = Guid.NewGuid();
                session.LeaseExpiresAt = now.AddSeconds(options.TransferTimeoutSeconds + 60); session.UpdatedAt = now;
                await db.SaveChangesAsync(token); await tx.CommitAsync(token); started = true;
            }
            var directory = Path.GetFullPath(options.QuarantineDirectory); Directory.CreateDirectory(directory);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            var path = Path.Combine(directory, $"upload-{session.AttemptId:N}.tmp");
            var fileOptions = new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.ReadWrite, Share = FileShare.None,
                Options = FileOptions.Asynchronous | FileOptions.DeleteOnClose, BufferSize = 65536 };
            if (!OperatingSystem.IsWindows()) fileOptions.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            await using var quarantine = new FileStream(path, fileOptions);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256); var buffer = new byte[65536]; long received = 0;
            while (true)
            {
                var count = await context.Request.Body.ReadAsync(buffer, token); if (count == 0) break;
                received += count;
                LibraryAccess.Require(received <= session.DeclaredSizeBytes && received <= limits.Value.MaxFileBytes, LibraryErrors.FileTooLarge, 413);
                hash.AppendData(buffer, 0, count); await quarantine.WriteAsync(buffer.AsMemory(0, count), token);
            }
            LibraryAccess.Require(received == session.DeclaredSizeBytes &&
                Convert.ToHexStringLower(hash.GetHashAndReset()) == session.DeclaredChecksum, LibraryErrors.UploadConflict, 409);
            await quarantine.FlushAsync(token); quarantine.Position = 0;
            LibraryAccess.Require(await scanner.IsClean(quarantine, token), LibraryErrors.FileRejected, 422);
            quarantine.Position = 0;
            var verified = await validation.Verify(session, quarantine, token);
            if (verified.Thumbnail is not null)
            {
                using var thumbScan = new MemoryStream(verified.Thumbnail, false);
                LibraryAccess.Require(await scanner.IsClean(thumbScan, token), LibraryErrors.FileRejected, 422);
            }
            // Recheck cancellation/expiry before the first remote write. No I/O inside this transaction.
            await CheckActive(db, session, limits, clock, token);
            writesStarted = true;
            await store.Put(OriginalKey(session.AttemptId!.Value), quarantine, verified.ContentType, token);
            if (verified.Thumbnail is not null)
            {
                await CheckActive(db, session, limits, clock, token);
                using var thumbnail = new MemoryStream(verified.Thumbnail, false);
                await store.Put(ThumbnailKey(session.AttemptId.Value), thumbnail, "image/png", token);
            }
            await using (var tx = await db.Database.BeginTransactionAsync(token))
            {
                var entitlement = await LibraryAccess.LockOwner(db, owner, limits, clock, token); await db.Entry(session).ReloadAsync(token);
                Active(session, clock);
                var usage = await LibraryReservations.Storage(db, entitlement, token);
                LibraryAccess.Require(usage.UsedBytes + usage.ReservedBytes <= usage.QuotaBytes, LibraryErrors.QuotaExceeded, 409);
                await LibraryAccess.Folder(db, owner, session.FolderId, session.Category, token);
                var now = LibraryAccess.Now(clock);
                var item = new LibraryItem { UserId = owner, Category = session.Category,
                    Name = session.FileName.Length <= 160 ? session.FileName : session.FileName[..160], FolderId = session.FolderId,
                    CreatedAt = now, UpdatedAt = now };
                var asset = new LibraryAsset { Item = item, ItemId = item.Id, UserId = owner, Category = item.Category,
                    OriginalFileName = session.FileName, ContentType = verified.ContentType, SizeBytes = received,
                    Checksum = session.DeclaredChecksum, OriginalStorageKey = OriginalKey(session.AttemptId.Value),
                    ThumbnailStorageKey = verified.Thumbnail is null ? null : ThumbnailKey(session.AttemptId.Value),
                    ThumbnailBytes = verified.Thumbnail?.Length ?? 0, StoredBytes = received + (verified.Thumbnail?.Length ?? 0),
                    Width = verified.Width, Height = verified.Height, ProcessingStatus = LibraryProcessingStatus.Available,
                    VerifiedAt = now, ScannedAt = now, ScanVerdict = LibraryScanVerdict.Clean, CreatedAt = now, UpdatedAt = now };
                db.Add(item); db.Add(asset);
                if (item.Category == LibraryCategory.Document)
                    db.Add(new LibraryDocument { Item = item, ItemId = item.Id, UserId = owner, PreviewKind = verified.Kind,
                        Language = verified.Language, SourceText = verified.Source, Encoding = verified.Source is null ? null : "utf-8" });
                session.State = LibraryUploadState.Complete; session.ResultItemId = item.Id; session.ResultItem = item;
                session.CompletedAt = now; session.UpdatedAt = now; session.ReservedBytes = 0;
                session.LeaseToken = null; session.LeaseExpiresAt = null; session.FolderId = null;
                await db.SaveChangesAsync(token); await tx.CommitAsync(token);
                return Results.Ok(await LibraryReservations.Session(db, session, token));
            }
        }
        catch (Exception error) when (started)
        {
            var code = error is LibraryFailure failure ? failure.Code : error is BadHttpRequestException { StatusCode: 413 }
                ? LibraryErrors.FileTooLarge : LibraryErrors.ProcessingUnavailable;
            // Independent bounded cleanup persists even after the browser aborts. Failed remote writes
            // are ambiguous; leave generated-key deletion work and its charge instead of assuming absence.
            try
            {
                using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(15)); db.ChangeTracker.Clear();
                await Fail(db, owner, id, code, writesStarted, limits, clock, cleanup.Token);
            }
            catch (Exception cleanupError)
            { logs.CreateLogger("LibraryTransfers").LogWarning("Library upload recovery deferred: {FailureType}", cleanupError.GetType().Name); }
            if (error is LibraryFailure) throw;
            if (error is BadHttpRequestException { StatusCode: 413 }) throw new LibraryFailure(LibraryErrors.FileTooLarge, 413);
            if (ct.IsCancellationRequested) throw new OperationCanceledException(ct);
            logs.CreateLogger("LibraryTransfers").LogWarning("Library upload unavailable: {FailureType}", error.GetType().Name);
            throw new LibraryFailure(LibraryErrors.ProcessingUnavailable, 503);
        }
        finally { gate.Slots.Release(); }
    }
    private static void Active(StorageReservation row, TimeProvider clock) => LibraryAccess.Require(
        row.State == LibraryUploadState.Receiving && row.LeaseToken is not null &&
        row.LeaseExpiresAt > LibraryAccess.Now(clock) && row.ExpiresAt > LibraryAccess.Now(clock) &&
        row.CancellationRequestedAt is null, LibraryErrors.UploadExpired, 409);
    private static async Task CheckActive(WuknaDbContext db, StorageReservation row, IOptions<LibraryOptions> limits,
        TimeProvider clock, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, row.UserId, limits, clock, ct); await db.Entry(row).ReloadAsync(ct);
        Active(row, clock); await tx.CommitAsync(ct);
    }
    public static async Task Fail(WuknaDbContext db, Guid owner, Guid id, string code, bool possibleWrites,
        IOptions<LibraryOptions> limits, TimeProvider clock, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, limits, clock, ct);
        var row = await db.StorageReservations.SingleOrDefaultAsync(r => r.UserId == owner && r.Id == id, ct);
        if (row is null || row.State != LibraryUploadState.Receiving) { await tx.CommitAsync(ct); return; }
        var now = LibraryAccess.Now(clock);
        if (possibleWrites && row.AttemptId is not null)
        {
            foreach (var (key, bytes) in new[] { (OriginalKey(row.AttemptId.Value), row.DeclaredSizeBytes),
                (ThumbnailKey(row.AttemptId.Value), row.Category == LibraryCategory.Picture ? LibraryReservations.ThumbnailBudgetBytes : 0) })
            {
                if (bytes == 0) continue;
                db.Add(new LibraryBlobWork { UserId = owner, ObjectKey = key, Purpose = LibraryBlobWorkPurpose.Delete,
                    ChargedBytes = bytes, CreatedAt = now, DueAt = now.AddMinutes(10) });
            }
        }
        row.State = row.CancellationRequestedAt is not null ? LibraryUploadState.Cancelled :
            row.ExpiresAt <= now ? LibraryUploadState.Expired : LibraryUploadState.Failed;
        row.LastErrorCode = code; row.ReservedBytes = 0; row.FolderId = null; row.LeaseToken = null;
        row.LeaseExpiresAt = null; row.UpdatedAt = now;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
    public static async Task<IResult> Download(Guid id, bool thumbnail, HttpContext context, WuknaDbContext db,
        IOptions<LibraryStorageOptions> options, ILibraryFileStorage store, LibraryTransferGate gate, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context);
        var asset = await db.LibraryAssets.AsNoTracking().SingleOrDefaultAsync(a => a.ItemId == id && a.UserId == owner, ct);
        LibraryAccess.Found(asset is not null);
        LibraryAccess.Require(options.Value.Enabled, LibraryErrors.StorageUnavailable, 503);
        LibraryAccess.Require(asset!.ProcessingStatus == LibraryProcessingStatus.Available && asset.ScanVerdict == LibraryScanVerdict.Clean,
            LibraryErrors.ProcessingUnavailable, 503);
        var key = thumbnail ? asset.ThumbnailStorageKey : asset.OriginalStorageKey;
        LibraryAccess.Found(key is not null);
        if (!await gate.Slots.WaitAsync(0, ct)) throw new LibraryFailure(LibraryErrors.ProcessingUnavailable, 503);
        try
        {
            var bytes = await store.Read(key!, thumbnail ? asset.ThumbnailBytes : asset.SizeBytes, ct);
            LibraryAccess.Require(bytes.LongLength == (thumbnail ? asset.ThumbnailBytes : asset.SizeBytes) &&
                (thumbnail || Convert.ToHexStringLower(SHA256.HashData(bytes)) == asset.Checksum), LibraryErrors.ProcessingUnavailable, 503);
            LibraryAccess.Found(await db.LibraryAssets.AnyAsync(a => a.Id == asset.Id && a.UserId == owner &&
                a.ProcessingStatus == LibraryProcessingStatus.Available, ct));
            context.Response.Headers.ContentSecurityPolicy = "sandbox; default-src 'none'";
            return Results.File(bytes, thumbnail ? "image/png" : asset.ContentType!,
                fileDownloadName: thumbnail ? null : asset.OriginalFileName, enableRangeProcessing: true);
        }
        catch (Exception error) when (error is not LibraryFailure && !ct.IsCancellationRequested)
        {
            context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("LibraryTransfers")
                .LogWarning("Library download unavailable: {FailureType}", error.GetType().Name);
            throw new LibraryFailure(LibraryErrors.StorageUnavailable, 503);
        }
        finally { gate.Slots.Release(); }
    }
}

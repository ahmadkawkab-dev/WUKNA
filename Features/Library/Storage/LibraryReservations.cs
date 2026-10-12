namespace Wukna.Features.Library;

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public static partial class LibraryReservations
{
    public const long ThumbnailBudgetBytes = 1_000_000;
    private static readonly string[] CodeExtensions = [".cs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html", ".htm", ".py", ".sql", ".json", ".sh", ".bash", ".txt", ".md"];
    [GeneratedRegex("^[0-9a-fA-F]{64}$", RegexOptions.CultureInvariant)]
    private static partial Regex ChecksumPattern();

    public static async Task<LibraryStorageSummaryDto> Storage(WuknaDbContext db, StorageEntitlement entitlement, CancellationToken ct)
    {
        var owner = entitlement.UserId;
        var assets = await db.LibraryAssets.Where(row => row.UserId == owner).SumAsync(row => (long?)row.StoredBytes, ct) ?? 0;
        var cleanup = await db.LibraryBlobWork.Where(row => row.UserId == owner && row.Purpose == LibraryBlobWorkPurpose.Delete).SumAsync(row => (long?)row.ChargedBytes, ct) ?? 0;
        var reserved = await db.StorageReservations.Where(row => row.UserId == owner).SumAsync(row => (long?)row.ReservedBytes, ct) ?? 0;
        var used = checked(assets + cleanup);
        // Enforce the current account ceiling even before an existing database's
        // forward quota migration is applied. Existing files and charges are retained.
        var quota = Math.Min(entitlement.QuotaBytes, LibraryOptions.DefaultFreeQuotaBytes);
        return new(quota, used, reserved, Math.Max(0, quota - used - reserved), LibraryAccess.Wire(entitlement.Source));
    }
    public static async Task ExpireUntouched(WuknaDbContext db, Guid owner, DateTimeOffset now, CancellationToken ct)
    {
        // Reserved with no attempt/lease/result is the only state proving no writer ever started.
        await db.StorageReservations.Where(row => row.UserId == owner && row.State == LibraryUploadState.Reserved && row.ExpiresAt <= now &&
            row.AttemptId == null && row.LeaseToken == null && row.ResultItemId == null)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, LibraryUploadState.Expired).SetProperty(row => row.ReservedBytes, 0L)
                .SetProperty(row => row.FolderId, (Guid?)null).SetProperty(row => row.UpdatedAt, now).SetProperty(row => row.LastErrorCode, LibraryErrors.UploadExpired), ct);
        // Ambiguous/active writers retain their budget and lease until the storage phase fences them.
        await db.StorageReservations.Where(row => row.UserId == owner && row.ExpiresAt <= now &&
            (row.State == LibraryUploadState.Receiving || row.State == LibraryUploadState.Processing || row.State == LibraryUploadState.Reserved && row.AttemptId != null) && row.CancellationRequestedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.CancellationRequestedAt, now).SetProperty(row => row.UpdatedAt, now)
                .SetProperty(row => row.LastErrorCode, LibraryErrors.UploadExpired), ct);
    }
    public static async Task<IResult> StorageRead(HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); await using var tx = await db.Database.BeginTransactionAsync(ct);
        var entitlement = await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        await ExpireUntouched(db, owner, LibraryAccess.Now(clock), ct); var summary = await Storage(db, entitlement, ct);
        await tx.CommitAsync(ct); return Results.Ok(summary);
    }
    public static async Task<IResult> Create(LibraryUploadCreateRequest request, HttpContext context, WuknaDbContext db,
        IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var category = LibraryAccess.Category(request.Category);
        LibraryAccess.Require(category is LibraryCategory.Picture or LibraryCategory.Document, LibraryErrors.FileType);
        var fileName = request.FileName?.Trim(); var contentType = request.ContentType?.Trim().ToLowerInvariant();
        LibraryAccess.Require(fileName is { Length: > 0 and <= 255 } && !fileName.Any(char.IsControl) && !fileName.Contains('/') && !fileName.Contains('\\'), LibraryErrors.InvalidItem);
        LibraryAccess.Require(request.ClientUploadId != Guid.Empty && request.Checksum is not null && ChecksumPattern().IsMatch(request.Checksum), LibraryErrors.UploadConflict);
        LibraryAccess.Require(request.SizeBytes > 0, LibraryErrors.InvalidItem);
        LibraryAccess.Require(request.SizeBytes <= options.Value.MaxFileBytes, LibraryErrors.FileTooLarge, 413);
        var extension = Path.GetExtension(fileName!).ToLowerInvariant();
        var expectedType = extension switch
        {
            ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".webp" => "image/webp",
            ".pdf" => "application/pdf", ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", _ => null
        };
        var text = category == LibraryCategory.Document && CodeExtensions.Contains(extension);
        LibraryAccess.Require(category == LibraryCategory.Picture ? extension is ".jpg" or ".jpeg" or ".png" or ".webp" : text || extension is ".pdf" or ".docx" or ".xlsx", LibraryErrors.FileType, 415);
        LibraryAccess.Require(text ? contentType is "text/plain" or "text/markdown" or "text/javascript" or "text/css" or "text/html" or "application/json" or "application/javascript" or "application/octet-stream" : contentType == expectedType, LibraryErrors.FileType, 415);
        if (text) LibraryAccess.Require(request.SizeBytes <= options.Value.MaxTextBytes, LibraryErrors.FileTooLarge, 413);
        var checksum = request.Checksum!.ToLowerInvariant();
        var fingerprint = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { category, fileName, contentType, request.SizeBytes, checksum, request.FolderId }))));
        await using var tx = await db.Database.BeginTransactionAsync(ct); var entitlement = await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        var now = LibraryAccess.Now(clock); await ExpireUntouched(db, owner, now, ct);
        var previous = await db.StorageReservations.SingleOrDefaultAsync(row => row.UserId == owner && row.ClientUploadId == request.ClientUploadId, ct);
        if (previous is not null)
        {
            LibraryAccess.Require(previous.RequestFingerprint == fingerprint, LibraryErrors.UploadConflict, 409);
            await tx.CommitAsync(ct); return Results.Ok(await Session(db, previous, ct));
        }
        await LibraryAccess.Folder(db, owner, request.FolderId, category, ct);
        var storage = await Storage(db, entitlement, ct);
        var budget = checked(2 * request.SizeBytes + (category == LibraryCategory.Picture ? 2 * ThumbnailBudgetBytes : 0));
        LibraryAccess.Require(budget <= storage.AvailableBytes, LibraryErrors.QuotaExceeded, 409);
        LibraryAccess.Require(await db.StorageReservations.CountAsync(row => row.UserId == owner && (row.State == LibraryUploadState.Reserved || row.State == LibraryUploadState.Receiving || row.State == LibraryUploadState.Processing), ct) < 32, LibraryErrors.ProcessingUnavailable, 409);
        var session = new StorageReservation { UserId = owner, ClientUploadId = request.ClientUploadId, RequestFingerprint = fingerprint,
            Category = category, FileName = fileName!, DeclaredContentType = contentType!, DeclaredSizeBytes = request.SizeBytes,
            DeclaredChecksum = checksum, FolderId = request.FolderId, ReservedBytes = budget, CreatedAt = now, UpdatedAt = now,
            ExpiresAt = now.AddSeconds(options.Value.ReservationSeconds) };
        db.Add(session); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Created($"/api/library/uploads/{session.Id}", await Session(db, session, ct));
    }
    public static async Task<IResult> Read(Guid id, HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, options, clock, ct); await ExpireUntouched(db, owner, LibraryAccess.Now(clock), ct);
        var row = await db.StorageReservations.AsNoTracking().SingleOrDefaultAsync(row => row.UserId == owner && row.Id == id, ct);
        LibraryAccess.Found(row is not null); var dto = await Session(db, row!, ct); await tx.CommitAsync(ct); return Results.Ok(dto);
    }
    public static async Task<IResult> Cancel(Guid id, HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, options, clock, ct); var now = LibraryAccess.Now(clock); await ExpireUntouched(db, owner, now, ct);
        var row = await db.StorageReservations.SingleOrDefaultAsync(row => row.UserId == owner && row.Id == id, ct);
        LibraryAccess.Found(row is not null);
        if (row!.State is LibraryUploadState.Reserved or LibraryUploadState.Receiving or LibraryUploadState.Processing)
        {
            row.CancellationRequestedAt ??= now; row.UpdatedAt = now;
            if (row.State == LibraryUploadState.Reserved && row.AttemptId is null && row.LeaseToken is null && row.ResultItemId is null)
            { row.State = LibraryUploadState.Cancelled; row.ReservedBytes = 0; row.FolderId = null; }
            await db.SaveChangesAsync(ct);
        }
        var dto = await Session(db, row, ct); await tx.CommitAsync(ct); return Results.Ok(dto);
    }
    public static async Task<IResult> Finalize(Guid id, LibraryUploadFinalizeRequest request, HttpContext context,
        WuknaDbContext db, IOptions<LibraryOptions> options, IOptions<LibraryStorageOptions> storage, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, options, clock, ct); await ExpireUntouched(db, owner, LibraryAccess.Now(clock), ct);
        var row = await db.StorageReservations.AsNoTracking().SingleOrDefaultAsync(row => row.UserId == owner && row.Id == id, ct);
        LibraryAccess.Found(row is not null);
        LibraryAccess.Require(request.ClientUploadId == row!.ClientUploadId && request.Checksum is not null && string.Equals(request.Checksum, row.DeclaredChecksum, StringComparison.OrdinalIgnoreCase), LibraryErrors.UploadConflict, 409);
        // Commit safe expiry even when returning an expected error.
        await tx.CommitAsync(ct);
        if (row.State == LibraryUploadState.Expired) throw new LibraryFailure(LibraryErrors.UploadExpired, 409);
        if (row.State is LibraryUploadState.Cancelled or LibraryUploadState.Failed) throw new LibraryFailure(LibraryErrors.UploadConflict, 409);
        if (row.State == LibraryUploadState.Complete) return Results.Ok(await Session(db, row, ct));
        throw new LibraryFailure(storage.Value.Enabled ? LibraryErrors.ProcessingUnavailable : LibraryErrors.StorageUnavailable, 503);
    }
    public static async Task<IResult> TransferUnavailable(Guid id, HttpContext context, WuknaDbContext db, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context);
        LibraryAccess.Found(await db.StorageReservations.AnyAsync(row => row.Id == id && row.UserId == owner, ct));
        throw new LibraryFailure(LibraryErrors.StorageUnavailable, 503);
    }
    public static async Task<LibraryUploadSessionDto> Session(WuknaDbContext db, StorageReservation row, CancellationToken ct)
    {
        var status = row.ResultItemId is null ? null : await db.LibraryAssets.Where(asset => asset.ItemId == row.ResultItemId && asset.UserId == row.UserId)
            .Select(asset => (LibraryProcessingStatus?)asset.ProcessingStatus).SingleOrDefaultAsync(ct);
        return new(row.Id, row.ReservedBytes, row.ExpiresAt, LibraryAccess.Wire(row.State), row.ResultItemId,
            status is null ? null : LibraryAccess.Wire(status.Value), row.LastErrorCode, row.CancellationRequestedAt is not null, row.ResultPurgedAt is not null);
    }
}

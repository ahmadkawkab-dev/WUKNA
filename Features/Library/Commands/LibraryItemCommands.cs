namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public static class LibraryItemCommands
{
    public static async Task<IResult> Update(Guid[]? input, LibraryItemUpdateRequest? update, HttpContext context,
        WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var ids = LibraryAccess.Ids(input);
        LibraryAccess.Require(update is not null); var patch = update!;
        LibraryAccess.Require(patch.Name.IsSpecified || patch.Description.IsSpecified || patch.FolderId.IsSpecified || patch.Favorite.IsSpecified || patch.Tags.IsSpecified || patch.Notes.IsSpecified);
        if (patch.Name.IsSpecified) LibraryAccess.Name(patch.Name.Value);
        if (patch.Description.IsSpecified) LibraryAccess.Description(patch.Description.Value);
        if (patch.Favorite.IsSpecified) LibraryAccess.Require(patch.Favorite.Value is not null);
        if (patch.Notes.IsSpecified) LibraryAccess.Require(patch.Notes.Value is not null && patch.Notes.Value.Length <= 4000);
        string[]? tags = null;
        if (patch.Tags.IsSpecified)
        {
            LibraryAccess.Require(patch.Tags.Value is { Length: <= 12 } && patch.Tags.Value.All(tag => tag is not null && tag.Trim().Length is > 0 and <= 40 && !tag.Any(char.IsControl)));
            tags = patch.Tags.Value!.Select(tag => tag.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }
        await using var tx = await db.Database.BeginTransactionAsync(ct); await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        var rows = await db.LibraryItems.Where(row => row.UserId == owner && ids.Contains(row.Id)).ToArrayAsync(ct);
        LibraryAccess.Found(rows.Length == ids.Length); LibraryAccess.Require(rows.All(row => row.DeletedAt is null), LibraryErrors.ItemTrashed, 409);
        if (patch.FolderId.IsSpecified && patch.FolderId.Value is not null)
        {
            LibraryAccess.Require(rows.Select(row => row.Category).Distinct().Count() == 1, LibraryErrors.InvalidFolder);
            await LibraryAccess.Folder(db, owner, patch.FolderId.Value, rows[0].Category, ct);
        }
        var now = LibraryAccess.Now(clock);
        foreach (var row in rows)
        {
            if (patch.Name.IsSpecified) row.Name = patch.Name.Value!.Trim();
            if (patch.Description.IsSpecified) row.Description = LibraryAccess.Description(patch.Description.Value);
            if (patch.FolderId.IsSpecified) row.FolderId = patch.FolderId.Value;
            if (patch.Favorite.IsSpecified) row.Favorite = patch.Favorite.Value!.Value;
            if (tags is not null) row.Tags = tags;
            if (patch.Notes.IsSpecified) row.Notes = patch.Notes.Value!;
            row.UpdatedAt = now;
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
    }
    public static async Task<IResult> Lifecycle(Guid[]? input, string action, HttpContext context,
        WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var ids = LibraryAccess.Ids(input);
        await using var tx = await db.Database.BeginTransactionAsync(ct); await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        var items = await db.LibraryItems.Where(row => row.UserId == owner && ids.Contains(row.Id)).ToArrayAsync(ct);
        LibraryAccess.Found(items.Length == ids.Length); var now = LibraryAccess.Now(clock);
        if (action == "restore")
        {
            var videos = await db.LibraryVideos.Where(row => row.UserId == owner && ids.Contains(row.ItemId)).ToArrayAsync(ct);
            // Validate the complete batch before changing any rows, including duplicates inside the batch.
            LibraryAccess.Require(videos.Select(row => row.Url).Distinct(StringComparer.Ordinal).Count() == videos.Length, LibraryErrors.VideoDuplicate, 409);
            var urls = videos.Select(row => row.Url).ToArray();
            LibraryAccess.Require(!await db.LibraryVideos.AnyAsync(row => row.UserId == owner && urls.Contains(row.Url) &&
                row.Item.DeletedAt == null && !ids.Contains(row.ItemId), ct), LibraryErrors.VideoDuplicate, 409);
            foreach (var item in items) { item.DeletedAt = null; item.UpdatedAt = now; }
        }
        else if (action == "trash")
        {
            foreach (var item in items) { item.DeletedAt ??= now; item.UpdatedAt = now; }
            var sessions = await db.StorageReservations.Where(row => row.UserId == owner && row.State == LibraryUploadState.Processing && row.ResultItemId != null && ids.Contains(row.ResultItemId.Value)).ToArrayAsync(ct);
            foreach (var session in sessions) { session.CancellationRequestedAt ??= now; session.UpdatedAt = now; }
        }
        else
        {
            LibraryAccess.Require(items.All(row => row.DeletedAt is not null), LibraryErrors.ItemTrashed, 409);
            var sessions = await db.StorageReservations.Where(row => row.UserId == owner && row.ResultItemId != null && ids.Contains(row.ResultItemId.Value)).ToArrayAsync(ct);
            // Storage workers must fence/stop an in-flight processing upload before permanent purge.
            LibraryAccess.Require(sessions.All(row => row.State == LibraryUploadState.Complete), LibraryErrors.ProcessingUnavailable, 409);
            foreach (var session in sessions) { session.ResultItemId = null; session.ResultPurgedAt = now; session.UpdatedAt = now; }
            var assets = await db.LibraryAssets.Where(row => row.UserId == owner && ids.Contains(row.ItemId)).ToArrayAsync(ct);
            var assetIds = assets.Select(row => row.Id).ToArray();
            var keys = assets.SelectMany(asset => new[] { asset.OriginalStorageKey, asset.ThumbnailStorageKey }).OfType<string>().ToArray();
            LibraryAccess.Require(keys.Distinct(StringComparer.Ordinal).Count() == keys.Length, LibraryErrors.ProcessingUnavailable, 409);
            var pendingKeys = await db.LibraryBlobWork.Where(row => row.UserId == owner && row.Purpose == LibraryBlobWorkPurpose.Delete && keys.Contains(row.ObjectKey))
                .Select(row => row.ObjectKey).ToArrayAsync(ct);
            LibraryAccess.Require(pendingKeys.Length == 0, LibraryErrors.ProcessingUnavailable, 409);
            await db.LibraryBlobWork.Where(row => row.UserId == owner && row.Purpose == LibraryBlobWorkPurpose.Scan && row.AssetId != null && assetIds.Contains(row.AssetId.Value)).ExecuteDeleteAsync(ct);
            foreach (var asset in assets)
            {
                // Unknown extra physical copies remain charged until the storage reconciler can identify them.
                var knownBytes = (asset.OriginalStorageKey is null ? 0 : asset.SizeBytes) + (asset.ThumbnailStorageKey is null ? 0 : asset.ThumbnailBytes);
                LibraryAccess.Require(asset.StoredBytes == knownBytes, LibraryErrors.ProcessingUnavailable, 409);
                foreach (var (key, bytes) in new[] { (asset.OriginalStorageKey, asset.SizeBytes), (asset.ThumbnailStorageKey, asset.ThumbnailBytes) })
                {
                    if (key is null) continue;
                    db.Add(new LibraryBlobWork { UserId = owner, AssetId = asset.Id, Purpose = LibraryBlobWorkPurpose.Delete,
                        ObjectKey = key, ChargedBytes = bytes, CreatedAt = now, DueAt = now });
                }
            }
            // Persist tombstones/cleanup before deleting the restrictive asset/result relationships.
            await db.SaveChangesAsync(ct);
            await db.LibraryAssets.Where(row => row.UserId == owner && ids.Contains(row.ItemId)).ExecuteDeleteAsync(ct);
            await db.LibraryItems.Where(row => row.UserId == owner && ids.Contains(row.Id)).ExecuteDeleteAsync(ct);
            await tx.CommitAsync(ct); return Results.NoContent();
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
    }
}

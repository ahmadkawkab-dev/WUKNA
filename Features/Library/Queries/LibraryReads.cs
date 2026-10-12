namespace Wukna.Features.Library;

using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public static class LibraryReads
{
    public static readonly Expression<Func<LibraryItem, LibraryItemSummaryDto>> SummaryProjection = item => new LibraryItemSummaryDto
    {
        Id = item.Id, Category = item.Category == LibraryCategory.Picture ? "picture" : item.Category == LibraryCategory.Document ? "document" : "video",
        Name = item.Name, Description = item.Description, FolderId = item.FolderId, Favorite = item.Favorite,
        CreatedAt = item.CreatedAt, UpdatedAt = item.UpdatedAt, DeletedAt = item.DeletedAt, Tags = item.Tags,
        SizeBytes = item.Asset == null ? 0 : item.Asset.SizeBytes,
        ProcessingStatus = item.Category == LibraryCategory.Video ? "available" : item.Asset == null ? "pending" :
            item.Asset.ProcessingStatus == LibraryProcessingStatus.Available ? "available" :
            item.Asset.ProcessingStatus == LibraryProcessingStatus.Quarantined ? "quarantined" :
            item.Asset.ProcessingStatus == LibraryProcessingStatus.Processing ? "processing" :
            item.Asset.ProcessingStatus == LibraryProcessingStatus.Failed ? "failed" : "pending",
        DocumentKind = item.Category != LibraryCategory.Document ? null : item.Document == null ? "unavailable" :
            item.Document.PreviewKind == LibraryDocumentKind.Code ? "code" : item.Document.PreviewKind == LibraryDocumentKind.Text ? "text" :
            item.Document.PreviewKind == LibraryDocumentKind.Pdf ? "pdf" : "unavailable",
        ThumbnailReference = item.Video != null && item.Video.ThumbnailUrl != null ||
            item.Asset != null && item.Asset.ProcessingStatus == LibraryProcessingStatus.Available && item.Asset.ThumbnailStorageKey != null
            ? "/api/library/items/" + item.Id.ToString() + "/thumbnail" : null
    };
    public static LibraryFolderDto FolderDto(LibraryFolder row) => new(row.Id, row.Name, LibraryAccess.Wire(row.Category), row.ParentId, row.CreatedAt, row.UpdatedAt);

    public static async Task<IResult> Items(HttpContext context, WuknaDbContext db, LibraryCursorCodec codec, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context);
        var input = new LibraryQuery(context.Request.Query, "category", "folderId", "collectionId", "favorite", "trash", "search", "sort", "cursor", "limit", "documentKind", "tag");
        input.Validate(); var limit = input.Limit(); var category = input.Category();
        var folder = input.Reference("folderId", true); var collection = input.Reference("collectionId");
        var favorite = input.Flag("favorite"); var trash = input.Flag("trash");
        var search = input.Text("search")?.ToLowerInvariant(); var tag = input.Text("tag", 40)?.ToLowerInvariant();
        var sort = input.Text("sort") ?? "created-desc"; var kind = input.Text("documentKind");
        LibraryAccess.Require(sort is "created-desc" or "updated-desc" or "name-asc" or "size-desc", LibraryErrors.InvalidQuery);
        LibraryAccess.Require(kind is null or "pdf" or "code" or "text" or "unavailable", LibraryErrors.InvalidQuery);
        if (folder.Id is { } folderId)
        {
            var row = await db.LibraryFolders.AsNoTracking().SingleOrDefaultAsync(row => row.Id == folderId && row.UserId == owner, ct);
            LibraryAccess.Found(row is not null);
            LibraryAccess.Require(category is null || row!.Category == category, LibraryErrors.InvalidFolder);
        }
        if (collection.Id is { } collectionId)
            LibraryAccess.Found(await db.LibraryCollections.AnyAsync(row => row.Id == collectionId && row.UserId == owner, ct));
        var scope = LibraryCursorCodec.Scope(new { resource = "items", category, folder.Specified, folder.Id, Collection = collection.Id, favorite, trash, search, tag, kind });
        var cursor = codec.Decode(input.Text("cursor", 2048), owner, scope, sort);
        var query = db.LibraryItems.AsNoTracking().Where(row => row.UserId == owner && (trash ? row.DeletedAt != null : row.DeletedAt == null));
        if (category is not null) query = query.Where(row => row.Category == category);
        if (folder.Specified) query = query.Where(row => row.FolderId == folder.Id);
        if (favorite) query = query.Where(row => row.Favorite);
        if (collection.Id is not null) query = query.Where(row => db.LibraryCollectionItems.Any(member => member.UserId == owner && member.CollectionId == collection.Id && member.ItemId == row.Id));
        if (!string.IsNullOrEmpty(tag)) query = query.Where(row => row.Tags.Any(value => value.ToLower() == tag));
        if (kind is not null)
        {
            var preview = Enum.Parse<LibraryDocumentKind>(kind, true);
            query = query.Where(row => row.Category == LibraryCategory.Document && row.Document != null && row.Document.PreviewKind == preview);
        }
        if (!string.IsNullOrEmpty(search)) query = query.Where(row => row.Name.ToLower().Contains(search) ||
            (row.Description != null && row.Description.ToLower().Contains(search)) || row.Tags.Any(value => value.ToLower().Contains(search)) ||
            (row.Document != null && row.Asset != null && row.Asset.ProcessingStatus == LibraryProcessingStatus.Available &&
                ((row.Document.SourceText != null && row.Document.SourceText.ToLower().Contains(search)) ||
                 (row.Document.Language != null && row.Document.Language.ToLower().Contains(search)))));
        if (cursor is not null)
        {
            if (sort == "name-asc")
            { LibraryAccess.Require(cursor.Name is not null, LibraryErrors.InvalidCursor); query = query.Where(row => EF.Functions.GreaterThan(ValueTuple.Create(row.Name, row.Id), ValueTuple.Create(cursor.Name!, cursor.Id))); }
            else if (sort == "size-desc")
            { LibraryAccess.Require(cursor.Size is >= 0, LibraryErrors.InvalidCursor); query = query.Where(row => EF.Functions.LessThan(ValueTuple.Create(row.Asset == null ? 0L : row.Asset.SizeBytes, row.Id), ValueTuple.Create(cursor.Size!.Value, cursor.Id))); }
            else
            {
                LibraryAccess.Require(cursor.Time is not null && cursor.Time.Value.Offset == TimeSpan.Zero, LibraryErrors.InvalidCursor);
                query = sort == "updated-desc"
                    ? query.Where(row => EF.Functions.LessThan(ValueTuple.Create(row.UpdatedAt, row.Id), ValueTuple.Create(cursor.Time!.Value, cursor.Id)))
                    : query.Where(row => EF.Functions.LessThan(ValueTuple.Create(row.CreatedAt, row.Id), ValueTuple.Create(cursor.Time!.Value, cursor.Id)));
            }
        }
        var ordered = sort switch
        {
            "name-asc" => query.OrderBy(row => row.Name).ThenBy(row => row.Id),
            "size-desc" => query.OrderByDescending(row => row.Asset == null ? 0 : row.Asset.SizeBytes).ThenByDescending(row => row.Id),
            "updated-desc" => query.OrderByDescending(row => row.UpdatedAt).ThenByDescending(row => row.Id),
            _ => query.OrderByDescending(row => row.CreatedAt).ThenByDescending(row => row.Id)
        };
        var rows = await ordered.Select(SummaryProjection).Take(limit + 1).ToArrayAsync(ct);
        var page = rows.Take(limit).ToArray(); var last = page.LastOrDefault();
        var next = rows.Length <= limit || last is null ? null : codec.Encode(owner, scope, sort, last.Id,
            time: sort == "updated-desc" ? last.UpdatedAt : last.CreatedAt, size: last.SizeBytes, name: last.Name);
        return Results.Ok(new LibraryPageDto<LibraryItemSummaryDto>(page, next));
    }

    public static async Task<LibraryItemDetailDto> Detail(Guid id, Guid owner, WuknaDbContext db, CancellationToken ct)
    {
        var row = await db.LibraryItems.AsNoTracking().Include(row => row.Asset).Include(row => row.Document).Include(row => row.Video)
            .SingleOrDefaultAsync(row => row.Id == id && row.UserId == owner, ct);
        LibraryAccess.Found(row is not null); var item = row!;
        var status = item.Category == LibraryCategory.Video ? "available" : LibraryAccess.Wire(item.Asset?.ProcessingStatus ?? LibraryProcessingStatus.Pending);
        LibraryItemDetailDto detail;
        if (item.Category == LibraryCategory.Video)
        {
            LibraryAccess.Require(item.Video is not null, LibraryErrors.ProcessingUnavailable, 409);
            detail = new LibraryVideoDetailDto { Id = item.Id, Category = "video", Name = item.Name, ProcessingStatus = status,
                Provider = LibraryAccess.Wire(item.Video!.Provider), VideoId = item.Video.VideoId, Url = item.Video.Url, Creator = item.Video.Creator,
                MetadataTitle = item.Video.ProviderTitle, MetadataErrorCode = item.Video.MetadataErrorCode };
        }
        else
        {
            LibraryAccess.Require(item.Asset is not null, LibraryErrors.ProcessingUnavailable, 409);
            var asset = item.Asset!;
            var assetDto = new LibraryAssetDto(asset.Id, asset.ContentType, asset.OriginalFileName, asset.SizeBytes, asset.Checksum, status);
            if (item.Category == LibraryCategory.Picture)
                detail = new LibraryPictureDetailDto { Id = item.Id, Category = "picture", Name = item.Name, ProcessingStatus = status,
                    Asset = assetDto, Alt = item.Name, Width = asset.Width ?? 0, Height = asset.Height ?? 0 };
            else
            {
                var available = asset.ProcessingStatus == LibraryProcessingStatus.Available;
                var kind = available ? item.Document?.PreviewKind ?? LibraryDocumentKind.Unavailable : LibraryDocumentKind.Unavailable;
                detail = new LibraryDocumentDetailDto { Id = item.Id, Category = "document", Name = item.Name, ProcessingStatus = status,
                    Asset = assetDto, PreviewKind = LibraryAccess.Wire(kind), DocumentKind = LibraryAccess.Wire(item.Document?.PreviewKind ?? LibraryDocumentKind.Unavailable),
                    Source = kind == LibraryDocumentKind.Code ? item.Document?.SourceText : null,
                    Language = kind == LibraryDocumentKind.Code ? item.Document?.Language : null,
                    Text = kind == LibraryDocumentKind.Text ? item.Document?.SourceText : null };
            }
        }
        LibraryFolderDto[] breadcrumb = [];
        if (item.FolderId is { } folderId)
        {
            var ancestors = await db.LibraryFolders.FromSqlInterpolated($"""
                WITH RECURSIVE ancestors AS (
                    SELECT * FROM library_folders WHERE id = {folderId} AND user_id = {owner}
                    UNION ALL SELECT parent.* FROM library_folders parent JOIN ancestors child ON parent.id = child.parent_id
                        WHERE parent.user_id = {owner}
                ) SELECT * FROM ancestors ORDER BY depth LIMIT 33
                """).AsNoTracking().ToArrayAsync(ct);
            breadcrumb = ancestors.Select(FolderDto).ToArray();
        }
        return detail with { Description = item.Description, FolderId = item.FolderId, Favorite = item.Favorite,
            CreatedAt = item.CreatedAt, UpdatedAt = item.UpdatedAt, DeletedAt = item.DeletedAt, Notes = item.Notes, Tags = item.Tags,
            SizeBytes = item.Asset?.SizeBytes ?? 0, FolderBreadcrumb = breadcrumb,
            ContentReference = item.Asset?.ProcessingStatus == LibraryProcessingStatus.Available ? $"/api/library/items/{id}/content" : null,
            ThumbnailReference = item.Video?.ThumbnailUrl is not null || item.Asset?.ProcessingStatus == LibraryProcessingStatus.Available &&
                item.Asset.ThumbnailStorageKey is not null ? $"/api/library/items/{id}/thumbnail" : null };
    }

    public static async Task<IResult> Summary(HttpContext context, WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var entitlement = await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        await LibraryReservations.ExpireUntouched(db, owner, LibraryAccess.Now(clock), ct);
        var storage = await LibraryReservations.Storage(db, entitlement, ct);
        var counts = await db.LibraryItems.Where(row => row.UserId == owner && row.DeletedAt == null).GroupBy(row => row.Category)
            .Select(group => new { Category = group.Key, Count = group.Count() }).ToArrayAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Ok(new LibrarySummaryDto(Enum.GetValues<LibraryCategory>().Select(category =>
            new LibraryCategorySummaryDto(LibraryAccess.Wire(category), counts.SingleOrDefault(row => row.Category == category)?.Count ?? 0)).ToArray(), storage));
    }
}

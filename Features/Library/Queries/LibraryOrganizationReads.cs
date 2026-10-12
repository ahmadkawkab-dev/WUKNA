namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Wukna.Shared.Data.AppDbContext;

public static class LibraryOrganizationReads
{
    public static async Task<IResult> Folders(HttpContext context, WuknaDbContext db, LibraryCursorCodec codec, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var input = new LibraryQuery(context.Request.Query, "category", "parentId", "cursor", "limit");
        input.Validate(); var category = input.Category(); var parent = input.Reference("parentId", true); var limit = input.Limit(100);
        if (parent.Id is { } parentId)
        {
            var row = await db.LibraryFolders.AsNoTracking().SingleOrDefaultAsync(row => row.Id == parentId && row.UserId == owner, ct);
            LibraryAccess.Found(row is not null); LibraryAccess.Require(category is null || category == row!.Category, LibraryErrors.InvalidFolder);
        }
        var scope = LibraryCursorCodec.Scope(new { resource = "folders", category, parent.Specified, parent.Id });
        var cursor = codec.Decode(input.Text("cursor", 2048), owner, scope, "name-asc");
        var query = db.LibraryFolders.AsNoTracking().Where(row => row.UserId == owner);
        if (category is not null) query = query.Where(row => row.Category == category);
        if (parent.Specified) query = query.Where(row => row.ParentId == parent.Id);
        if (cursor is not null)
        {
            LibraryAccess.Require(cursor.Name is not null, LibraryErrors.InvalidCursor);
            query = query.Where(row => EF.Functions.GreaterThan(ValueTuple.Create(row.Name, row.Id), ValueTuple.Create(cursor.Name!, cursor.Id)));
        }
        var rows = await query.OrderBy(row => row.Name).ThenBy(row => row.Id).Take(limit + 1)
            .Select(row => new LibraryFolderDto(row.Id, row.Name, row.Category == LibraryCategory.Picture ? "picture" : row.Category == LibraryCategory.Document ? "document" : "video", row.ParentId, row.CreatedAt, row.UpdatedAt)).ToArrayAsync(ct);
        var page = rows.Take(limit).ToArray(); var last = page.LastOrDefault();
        return Results.Ok(new LibraryPageDto<LibraryFolderDto>(page, rows.Length > limit && last is not null ? codec.Encode(owner, scope, "name-asc", last.Id, name: last.Name) : null));
    }
    public static async Task<IResult> Collections(HttpContext context, WuknaDbContext db, LibraryCursorCodec codec, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var input = new LibraryQuery(context.Request.Query, "cursor", "limit");
        input.Validate(); var limit = input.Limit(100); var scope = LibraryCursorCodec.Scope(new { resource = "collections" });
        var cursor = codec.Decode(input.Text("cursor", 2048), owner, scope, "created-desc");
        var query = db.LibraryCollections.AsNoTracking().Where(row => row.UserId == owner);
        if (cursor is not null)
        {
            LibraryAccess.Require(cursor.Time is not null && cursor.Time.Value.Offset == TimeSpan.Zero, LibraryErrors.InvalidCursor);
            query = query.Where(row => EF.Functions.LessThan(ValueTuple.Create(row.CreatedAt, row.Id), ValueTuple.Create(cursor.Time!.Value, cursor.Id)));
        }
        var rows = await query.OrderByDescending(row => row.CreatedAt).ThenByDescending(row => row.Id).Take(limit + 1)
            .Select(row => new LibraryCollectionDto(row.Id, row.Name, row.Description,
                db.LibraryCollectionItems.Count(member => member.CollectionId == row.Id && member.UserId == owner && member.Item.UserId == owner && member.Item.DeletedAt == null), row.CreatedAt, row.UpdatedAt)).ToArrayAsync(ct);
        var page = rows.Take(limit).ToArray(); var last = page.LastOrDefault();
        return Results.Ok(new LibraryPageDto<LibraryCollectionDto>(page, rows.Length > limit && last is not null ? codec.Encode(owner, scope, "created-desc", last.Id, time: last.CreatedAt) : null));
    }
}

namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public static class LibraryOrganizationCommands
{
    public static async Task<IResult> CreateFolder(LibraryFolderWriteRequest request, HttpContext context,
        WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var name = LibraryAccess.Name(request.Name, LibraryErrors.InvalidFolder);
        var category = LibraryAccess.Category(request.Category);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        await LibraryAccess.Folder(db, owner, request.ParentId, category, ct);
        if (request.ParentId is not null)
            LibraryAccess.Require(await db.LibraryFolders.AnyAsync(row => row.Id == request.ParentId && row.UserId == owner && row.Depth < 32, ct), LibraryErrors.InvalidFolder, 409);
        var now = LibraryAccess.Now(clock);
        var folder = new LibraryFolder { UserId = owner, Name = name, Category = category, ParentId = request.ParentId, CreatedAt = now, UpdatedAt = now };
        db.Add(folder); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Created($"/api/library/folders/{folder.Id}", LibraryReads.FolderDto(folder));
    }
    public static async Task<IResult> DeleteFolder(Guid id, HttpContext context, WuknaDbContext db,
        IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        await LibraryReservations.ExpireUntouched(db, owner, LibraryAccess.Now(clock), ct);
        LibraryAccess.Found(await db.LibraryFolders.AnyAsync(row => row.Id == id && row.UserId == owner, ct));
        LibraryAccess.Require(!await db.LibraryFolders.AnyAsync(row => row.ParentId == id && row.UserId == owner, ct) &&
            !await db.LibraryItems.AnyAsync(row => row.FolderId == id && row.UserId == owner, ct) &&
            !await db.StorageReservations.AnyAsync(row => row.FolderId == id && row.UserId == owner, ct), LibraryErrors.FolderNotEmpty, 409);
        await db.LibraryFolders.Where(row => row.Id == id && row.UserId == owner).ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct); return Results.NoContent();
    }
    public static async Task<IResult> CreateCollection(LibraryCollectionWriteRequest request, HttpContext context,
        WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var name = LibraryAccess.Name(request.Name); var description = LibraryAccess.Description(request.Description);
        await using var tx = await db.Database.BeginTransactionAsync(ct); await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        var now = LibraryAccess.Now(clock); var row = new LibraryCollection { UserId = owner, Name = name, Description = description, CreatedAt = now, UpdatedAt = now };
        db.Add(row); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Created($"/api/library/collections/{row.Id}", new LibraryCollectionDto(row.Id, row.Name, row.Description, 0, row.CreatedAt, row.UpdatedAt));
    }
    public static async Task<IResult> UpdateCollection(Guid id, LibraryCollectionWriteRequest request, HttpContext context,
        WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        var row = await db.LibraryCollections.SingleOrDefaultAsync(row => row.Id == id && row.UserId == owner, ct);
        LibraryAccess.Found(row is not null); row!.Name = LibraryAccess.Name(request.Name); row.Description = LibraryAccess.Description(request.Description);
        row.UpdatedAt = LibraryAccess.Now(clock); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
    }
    public static async Task<IResult> DeleteCollection(Guid id, HttpContext context, WuknaDbContext db,
        IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        LibraryAccess.Found(await db.LibraryCollections.AnyAsync(row => row.Id == id && row.UserId == owner, ct));
        await db.LibraryCollections.Where(row => row.Id == id && row.UserId == owner).ExecuteDeleteAsync(ct);
        await tx.CommitAsync(ct); return Results.NoContent();
    }
    public static async Task<IResult> Membership(Guid id, LibraryMembershipRequest request, bool add, HttpContext context,
        WuknaDbContext db, IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var ids = LibraryAccess.Ids(request.ItemIds);
        await using var tx = await db.Database.BeginTransactionAsync(ct); await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        var collection = await db.LibraryCollections.SingleOrDefaultAsync(row => row.Id == id && row.UserId == owner, ct);
        LibraryAccess.Found(collection is not null);
        var items = await db.LibraryItems.Where(row => row.UserId == owner && ids.Contains(row.Id)).Select(row => new { row.Id, row.DeletedAt }).ToArrayAsync(ct);
        LibraryAccess.Found(items.Length == ids.Length);
        if (add)
        {
            LibraryAccess.Require(items.All(row => row.DeletedAt is null), LibraryErrors.ItemTrashed, 409);
            var existing = await db.LibraryCollectionItems.Where(row => row.CollectionId == id && row.UserId == owner && ids.Contains(row.ItemId)).Select(row => row.ItemId).ToArrayAsync(ct);
            foreach (var itemId in ids.Except(existing)) db.Add(new LibraryCollectionItem { CollectionId = id, ItemId = itemId, UserId = owner, AddedAt = LibraryAccess.Now(clock) });
        }
        else await db.LibraryCollectionItems.Where(row => row.CollectionId == id && row.UserId == owner && ids.Contains(row.ItemId)).ExecuteDeleteAsync(ct);
        collection!.UpdatedAt = LibraryAccess.Now(clock); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Results.NoContent();
    }
}

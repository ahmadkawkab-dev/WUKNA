namespace Wukna.Features.Library;

using System.IdentityModel.Tokens.Jwt;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public sealed class LibraryFailure(string code, int status = 400) : Exception(code)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

public static class LibraryAccess
{
    public static Guid Owner(HttpContext context) => (Guid)context.Items[typeof(LibraryAccess)]!;
    public static bool TryOwner(HttpContext context, out Guid owner) =>
        Guid.TryParse(context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, out owner) && owner != Guid.Empty;
    public static void Require(bool valid, string code = LibraryErrors.InvalidItem, int status = 400)
    { if (!valid) throw new LibraryFailure(code, status); }
    public static void Found(bool exists) => Require(exists, LibraryErrors.NotFound, 404);
    public static string Name(string? name, string code = LibraryErrors.InvalidItem)
    {
        Require(name is not null && name.Trim().Length is > 0 and <= 160 && !name.Any(char.IsControl), code);
        return name!.Trim();
    }
    public static string? Description(string? value)
    { Require(value is null || value.Length <= 2000); return string.IsNullOrWhiteSpace(value) ? null : value.Trim(); }
    public static Guid[] Ids(Guid[]? ids)
    {
        Require(ids is { Length: >= 1 and <= 100 } && ids.All(id => id != Guid.Empty));
        return ids!.Distinct().ToArray();
    }
    public static LibraryCategory Category(string? value) => value switch
    {
        "picture" => LibraryCategory.Picture, "document" => LibraryCategory.Document, "video" => LibraryCategory.Video,
        _ => throw new LibraryFailure(LibraryErrors.InvalidQuery)
    };
    public static string Wire<T>(T value) where T : struct, Enum => value.ToString().ToLowerInvariant();
    public static DateTimeOffset Now(TimeProvider clock) => new(clock.GetUtcNow().UtcTicks / 10 * 10, TimeSpan.Zero);

    // Call inside a transaction, before other Library locks. All commands and cleanup follow this order.
    public static async Task<StorageEntitlement> LockOwner(WuknaDbContext db, Guid owner,
        IOptions<LibraryOptions> options, TimeProvider clock, CancellationToken ct)
    {
        var users = await db.Database.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM asp_net_users WHERE id = {owner} FOR KEY SHARE").ToListAsync(ct);
        Found(users.Count == 1);
        var now = Now(clock);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO storage_entitlements (user_id, quota_bytes, source, created_at, updated_at)
            VALUES ({owner}, {options.Value.FreeQuotaBytes}, 0, {now}, {now}) ON CONFLICT (user_id) DO NOTHING
            """, ct);
        return (await db.StorageEntitlements.FromSqlInterpolated($"SELECT * FROM storage_entitlements WHERE user_id = {owner} FOR UPDATE").ToArrayAsync(ct)).Single();
    }
    public static async Task Folder(WuknaDbContext db, Guid owner, Guid? id, LibraryCategory category, CancellationToken ct)
    {
        if (id is null) return;
        var folder = await db.LibraryFolders.AsNoTracking().SingleOrDefaultAsync(row => row.Id == id && row.UserId == owner, ct);
        Found(folder is not null);
        Require(folder!.Category == category, LibraryErrors.InvalidFolder);
    }
}

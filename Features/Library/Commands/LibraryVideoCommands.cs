namespace Wukna.Features.Library;

using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wukna.Shared.Data.AppDbContext;

public sealed record LibraryVideoReference(LibraryVideoProvider Provider, string? Id, string Url);

public static partial class LibraryVideoCommands
{
    [GeneratedRegex("^[A-Za-z0-9_-]{11}$", RegexOptions.CultureInvariant)] private static partial Regex YoutubeId();
    [GeneratedRegex("^[0-9]{1,20}$", RegexOptions.CultureInvariant)] private static partial Regex VimeoId();
    public static LibraryVideoReference Normalize(string? input)
    {
        LibraryAccess.Require(input is { Length: > 0 and <= 2048 } && !input.Any(char.IsControl));
        LibraryAccess.Require(Uri.TryCreate(input!.Trim(), UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.UserInfo.Length == 0 && uri.IsDefaultPort && uri.AbsoluteUri.Length <= 2048);
        var url = uri!; var host = url.IdnHost.ToLowerInvariant(); var segments = url.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "youtu.be")
        {
            string? id = null;
            if (host == "youtu.be" && segments.Length == 1) id = segments[0];
            else if (host != "youtu.be" && url.AbsolutePath == "/watch")
            { var query = QueryHelpers.ParseQuery(url.Query); if (query.TryGetValue("v", out var values) && values.Count == 1) id = values[0]; }
            else if (host != "youtu.be" && segments.Length == 2 && segments[0] is "shorts" or "embed") id = segments[1];
            LibraryAccess.Require(id is not null && YoutubeId().IsMatch(id));
            return new(LibraryVideoProvider.Youtube, id, "https://www.youtube.com/watch?v=" + id);
        }
        if (host is "vimeo.com" or "www.vimeo.com" or "player.vimeo.com")
        {
            var id = segments.Length == 1 ? segments[0] : segments.Length == 2 && segments[0] == "video" ? segments[1] : null;
            LibraryAccess.Require(id is not null && VimeoId().IsMatch(id));
            return new(LibraryVideoProvider.Vimeo, id, "https://vimeo.com/" + id);
        }
        return new(LibraryVideoProvider.External, null, url.AbsoluteUri);
    }
    public static async Task<IResult> Create(LibraryVideoWriteRequest request, HttpContext context, WuknaDbContext db,
        IOptions<LibraryOptions> options, TimeProvider clock, LibraryVideoMetadataClient provider, CancellationToken ct)
    {
        var owner = LibraryAccess.Owner(context); var name = LibraryAccess.Name(request.Name); var description = LibraryAccess.Description(request.Description);
        var reference = Normalize(request.Url);
        var hash = Convert.ToHexStringLower(MD5.HashData(Encoding.UTF8.GetBytes(reference.Url)));
        // Validate before outbound I/O, then revalidate under the lock before committing.
        await LibraryAccess.Folder(db, owner, request.FolderId, LibraryCategory.Video, ct);
        LibraryAccess.Require(!await db.LibraryVideos.AnyAsync(row => row.UserId == owner && EF.Property<string>(row, "UrlLookupHash") == hash && row.Url == reference.Url && row.Item.DeletedAt == null, ct), LibraryErrors.VideoDuplicate, 409);
        var metadata = await provider.Fetch(reference, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct); await LibraryAccess.LockOwner(db, owner, options, clock, ct);
        await LibraryAccess.Folder(db, owner, request.FolderId, LibraryCategory.Video, ct);
        LibraryAccess.Require(!await db.LibraryVideos.AnyAsync(row => row.UserId == owner && EF.Property<string>(row, "UrlLookupHash") == hash && row.Url == reference.Url && row.Item.DeletedAt == null, ct), LibraryErrors.VideoDuplicate, 409);
        var now = LibraryAccess.Now(clock); var item = new LibraryItem { UserId = owner, Category = LibraryCategory.Video,
            Name = name, Description = description, FolderId = request.FolderId, CreatedAt = now, UpdatedAt = now };
        item.Video = new LibraryVideo { ItemId = item.Id, UserId = owner, Provider = reference.Provider, VideoId = reference.Id, Url = reference.Url,
            Creator = metadata.Creator, ProviderTitle = metadata.Title, ThumbnailUrl = metadata.Thumbnail,
            MetadataFetchedAt = reference.Provider == LibraryVideoProvider.External ? null : now, MetadataErrorCode = metadata.Error };
        db.Add(item); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Results.Created($"/api/library/items/{item.Id}", await LibraryReads.Detail(item.Id, owner, db, ct));
    }
}

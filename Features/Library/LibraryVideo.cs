namespace Wukna.Features.Library;

public sealed class LibraryVideo
{
    public Guid ItemId { get; set; }
    public Guid UserId { get; set; }
    public LibraryCategory Category { get; private set; } = LibraryCategory.Video;
    public LibraryItem Item { get; set; } = null!;
    public LibraryVideoProvider Provider { get; set; }
    public string? VideoId { get; set; }
    public string Url { get; set; } = string.Empty;
    public string? Creator { get; set; }
    public string? ProviderTitle { get; set; }
    public string? ThumbnailUrl { get; set; }
    public DateTimeOffset? MetadataFetchedAt { get; set; }
    public string? MetadataErrorCode { get; set; }
}

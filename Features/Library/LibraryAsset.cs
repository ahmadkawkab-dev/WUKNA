namespace Wukna.Features.Library;

public sealed class LibraryAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ItemId { get; set; }
    public Guid UserId { get; set; }
    public LibraryCategory Category { get; set; }
    public LibraryItem Item { get; set; } = null!;
    public string OriginalFileName { get; set; } = string.Empty;
    // These describe verified bytes, not client declarations. Pending assets may have zero bytes.
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }
    public string? Checksum { get; set; }
    public string? OriginalStorageKey { get; set; }
    public string? ThumbnailStorageKey { get; set; }
    public long ThumbnailBytes { get; set; }
    // Includes quarantine/derivative copies until their cleanup ownership is transferred.
    public long StoredBytes { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public LibraryProcessingStatus ProcessingStatus { get; set; }
    public DateTimeOffset? VerifiedAt { get; set; }
    public DateTimeOffset? ScannedAt { get; set; }
    public LibraryScanVerdict? ScanVerdict { get; set; }
    public string? LastErrorCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

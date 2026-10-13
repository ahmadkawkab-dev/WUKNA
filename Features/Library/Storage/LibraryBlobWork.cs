namespace Wukna.Features.Library;

public enum LibraryBlobWorkPurpose { Scan = 0, Delete = 1 }

// No cascading item/asset/user FK: object cleanup must survive their deletion.
// AssetId is a work reference; scan workers must recheck the live owned asset before publishing.
public sealed class LibraryBlobWork
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? AssetId { get; set; }
    public LibraryBlobWorkPurpose Purpose { get; set; }
    public string ObjectKey { get; set; } = string.Empty;
    // Delete work takes over this charge atomically from an asset/reservation, never in addition.
    public long ChargedBytes { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset DueAt { get; set; }
    public Guid? LeaseToken { get; set; }
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    public int Attempts { get; set; }
    public string? LastErrorCode { get; set; }
}

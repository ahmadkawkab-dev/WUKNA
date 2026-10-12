namespace Wukna.Features.Library;

public enum LibraryUploadState { Reserved = 0, Receiving = 1, Processing = 2, Complete = 3, Failed = 4, Cancelled = 5, Expired = 6 }

public sealed class StorageReservation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public StorageEntitlement Entitlement { get; set; } = null!;
    public Guid ClientUploadId { get; set; }
    public string RequestFingerprint { get; set; } = string.Empty;
    public LibraryCategory Category { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string DeclaredContentType { get; set; } = string.Empty;
    public long DeclaredSizeBytes { get; set; }
    public string DeclaredChecksum { get; set; } = string.Empty;
    public Guid? FolderId { get; set; }
    public LibraryFolder? Folder { get; set; }
    public long ReservedBytes { get; set; }
    public LibraryUploadState State { get; set; }
    public Guid? AttemptId { get; set; }
    public Guid? LeaseToken { get; set; }
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    // An abort request is separate from terminal cancellation: an active writer may still exist.
    public DateTimeOffset? CancellationRequestedAt { get; set; }
    public Guid? ResultItemId { get; set; }
    public LibraryItem? ResultItem { get; set; }
    // Keeps the idempotency tombstone after explicit result-link removal during permanent purge.
    public DateTimeOffset? ResultPurgedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public string? LastErrorCode { get; set; }
}

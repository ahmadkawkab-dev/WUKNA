namespace Wukna.Features.Library;

// Code is a read-only document preview. It has no separate destination or quota.
public sealed class LibraryDocument
{
    public Guid ItemId { get; set; }
    public Guid UserId { get; set; }
    public LibraryCategory Category { get; private set; } = LibraryCategory.Document;
    public LibraryItem Item { get; set; } = null!;
    public LibraryDocumentKind PreviewKind { get; set; } = LibraryDocumentKind.Unavailable;
    public string? Language { get; set; }
    public string? Encoding { get; set; }
    // A bounded derived cache for source search/preview; original bytes belong in private storage.
    // Future reads must withhold this until the corresponding asset is Available.
    public string? SourceText { get; set; }
}

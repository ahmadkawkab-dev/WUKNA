namespace Wukna.Features.Library;

using Wukna.Features.Users;

public enum LibraryCategory { Picture = 0, Document = 1, Video = 2 }
public enum LibraryProcessingStatus { Pending = 0, Quarantined = 1, Processing = 2, Available = 3, Failed = 4 }
public enum LibraryDocumentKind { Pdf = 0, Code = 1, Text = 2, Unavailable = 3 }
public enum LibraryVideoProvider { Youtube = 0, Vimeo = 1, External = 2 }
public enum LibraryScanVerdict { Clean = 0, Infected = 1 }

public sealed class LibraryItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public LibraryCategory Category { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Notes { get; set; } = string.Empty;
    public string[] Tags { get; set; } = [];
    public Guid? FolderId { get; set; }
    public LibraryFolder? Folder { get; set; }
    public bool Favorite { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public LibraryAsset? Asset { get; set; }
    public LibraryDocument? Document { get; set; }
    public LibraryVideo? Video { get; set; }
}

namespace Wukna.Features.Library;

using Wukna.Features.Users;

public sealed class LibraryFolder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public LibraryCategory Category { get; set; }
    public string Name { get; set; } = string.Empty;
    public string NormalizedName { get; private set; } = string.Empty;
    public Guid? ParentId { get; set; }
    public LibraryFolder? Parent { get; set; }
    // Assigned by the database hierarchy trigger, never by a request.
    public int Depth { get; private set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

namespace Wukna.Features.Library;

using Wukna.Features.Users;

public sealed class LibraryCollection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class LibraryCollectionItem
{
    public Guid CollectionId { get; set; }
    public Guid ItemId { get; set; }
    public Guid UserId { get; set; }
    public LibraryCollection Collection { get; set; } = null!;
    public LibraryItem Item { get; set; } = null!;
    public DateTimeOffset AddedAt { get; set; }
}

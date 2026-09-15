namespace Lapis.Features.Users;

using Features.Board;
using Microsoft.AspNetCore.Identity;

public class User : IdentityUser<Guid>
{
    public User()
    {
        // Identity doesn't generate Guid keys until configured to do so, so users receive
        // their application identifier when the entity is constructed.
        Id = Guid.NewGuid();
    }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // EF populates the initialized collection; replacing the collection itself isn't required.
    public ICollection<BoardMembership> BoardMemberships { get; } = new List<BoardMembership>();
}

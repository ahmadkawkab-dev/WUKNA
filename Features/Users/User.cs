namespace Lapis.Features.Users;

using Features.Board;
using Microsoft.AspNetCore.Identity;

public class User : IdentityUser<Guid> {

    
    public DateTimeOffset CreatedAt {get; set;} = DateTimeOffset.UtcNow;
    
    
    public ICollection<BoardMembership> BoardMemberships { get; set; } = new List<BoardMembership>();
    
    public User() {
        Id = Guid.NewGuid();
    }
        
    

}



namespace Lapis.Features.Board;

using Features.Notes;

public class Board
{
    public Guid Id {get; set;} = Guid.NewGuid();
    public string Title {get; set;} = string.Empty;
    public DateTimeOffset CreatedAt {get; set;} = DateTimeOffset.UtcNow;

    public ICollection<BoardMembership> Memberships { get; set; } = new List<BoardMembership>();
    public ICollection<Note> Notes { get; set; } = new List<Note>();

    
}

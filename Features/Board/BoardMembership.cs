namespace Lapis.Features.Board;

using Lapis.Features.Users;

public enum BoardRole
{
    Guest = 0,
    Owner = 1
}

public class BoardMembership
{
    public Guid BoardId { get; set; }
    public Board Board { get; set; } = null!;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public BoardRole Role { get; set; } = BoardRole.Guest;
    public bool CanEdit { get; set; }
}

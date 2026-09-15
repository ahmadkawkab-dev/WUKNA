namespace Lapis.Features.Board;

using Lapis.Features.Users;

public enum BoardRole
{
    Guest = 0,
    Owner = 1
}

public class BoardMembership
{
    // BoardId and UserId form the primary key, so one user has at most one role per board.
    public Guid BoardId { get; set; }
    public Board Board { get; set; } = null!;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public BoardRole Role { get; set; } = BoardRole.Guest;

    // This flag controls guest editing. Owners are always editable by definition.
    public bool CanEdit { get; set; }
}

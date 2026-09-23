namespace Wukna.Features.Board;

using Wukna.Shared.Data.AppDbContext;

/// <summary>Marks meaningful board mutations inside the caller's current save boundary.</summary>
public sealed class BoardActivity(TimeProvider timeProvider)
{
    public void Initialize(Board board)
    {
        var now = timeProvider.GetUtcNow();
        board.CreatedAt = now;
        board.UpdatedAt = now;
    }

    public void MarkUpdated(WuknaDbContext db, Guid boardId)
    {
        var board = db.Boards.Local.FirstOrDefault(candidate => candidate.Id == boardId);
        if (board is null)
        {
            board = new Board { Id = boardId };
            db.Boards.Attach(board);
        }

        board.UpdatedAt = timeProvider.GetUtcNow();
        db.Entry(board).Property(candidate => candidate.UpdatedAt).IsModified = true;
    }
}

namespace Lapis.Features.Board;

using Lapis.Features.Notes;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.EntityFrameworkCore;

/// <summary>Canonical persisted board-membership checks shared by realtime entry points.</summary>
public sealed class BoardAccess(LapisDbContext db)
{
    public Task<bool> CanAccessAsync(
        Guid userId,
        Guid boardId,
        CancellationToken cancellationToken = default) =>
        db.BoardMemberships.AsNoTracking().AnyAsync(
            membership => membership.BoardId == boardId && membership.UserId == userId,
            cancellationToken);

    public Task<bool> CanEditTopLevelNoteAsync(
        Guid userId,
        Guid boardId,
        Guid noteId,
        CancellationToken cancellationToken = default) =>
        db.Notes.AsNoTracking().AnyAsync(
            note => note.Id == noteId &&
                    note.BoardId == boardId &&
                    note.Kind != NoteKind.ChecklistItem &&
                    note.Board.Memberships.Any(membership =>
                        membership.UserId == userId &&
                        (membership.Role == BoardRole.Owner || membership.CanEdit)),
            cancellationToken);

}

namespace Wukna.Features.NoteConnection;

using System.IdentityModel.Tokens.Jwt;
using Wukna.Features.Board;
using Wukna.Features.Notes;
using Wukna.Features.Realtime;
using Wukna.Shared.Data.AppDbContext;
using Microsoft.EntityFrameworkCore;

public sealed record CreateNoteConnectionRequest(
    Guid SourceNoteId, Guid TargetNoteId, ConnectionType Type);

public sealed record NoteConnectionDto(
    Guid Id, Guid BoardId, Guid SourceNoteId, Guid TargetNoteId,
    ConnectionType Type, DateTimeOffset CreatedAt)
{
    public static NoteConnectionDto From(NoteConnection connection) => new(
        connection.Id, connection.BoardId, connection.SourceNoteId,
        connection.TargetNoteId, connection.Type, connection.CreatedAt);
}

public static class NoteConnectionEndpoints
{
    public static IEndpointRouteBuilder MapNoteConnectionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/boards/{boardId:guid}/connections")
            .RequireAuthorization();

        group.MapGet("/", async (Guid boardId, HttpContext context, WuknaDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();
            if (await GetAccessAsync(db, boardId, userId, cancellationToken) is null)
                return Results.NotFound();

            var connections = await db.NoteConnections.AsNoTracking()
                .Where(c => c.BoardId == boardId)
                .OrderBy(c => c.CreatedAt).ThenBy(c => c.Id)
                .ToListAsync(cancellationToken);
            return Results.Ok(connections.Select(NoteConnectionDto.From));
        });

        group.MapPost("/", async (Guid boardId, CreateNoteConnectionRequest request,
            HttpContext context, WuknaDbContext db, BoardActivity activity,
            BoardRealtimeDispatcher realtime,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();
            var canEdit = await GetAccessAsync(db, boardId, userId, cancellationToken);
            if (canEdit is null) return Results.NotFound();
            if (!canEdit.Value) return Results.Forbid();
            if (request.SourceNoteId == request.TargetNoteId ||
                request.Type is not (ConnectionType.Related or ConnectionType.Prerequisite))
                return Results.BadRequest(new { error = "invalid_connection" });

            var noteCount = await db.Notes.AsNoTracking().CountAsync(n =>
                n.BoardId == boardId && n.Kind != NoteKind.ChecklistItem &&
                (n.Id == request.SourceNoteId || n.Id == request.TargetNoteId),
                cancellationToken);
            if (noteCount != 2)
                return Results.BadRequest(new { error = "invalid_connection_notes" });

            if (await db.NoteConnections.AnyAsync(c => c.BoardId == boardId &&
                    c.SourceNoteId == request.SourceNoteId &&
                    c.TargetNoteId == request.TargetNoteId && c.Type == request.Type,
                    cancellationToken))
                return Results.Conflict(new { error = "connection_exists" });

            var connection = new NoteConnection
            {
                BoardId = boardId,
                SourceNoteId = request.SourceNoteId,
                TargetNoteId = request.TargetNoteId,
                Type = request.Type,
                Color = "#888888"
            };
            db.NoteConnections.Add(connection);
            activity.MarkUpdated(db, boardId);
            await db.SaveChangesAsync(cancellationToken);
            var response = NoteConnectionDto.From(connection);
            await realtime.ConnectionCreatedAsync(response);
            return Results.Created($"/api/boards/{boardId}/connections/{connection.Id}",
                response);
        });

        group.MapDelete("/{connectionId:guid}", async (Guid boardId, Guid connectionId,
            HttpContext context, WuknaDbContext db, BoardActivity activity,
            BoardRealtimeDispatcher realtime,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();
            var canEdit = await GetAccessAsync(db, boardId, userId, cancellationToken);
            if (canEdit is null) return Results.NotFound();
            if (!canEdit.Value) return Results.Forbid();

            var connection = await db.NoteConnections.SingleOrDefaultAsync(c =>
                c.BoardId == boardId && c.Id == connectionId, cancellationToken);
            if (connection is null) return Results.NotFound();
            db.NoteConnections.Remove(connection);
            activity.MarkUpdated(db, boardId);
            await db.SaveChangesAsync(cancellationToken);
            await realtime.ConnectionDeletedAsync(new ConnectionDeletedEvent(
                boardId, connectionId));
            return Results.NoContent();
        });

        return endpoints;
    }

    private static bool TryGetUserId(HttpContext context, out Guid userId) =>
        Guid.TryParse(context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, out userId);

    private static async Task<bool?> GetAccessAsync(WuknaDbContext db, Guid boardId,
        Guid userId, CancellationToken cancellationToken)
    {
        var membership = await db.BoardMemberships.AsNoTracking()
            .Where(m => m.BoardId == boardId && m.UserId == userId)
            .Select(m => new { m.Role, m.CanEdit })
            .SingleOrDefaultAsync(cancellationToken);
        return membership is null ? null : membership.Role == BoardRole.Owner || membership.CanEdit;
    }
}

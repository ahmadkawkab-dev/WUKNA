namespace Lapis.Features.Board;

using System.IdentityModel.Tokens.Jwt;
using Lapis.Features.Users;
using Lapis.Shared.Data.AppDbContext;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

public sealed record CreateBoardRequest(string Title);
public sealed record SetGuestAccessRequest(string Email, bool CanEdit);
public sealed record BoardSummaryDto(
    Guid Id,
    string Title,
    DateTimeOffset CreatedAt,
    BoardRole Role,
    bool CanEdit);

public static class BoardEndpoints
{
    public static IEndpointRouteBuilder MapBoardEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/boards").RequireAuthorization();

        group.MapGet("/", async (HttpContext context, LapisDbContext db, CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();

            var boards = await db.BoardMemberships.AsNoTracking()
                .Where(membership => membership.UserId == userId)
                .OrderByDescending(membership => membership.Board.CreatedAt)
                .Select(membership => new BoardSummaryDto(
                    membership.BoardId,
                    membership.Board.Title,
                    membership.Board.CreatedAt,
                    membership.Role,
                    membership.Role == BoardRole.Owner || membership.CanEdit))
                .ToListAsync(cancellationToken);
            return Results.Ok(boards);
        });

        group.MapGet("/{boardId:guid}", async (
            Guid boardId,
            HttpContext context,
            LapisDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();

            var board = await db.BoardMemberships.AsNoTracking()
                .Where(membership => membership.BoardId == boardId && membership.UserId == userId)
                .Select(membership => new BoardSummaryDto(
                    membership.BoardId,
                    membership.Board.Title,
                    membership.Board.CreatedAt,
                    membership.Role,
                    membership.Role == BoardRole.Owner || membership.CanEdit))
                .SingleOrDefaultAsync(cancellationToken);
            return board is null ? Results.NotFound() : Results.Ok(board);
        });

        group.MapPost("/", async (
            CreateBoardRequest request,
            HttpContext context,
            LapisDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();
            var title = request.Title?.Trim();
            if (string.IsNullOrWhiteSpace(title) || title.Length > 200)
                return Results.BadRequest(new { error = "Title must contain 1 to 200 characters." });

            var board = new Board { Title = title };
            board.Memberships.Add(new BoardMembership
            {
                UserId = userId,
                Role = BoardRole.Owner,
                CanEdit = true
            });
            db.Boards.Add(board);
            await db.SaveChangesAsync(cancellationToken);

            var response = new BoardSummaryDto(board.Id, board.Title, board.CreatedAt, BoardRole.Owner, true);
            return Results.Created($"/api/boards/{board.Id}", response);
        });

        group.MapPut("/{boardId:guid}/guests", async (
            Guid boardId,
            SetGuestAccessRequest request,
            HttpContext context,
            LapisDbContext db,
            UserManager<User> userManager,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();
            if (!await IsOwnerAsync(db, boardId, userId, cancellationToken)) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.Email))
                return Results.BadRequest(new { error = "Guest email is required." });

            var guest = await userManager.FindByEmailAsync(request.Email.Trim());
            if (guest is null) return Results.NotFound();

            var membership = await db.BoardMemberships.FindAsync(
                [boardId, guest.Id], cancellationToken);
            if (membership?.Role == BoardRole.Owner)
                return Results.Conflict(new { error = "The board owner cannot become a guest." });

            if (membership is null)
            {
                db.BoardMemberships.Add(new BoardMembership
                {
                    BoardId = boardId,
                    UserId = guest.Id,
                    Role = BoardRole.Guest,
                    CanEdit = request.CanEdit
                });
            }
            else
            {
                membership.CanEdit = request.CanEdit;
            }

            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        });

        group.MapDelete("/{boardId:guid}/guests/{guestId:guid}", async (
            Guid boardId,
            Guid guestId,
            HttpContext context,
            LapisDbContext db,
            CancellationToken cancellationToken) =>
        {
            if (!TryGetUserId(context, out var userId)) return Results.Unauthorized();
            if (!await IsOwnerAsync(db, boardId, userId, cancellationToken)) return Results.NotFound();

            var membership = await db.BoardMemberships.FindAsync(
                [boardId, guestId], cancellationToken);
            if (membership is null || membership.Role != BoardRole.Guest)
                return Results.NotFound();

            db.BoardMemberships.Remove(membership);
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        });

        return endpoints;
    }

    private static bool TryGetUserId(HttpContext context, out Guid userId) =>
        Guid.TryParse(context.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, out userId);

    private static Task<bool> IsOwnerAsync(
        LapisDbContext db,
        Guid boardId,
        Guid userId,
        CancellationToken cancellationToken) =>
        db.BoardMemberships.AnyAsync(
            membership => membership.BoardId == boardId &&
                          membership.UserId == userId &&
                          membership.Role == BoardRole.Owner,
            cancellationToken);
}

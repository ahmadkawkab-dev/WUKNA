namespace Wukna.IntegrationTests;

using System.Net;
using System.Net.Http.Headers;
using Wukna.Features.Auth;
using Wukna.Features.Board;
using Wukna.Features.NoteConnection;
using Wukna.Features.Notes;
using Wukna.Features.Users;
using Microsoft.EntityFrameworkCore;
using Xunit;

public sealed class BoardDeleteEndpointTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Only_owner_can_delete_board_with_checklist_and_connections()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var owner = User("delete-owner@wukna.test");
        var guest = User("delete-guest@wukna.test");
        var board = new Board { Title = "Delete this board" };
        board.Memberships.Add(new BoardMembership
        {
            User = owner, Role = BoardRole.Owner, CanEdit = true
        });
        board.Memberships.Add(new BoardMembership
        {
            User = guest, Role = BoardRole.Guest, CanEdit = true
        });
        var preserved = new Board { Title = "Keep this board" };
        preserved.Memberships.Add(new BoardMembership
        {
            User = owner, Role = BoardRole.Owner, CanEdit = true
        });
        var taskList = new Note
        {
            Board = board, Kind = NoteKind.List, Title = "Tasks",
            PositionX = 0, PositionY = 0
        };
        var note = new Note
        {
            Board = board, Kind = NoteKind.Standalone, Title = "Note",
            PositionX = 320, PositionY = 0
        };
        var item = new Note
        {
            Board = board, Kind = NoteKind.ChecklistItem, ParentNote = taskList,
            Title = "Task item"
        };
        var connection = new NoteConnection
        {
            BoardId = board.Id, SourceNote = note, TargetNote = taskList
        };

        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(owner, guest);
            db.Boards.AddRange(board, preserved);
            db.Notes.AddRange(taskList, note, item);
            db.NoteConnections.Add(connection);
            await db.SaveChangesAsync(cancellationToken);
        }

        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = new WuknaWebApplicationFactory(postgres, clock);
        using var guestClient = factory.CreateClient();
        guestClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", AccessToken(guest, clock));
        using var denied = await guestClient.DeleteAsync(
            $"/api/boards/{board.Id}", cancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);

        using var ownerClient = factory.CreateClient();
        ownerClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", AccessToken(owner, clock));
        using var deleted = await ownerClient.DeleteAsync(
            $"/api/boards/{board.Id}", cancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        await using var check = postgres.CreateContext();
        Assert.False(await check.Boards.AnyAsync(candidate => candidate.Id == board.Id, cancellationToken));
        Assert.True(await check.Boards.AnyAsync(candidate => candidate.Id == preserved.Id, cancellationToken));
        Assert.False(await check.BoardMemberships.AnyAsync(candidate => candidate.BoardId == board.Id, cancellationToken));
        Assert.False(await check.Notes.AnyAsync(candidate => candidate.BoardId == board.Id, cancellationToken));
        Assert.False(await check.NoteConnections.AnyAsync(candidate => candidate.BoardId == board.Id, cancellationToken));
        using var missing = await guestClient.GetAsync($"/api/boards/{board.Id}", cancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    private static string AccessToken(User user, TimeProvider clock) =>
        new JwtTokenGenerator(new JwtOptions
        {
            Issuer = WuknaWebApplicationFactory.JwtIssuer,
            Audience = WuknaWebApplicationFactory.JwtAudience,
            SigningKey = WuknaWebApplicationFactory.JwtSigningKey,
            AccessTokenMinutes = 60,
            RefreshTokenDays = 7
        }, clock).CreateAccessToken(user).Token;

    private static User User(string email) => new()
    {
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        EmailConfirmed = true
    };
}

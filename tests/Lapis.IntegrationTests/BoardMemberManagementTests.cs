namespace Lapis.IntegrationTests;

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Lapis.Features.Auth;
using Lapis.Features.Board;
using Lapis.Features.Users;
using Microsoft.EntityFrameworkCore;
using Xunit;

public sealed class BoardMemberManagementTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Owner_manages_guest_permissions_while_guests_and_owner_membership_remain_protected()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var owner = User("manage-owner@wukna.test");
        var editor = User("manage-editor@wukna.test");
        var viewer = User("manage-viewer@wukna.test");
        var board = new Board { Title = "Member permissions" };
        board.Memberships.Add(new BoardMembership { User = owner, Role = BoardRole.Owner, CanEdit = true });
        board.Memberships.Add(new BoardMembership { User = editor, Role = BoardRole.Guest, CanEdit = true });
        board.Memberships.Add(new BoardMembership { User = viewer, Role = BoardRole.Guest, CanEdit = false });
        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(owner, editor, viewer);
            db.Boards.Add(board);
            await db.SaveChangesAsync(cancellationToken);
        }

        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = new WuknaWebApplicationFactory(postgres, clock);
        using var ownerClient = Client(factory, owner, clock);
        using var editorClient = Client(factory, editor, clock);
        using var viewerClient = Client(factory, viewer, clock);

        using (var deniedRole = await editorClient.PatchAsJsonAsync(
            $"/api/boards/{board.Id}/members/{viewer.Id}", new { canEdit = true }, cancellationToken))
            Assert.Equal(HttpStatusCode.Forbidden, deniedRole.StatusCode);
        using (var deniedRemoval = await viewerClient.DeleteAsync(
            $"/api/boards/{board.Id}/guests/{editor.Id}", cancellationToken))
            Assert.Equal(HttpStatusCode.Forbidden, deniedRemoval.StatusCode);
        using (var protectedRole = await ownerClient.PatchAsJsonAsync(
            $"/api/boards/{board.Id}/members/{owner.Id}", new { canEdit = false }, cancellationToken))
            Assert.Equal(HttpStatusCode.Conflict, protectedRole.StatusCode);
        using (var protectedRemoval = await ownerClient.DeleteAsync(
            $"/api/boards/{board.Id}/guests/{owner.Id}", cancellationToken))
            Assert.Equal(HttpStatusCode.Conflict, protectedRemoval.StatusCode);

        using (var downgrade = await ownerClient.PatchAsJsonAsync(
            $"/api/boards/{board.Id}/members/{editor.Id}", new { canEdit = false }, cancellationToken))
            Assert.Equal(HttpStatusCode.NoContent, downgrade.StatusCode);
        var downgraded = await editorClient.GetFromJsonAsync<BoardDetailDto>(
            $"/api/boards/{board.Id}", cancellationToken);
        Assert.NotNull(downgraded);
        Assert.False(downgraded.CanEdit);
        using (var blockedEdit = await editorClient.PostAsJsonAsync(
            $"/api/boards/{board.Id}/notes",
            new { kind = 0, title = "Unauthorized", positionX = 0, positionY = 0 }, cancellationToken))
            Assert.Equal(HttpStatusCode.Forbidden, blockedEdit.StatusCode);

        using (var upgrade = await ownerClient.PatchAsJsonAsync(
            $"/api/boards/{board.Id}/members/{viewer.Id}", new { canEdit = true }, cancellationToken))
            Assert.Equal(HttpStatusCode.NoContent, upgrade.StatusCode);
        await using (var check = postgres.CreateContext())
        {
            Assert.False((await check.BoardMemberships.SingleAsync(
                candidate => candidate.BoardId == board.Id && candidate.UserId == editor.Id,
                cancellationToken)).CanEdit);
            Assert.True((await check.BoardMemberships.SingleAsync(
                candidate => candidate.BoardId == board.Id && candidate.UserId == viewer.Id,
                cancellationToken)).CanEdit);
        }

        using (var removal = await ownerClient.DeleteAsync(
            $"/api/boards/{board.Id}/guests/{editor.Id}", cancellationToken))
            Assert.Equal(HttpStatusCode.NoContent, removal.StatusCode);
        using (var revoked = await editorClient.GetAsync($"/api/boards/{board.Id}", cancellationToken))
            Assert.Equal(HttpStatusCode.NotFound, revoked.StatusCode);
        await using var final = postgres.CreateContext();
        Assert.False(await final.BoardMemberships.AnyAsync(
            candidate => candidate.BoardId == board.Id && candidate.UserId == editor.Id,
            cancellationToken));
        Assert.True(await final.BoardMemberships.AnyAsync(
            candidate => candidate.BoardId == board.Id && candidate.UserId == owner.Id,
            cancellationToken));
    }

    private static HttpClient Client(WuknaWebApplicationFactory factory, User user, TimeProvider clock)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", new JwtTokenGenerator(new JwtOptions
            {
                Issuer = WuknaWebApplicationFactory.JwtIssuer,
                Audience = WuknaWebApplicationFactory.JwtAudience,
                SigningKey = WuknaWebApplicationFactory.JwtSigningKey,
                AccessTokenMinutes = 60,
                RefreshTokenDays = 7
            }, clock).CreateAccessToken(user).Token);
        return client;
    }

    private static User User(string email) => new()
    {
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        EmailConfirmed = true
    };
}

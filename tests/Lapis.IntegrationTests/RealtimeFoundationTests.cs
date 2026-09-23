namespace Lapis.IntegrationTests;

using System.Net;
using Lapis.Features.Auth;
using Lapis.Features.Board;
using Lapis.Features.Realtime;
using Lapis.Features.Users;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

public sealed class RealtimeFoundationTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Hub_requires_authentication_and_authorizes_board_groups_from_membership()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        var owner = User("realtime-owner@wukna.test");
        var unrelated = User("realtime-unrelated@wukna.test");
        var board = new Board
        {
            Title = "Realtime foundation",
            CreatedAt = clock.GetUtcNow(),
            UpdatedAt = clock.GetUtcNow()
        };
        board.Memberships.Add(new BoardMembership
        {
            User = owner,
            Role = BoardRole.Owner,
            CanEdit = true
        });

        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(owner, unrelated);
            db.Boards.Add(board);
            await db.SaveChangesAsync(cancellationToken);
        }

        await using var factory = new WuknaWebApplicationFactory(postgres, clock);

        using (var apiClient = factory.CreateClient())
        {
            using var response = await apiClient.GetAsync(
                $"/api/boards?access_token={Uri.EscapeDataString(AccessToken(owner, clock))}",
                cancellationToken);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        await using (var unauthenticated = Connection(factory, null))
        {
            await Assert.ThrowsAnyAsync<Exception>(
                () => unauthenticated.StartAsync(cancellationToken));
        }

        await using (var denied = Connection(factory, AccessToken(unrelated, clock)))
        {
            await denied.StartAsync(cancellationToken);
            var exception = await Assert.ThrowsAsync<HubException>(
                () => denied.InvokeAsync("JoinBoard", board.Id, cancellationToken));
            Assert.Contains("Forbidden", exception.Message, StringComparison.Ordinal);
        }

        await using var authorized = Connection(factory, AccessToken(owner, clock));
        var boardMessage = new TaskCompletionSource<string>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var userMessage = new TaskCompletionSource<string>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var revokedMessage = new TaskCompletionSource<BoardAccessRevokedEvent>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var messageAfterRevocation = new TaskCompletionSource<string>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        authorized.On<string>("FoundationBoardProbe", boardMessage.SetResult);
        authorized.On<string>("FoundationUserProbe", userMessage.SetResult);
        authorized.On<BoardAccessRevokedEvent>(
            BoardRealtimeEvents.BoardAccessRevoked, revokedMessage.SetResult);
        authorized.On<string>("AfterRevocationProbe", messageAfterRevocation.SetResult);
        await authorized.StartAsync(cancellationToken);
        await authorized.InvokeAsync("JoinBoard", board.Id, cancellationToken);

        var publisher = factory.Services.GetRequiredService<IBoardRealtimePublisher>();
        await publisher.PublishBoardAsync(
            board.Id, "FoundationBoardProbe", "board", cancellationToken);
        await publisher.PublishUsersAsync(
            [owner.Id], "FoundationUserProbe", "user", cancellationToken);

        Assert.Equal("board", await boardMessage.Task.WaitAsync(
            TimeSpan.FromSeconds(5), cancellationToken));
        Assert.Equal("user", await userMessage.Task.WaitAsync(
            TimeSpan.FromSeconds(5), cancellationToken));

        await publisher.RevokeBoardAccessAsync(board.Id, owner.Id, cancellationToken);
        Assert.Equal(board.Id, (await revokedMessage.Task.WaitAsync(
            TimeSpan.FromSeconds(5), cancellationToken)).BoardId);
        await publisher.PublishBoardAsync(
            board.Id, "AfterRevocationProbe", "must-not-arrive", cancellationToken);
        await Assert.ThrowsAsync<TimeoutException>(() =>
            messageAfterRevocation.Task.WaitAsync(TimeSpan.FromMilliseconds(500), cancellationToken));
    }

    private static HubConnection Connection(
        WuknaWebApplicationFactory factory,
        string? accessToken)
    {
        _ = factory.Server;
        return new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, BoardHub.Path), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                if (accessToken is not null)
                    options.AccessTokenProvider = () => Task.FromResult<string?>(accessToken);
            })
            .Build();
    }

    private static string AccessToken(User user, TimeProvider clock)
    {
        var options = new JwtOptions
        {
            Issuer = WuknaWebApplicationFactory.JwtIssuer,
            Audience = WuknaWebApplicationFactory.JwtAudience,
            SigningKey = WuknaWebApplicationFactory.JwtSigningKey,
            AccessTokenMinutes = 60
        };
        return new JwtTokenGenerator(options, clock).CreateAccessToken(user).Token;
    }

    private static User User(string email) => new()
    {
        Id = Guid.NewGuid(),
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        UserName = email,
        NormalizedUserName = email.ToUpperInvariant(),
        SecurityStamp = Guid.NewGuid().ToString("N")
    };
}

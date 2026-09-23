namespace Lapis.IntegrationTests;

using System.Threading.Channels;
using Lapis.Features.Auth;
using Lapis.Features.Board;
using Lapis.Features.Realtime;
using Lapis.Features.Users;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

public sealed class PresenceTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Presence_is_connection_based_aggregated_revisioned_and_lifecycle_clean()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        var owner = User("presence-owner@wukna.test");
        var editor = User("presence-editor@wukna.test");
        var passiveMember = User("presence-passive@wukna.test");
        var board = new Board
        {
            Title = "Presence lifecycle",
            CreatedAt = clock.GetUtcNow(),
            UpdatedAt = clock.GetUtcNow()
        };
        board.Memberships.Add(new BoardMembership
        {
            User = owner,
            Role = BoardRole.Owner,
            CanEdit = true
        });
        board.Memberships.Add(new BoardMembership
        {
            User = editor,
            Role = BoardRole.Guest,
            CanEdit = true
        });
        board.Memberships.Add(new BoardMembership
        {
            User = passiveMember,
            Role = BoardRole.Guest,
            CanEdit = false
        });
        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(owner, editor, passiveMember);
            db.Boards.Add(board);
            await db.SaveChangesAsync(cancellationToken);
        }
        DateTimeOffset originalUpdatedAt;
        await using (var baseline = postgres.CreateContext())
        {
            originalUpdatedAt = await baseline.Boards.AsNoTracking()
                .Where(candidate => candidate.Id == board.Id)
                .Select(candidate => candidate.UpdatedAt)
                .SingleAsync(cancellationToken);
        }

        await using var factory = new WuknaWebApplicationFactory(postgres, clock);
        await using var ownerTabOne = Connection(factory, AccessToken(owner, clock));
        await using var ownerTabTwo = Connection(factory, AccessToken(owner, clock));
        await using var editorTab = Connection(factory, AccessToken(editor, clock));
        await using var passiveTab = Connection(factory, AccessToken(passiveMember, clock));
        var ownerEvents = Channel.CreateUnbounded<BoardPresenceSnapshot>();
        var editorEvents = Channel.CreateUnbounded<BoardPresenceSnapshot>();
        var passiveEvent = new TaskCompletionSource<BoardPresenceSnapshot>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        ownerTabOne.On<BoardPresenceSnapshot>(
            BoardRealtimeEvents.BoardPresenceChanged,
            snapshot => ownerEvents.Writer.TryWrite(snapshot));
        editorTab.On<BoardPresenceSnapshot>(
            BoardRealtimeEvents.BoardPresenceChanged,
            snapshot => editorEvents.Writer.TryWrite(snapshot));
        passiveTab.On<BoardPresenceSnapshot>(
            BoardRealtimeEvents.BoardPresenceChanged,
            passiveEvent.SetResult);
        await Task.WhenAll(
            ownerTabOne.StartAsync(cancellationToken),
            ownerTabTwo.StartAsync(cancellationToken),
            editorTab.StartAsync(cancellationToken),
            passiveTab.StartAsync(cancellationToken));

        var ownerOneJoined = await ownerTabOne.InvokeAsync<BoardPresenceSnapshot>(
            "JoinBoard", board.Id, cancellationToken);
        AssertViewer(ownerOneJoined, owner.Id, 1);
        Assert.DoesNotContain(ownerOneJoined.Viewers, viewer => viewer.UserId == passiveMember.Id);

        var ownerTwoJoined = await ownerTabTwo.InvokeAsync<BoardPresenceSnapshot>(
            "JoinBoard", board.Id, cancellationToken);
        AssertViewer(ownerTwoJoined, owner.Id, 2);
        Assert.Equal(ownerTwoJoined.Revision, (await Read(ownerEvents)).Revision);

        var editorJoined = await editorTab.InvokeAsync<BoardPresenceSnapshot>(
            "JoinBoard", board.Id, cancellationToken);
        AssertViewer(editorJoined, owner.Id, 2);
        AssertViewer(editorJoined, editor.Id, 1);
        Assert.True(editorJoined.Revision > ownerTwoJoined.Revision);
        Assert.Equal(editorJoined.Revision, (await Read(ownerEvents)).Revision);

        await ownerTabTwo.InvokeAsync("LeaveBoard", board.Id, cancellationToken);
        var oneOwnerTabLeft = await Read(ownerEvents);
        AssertViewer(oneOwnerTabLeft, owner.Id, 1);
        AssertViewer(oneOwnerTabLeft, editor.Id, 1);
        Assert.Equal(oneOwnerTabLeft.Revision, (await Read(editorEvents)).Revision);

        await ownerTabOne.StopAsync(cancellationToken);
        var ownerDisconnected = await Read(editorEvents);
        Assert.DoesNotContain(ownerDisconnected.Viewers, viewer => viewer.UserId == owner.Id);
        AssertViewer(ownerDisconnected, editor.Id, 1);

        await using var ownerPhone = Connection(factory, AccessToken(owner, clock));
        var phoneEvents = Channel.CreateUnbounded<BoardPresenceSnapshot>();
        ownerPhone.On<BoardPresenceSnapshot>(
            BoardRealtimeEvents.BoardPresenceChanged,
            snapshot => phoneEvents.Writer.TryWrite(snapshot));
        await ownerPhone.StartAsync(cancellationToken);
        var ownerRejoined = await ownerPhone.InvokeAsync<BoardPresenceSnapshot>(
            "JoinBoard", board.Id, cancellationToken);
        AssertViewer(ownerRejoined, owner.Id, 1);
        AssertViewer(ownerRejoined, editor.Id, 1);

        var publisher = factory.Services.GetRequiredService<IBoardRealtimePublisher>();
        await publisher.RevokeBoardAccessAsync(board.Id, editor.Id, cancellationToken);
        var editorRevoked = await Read(phoneEvents);
        AssertViewer(editorRevoked, owner.Id, 1);
        Assert.DoesNotContain(editorRevoked.Viewers, viewer => viewer.UserId == editor.Id);

        await Assert.ThrowsAsync<TimeoutException>(() =>
            passiveEvent.Task.WaitAsync(TimeSpan.FromMilliseconds(300), cancellationToken));
        await using var verification = postgres.CreateContext();
        Assert.Equal(originalUpdatedAt, await verification.Boards.AsNoTracking()
            .Where(candidate => candidate.Id == board.Id)
            .Select(candidate => candidate.UpdatedAt)
            .SingleAsync(cancellationToken));

        Task<BoardPresenceSnapshot> Read(Channel<BoardPresenceSnapshot> channel) =>
            channel.Reader.ReadAsync(cancellationToken).AsTask()
                .WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
    }

    private static void AssertViewer(
        BoardPresenceSnapshot snapshot,
        Guid userId,
        int connectionCount) =>
        Assert.Equal(connectionCount, snapshot.Viewers.Single(viewer =>
            viewer.UserId == userId).ConnectionCount);

    private static HubConnection Connection(
        WuknaWebApplicationFactory factory,
        string accessToken)
    {
        _ = factory.Server;
        return new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, BoardHub.Path), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
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

namespace Wukna.IntegrationTests;

using System.Threading.Channels;
using Wukna.Features.Auth;
using Wukna.Features.Board;
using Wukna.Features.Notes;
using Wukna.Features.Realtime;
using Wukna.Features.Users;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

public sealed class EditingIndicatorTests(PostgresFixture postgres)
{
    [Fact]
    public async Task Editing_is_authorized_sequenced_ephemeral_and_lifecycle_clean()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        await postgres.ResetAsync(cancellationToken);
        var clock = new ManualTimeProvider(DateTimeOffset.UtcNow);
        var owner = User("editing-owner@wukna.test");
        var editor = User("editing-editor@wukna.test");
        var viewer = User("editing-viewer@wukna.test");
        var ownerToken = AccessToken(owner, clock);
        var editorToken = AccessToken(editor, clock);
        var viewerToken = AccessToken(viewer, clock);
        var board = new Board
        {
            Title = "Editing awareness",
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
            User = viewer,
            Role = BoardRole.Guest,
            CanEdit = false
        });
        var note = new Note
        {
            Board = board,
            Kind = NoteKind.Standalone,
            Title = "Edit me",
            PositionX = 20,
            PositionY = 30
        };
        await using (var db = postgres.CreateContext())
        {
            db.Users.AddRange(owner, editor, viewer);
            db.Notes.Add(note);
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
        await using var sender = Connection(factory, editorToken);
        await using var receiver = Connection(factory, ownerToken);
        var started = Channel.CreateUnbounded<NoteEditingStartedEvent>();
        var stopped = Channel.CreateUnbounded<NoteEditingStoppedEvent>();
        var summary = new TaskCompletionSource<BoardListItemDto>(
            TaskCreationOptions.RunContinuationsAsynchronously);
        receiver.On<NoteEditingStartedEvent>(
            BoardRealtimeEvents.NoteEditingStarted,
            message => started.Writer.TryWrite(message));
        receiver.On<NoteEditingStoppedEvent>(
            BoardRealtimeEvents.NoteEditingStopped,
            message => stopped.Writer.TryWrite(message));
        receiver.On<BoardListItemDto>(
            BoardRealtimeEvents.BoardSummaryChanged,
            summary.SetResult);
        await sender.StartAsync(cancellationToken);
        await receiver.StartAsync(cancellationToken);
        await sender.InvokeAsync("JoinBoard", board.Id, cancellationToken);
        await receiver.InvokeAsync("JoinBoard", board.Id, cancellationToken);

        await sender.InvokeAsync(
            "StartNoteEditing",
            new StartNoteEditingRequest(board.Id, note.Id, 1),
            cancellationToken);
        var first = await ReadStarted();
        Assert.Equal(editor.Id, first.UserId);
        Assert.NotEmpty(first.ConnectionId);
        Assert.Equal(clock.GetUtcNow() + NoteEditingRegistry.Lifetime, first.ExpiresAt);

        await sender.InvokeAsync(
            "StartNoteEditing",
            new StartNoteEditingRequest(board.Id, note.Id, 1),
            cancellationToken);
        await Task.Delay(TimeSpan.FromMilliseconds(250), cancellationToken);
        Assert.False(started.Reader.TryRead(out _));

        clock.Advance(TimeSpan.FromSeconds(3));
        await sender.InvokeAsync(
            "StartNoteEditing",
            new StartNoteEditingRequest(board.Id, note.Id, 2),
            cancellationToken);
        var renewed = await ReadStarted();
        Assert.Equal(2, renewed.Sequence);
        Assert.Equal(clock.GetUtcNow() + NoteEditingRegistry.Lifetime, renewed.ExpiresAt);

        await using var notSubscribed = Connection(factory, editorToken);
        await notSubscribed.StartAsync(cancellationToken);
        var subscriptionError = await Assert.ThrowsAsync<HubException>(() =>
            notSubscribed.InvokeAsync(
                "StartNoteEditing",
                new StartNoteEditingRequest(board.Id, note.Id, 3),
                cancellationToken));
        Assert.Contains("subscription", subscriptionError.Message, StringComparison.OrdinalIgnoreCase);

        await using var readOnly = Connection(factory, viewerToken);
        await readOnly.StartAsync(cancellationToken);
        await readOnly.InvokeAsync("JoinBoard", board.Id, cancellationToken);
        var permissionError = await Assert.ThrowsAsync<HubException>(() =>
            readOnly.InvokeAsync(
                "StartNoteEditing",
                new StartNoteEditingRequest(board.Id, note.Id, 1),
                cancellationToken));
        Assert.Contains("Forbidden", permissionError.Message, StringComparison.Ordinal);

        await sender.InvokeAsync(
            "StopNoteEditing",
            new StopNoteEditingRequest(board.Id, note.Id, 3),
            cancellationToken);
        Assert.Equal(3, (await ReadStopped()).Sequence);

        await sender.InvokeAsync(
            "StartNoteEditing",
            new StartNoteEditingRequest(board.Id, note.Id, 4),
            cancellationToken);
        _ = await ReadStarted();
        await sender.InvokeAsync("LeaveBoard", board.Id, cancellationToken);
        Assert.Equal(4, (await ReadStopped()).Sequence);

        await sender.InvokeAsync("JoinBoard", board.Id, cancellationToken);
        await sender.InvokeAsync(
            "StartNoteEditing",
            new StartNoteEditingRequest(board.Id, note.Id, 5),
            cancellationToken);
        _ = await ReadStarted();
        await sender.StopAsync(cancellationToken);
        Assert.Equal(5, (await ReadStopped()).Sequence);

        await using var revoked = Connection(factory, editorToken);
        await revoked.StartAsync(cancellationToken);
        await revoked.InvokeAsync("JoinBoard", board.Id, cancellationToken);
        await revoked.InvokeAsync(
            "StartNoteEditing",
            new StartNoteEditingRequest(board.Id, note.Id, 1),
            cancellationToken);
        _ = await ReadStarted();
        var publisher = factory.Services.GetRequiredService<IBoardRealtimePublisher>();
        await publisher.RevokeBoardAccessAsync(board.Id, editor.Id, cancellationToken);
        Assert.Equal(1, (await ReadStopped()).Sequence);

        await using var expiring = Connection(factory, editorToken);
        await expiring.StartAsync(cancellationToken);
        await expiring.InvokeAsync("JoinBoard", board.Id, cancellationToken);
        await expiring.InvokeAsync(
            "StartNoteEditing",
            new StartNoteEditingRequest(board.Id, note.Id, 1),
            cancellationToken);
        _ = await ReadStarted();
        clock.Advance(NoteEditingRegistry.Lifetime + TimeSpan.FromSeconds(1));
        Assert.Equal(1, (await ReadStopped()).Sequence);

        await Assert.ThrowsAsync<TimeoutException>(() =>
            summary.Task.WaitAsync(TimeSpan.FromMilliseconds(300), cancellationToken));
        await using var verification = postgres.CreateContext();
        Assert.Equal(originalUpdatedAt, await verification.Boards.AsNoTracking()
            .Where(candidate => candidate.Id == board.Id)
            .Select(candidate => candidate.UpdatedAt)
            .SingleAsync(cancellationToken));

        Task<NoteEditingStartedEvent> ReadStarted() =>
            started.Reader.ReadAsync(cancellationToken).AsTask()
                .WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
        Task<NoteEditingStoppedEvent> ReadStopped() =>
            stopped.Reader.ReadAsync(cancellationToken).AsTask()
                .WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
    }

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

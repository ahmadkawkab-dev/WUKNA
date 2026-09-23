namespace Wukna.IntegrationTests;

using Wukna.Features.Realtime;
using Xunit;

public sealed class BoardCursorRegistryTests
{
    [Fact]
    public void Cursor_leases_reject_stale_messages_and_clean_every_lifecycle_scope()
    {
        var registry = new BoardCursorRegistry();
        var now = DateTimeOffset.UtcNow;
        var boardA = Guid.NewGuid();
        var boardB = Guid.NewGuid();
        var userId = Guid.NewGuid();

        Assert.NotNull(registry.Move(Moved(boardA, userId, "one", 1, now)));
        Assert.Null(registry.Move(Moved(boardA, userId, "one", 1, now)));
        Assert.Null(registry.Stop(boardA, "one", 0, now));
        Assert.NotNull(registry.Stop(boardA, "one", 2, now));
        Assert.Null(registry.Move(Moved(boardA, userId, "one", 2, now)));
        Assert.NotNull(registry.Move(Moved(boardA, userId, "one", 3, now)));

        Assert.NotNull(registry.Move(Moved(boardB, userId, "one", 1, now)));
        Assert.Single(registry.EndBoard(boardA, "one"));
        Assert.Single(registry.EndConnection("one"));

        Assert.NotNull(registry.Move(Moved(boardA, userId, "two", 1, now)));
        var expired = registry.Expire(now + BoardCursorRegistry.Lifetime);
        Assert.Single(expired);
        Assert.Equal("two", expired[0].ConnectionId);
        Assert.Empty(registry.Expire(now + BoardCursorRegistry.Lifetime));
        Assert.Empty(registry.Expire(now + BoardCursorRegistry.Lifetime * 2));
    }

    private static BoardCursorMovedEvent Moved(
        Guid boardId,
        Guid userId,
        string connectionId,
        long sequence,
        DateTimeOffset now) => new(
            boardId,
            userId,
            connectionId,
            120,
            80,
            sequence,
            now + BoardCursorRegistry.Lifetime);
}

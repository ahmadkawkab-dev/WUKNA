namespace Lapis.IntegrationTests;

using Lapis.Features.Realtime;
using Xunit;

public sealed class BoardConnectionRegistryTests
{
    [Fact]
    public void Mutations_aggregate_connections_and_advance_one_board_revision_atomically()
    {
        var registry = new BoardConnectionRegistry();
        var boardId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        var first = registry.Add(boardId, userId, "tab-1");
        Assert.True(first.Changed);
        Assert.Equal(1, first.Snapshot.Revision);
        Assert.Equal(1, Assert.Single(first.Snapshot.Viewers).ConnectionCount);

        var second = registry.Add(boardId, userId, "tab-2");
        Assert.Equal(2, second.Snapshot.Revision);
        Assert.Equal(2, Assert.Single(second.Snapshot.Viewers).ConnectionCount);

        var duplicate = registry.Add(boardId, userId, "tab-2");
        Assert.False(duplicate.Changed);
        Assert.Equal(2, duplicate.Snapshot.Revision);

        var other = registry.Add(boardId, otherUserId, "phone");
        Assert.Equal(3, other.Snapshot.Revision);
        Assert.Equal(2, other.Snapshot.Viewers.Count);

        var oneTabClosed = registry.Remove(boardId, userId, "tab-1");
        Assert.Equal(4, oneTabClosed.Snapshot.Revision);
        Assert.Equal(1, oneTabClosed.Snapshot.Viewers.Single(viewer =>
            viewer.UserId == userId).ConnectionCount);

        var disconnected = Assert.Single(registry.RemoveConnection("tab-2"));
        Assert.Equal(5, disconnected.Revision);
        Assert.Equal(otherUserId, Assert.Single(disconnected.Viewers).UserId);

        var revoked = registry.RemoveUser(boardId, otherUserId);
        Assert.Equal(["phone"], revoked.ConnectionIds);
        Assert.Equal(6, revoked.Presence.Snapshot.Revision);
        Assert.Empty(revoked.Presence.Snapshot.Viewers);
    }

    [Fact]
    public void Concurrent_adds_return_unique_revisions_and_one_immutable_final_snapshot()
    {
        var registry = new BoardConnectionRegistry();
        var boardId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        var mutations = Enumerable.Range(1, 64)
            .AsParallel()
            .Select(index => registry.Add(boardId, userId, $"connection-{index}"))
            .ToArray();

        Assert.Equal(
            Enumerable.Range(1, 64).Select(value => (long)value).ToArray(),
            mutations.Select(mutation => mutation.Snapshot.Revision).Order().ToArray());
        var final = registry.Add(boardId, userId, "connection-1");
        Assert.False(final.Changed);
        Assert.Equal(64, final.Snapshot.Revision);
        Assert.Equal(64, Assert.Single(final.Snapshot.Viewers).ConnectionCount);
    }
}

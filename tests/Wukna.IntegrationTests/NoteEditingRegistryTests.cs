namespace Wukna.IntegrationTests;

using Wukna.Features.Realtime;
using Xunit;

public sealed class NoteEditingRegistryTests
{
    [Fact]
    public void Editing_leases_are_sequenced_stoppable_expiring_and_connection_scoped()
    {
        var registry = new NoteEditingRegistry();
        var now = DateTimeOffset.UtcNow;
        var boardId = Guid.NewGuid();
        var noteId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var first = new NoteEditingStartedEvent(
            boardId, noteId, userId, "tab-1", 1, now + NoteEditingRegistry.Lifetime);

        Assert.Equal(first, registry.Renew(first));
        Assert.Null(registry.Renew(first));
        var renewed = first with
        {
            Sequence = 2,
            ExpiresAt = now + NoteEditingRegistry.Lifetime + TimeSpan.FromSeconds(3)
        };
        Assert.Equal(renewed, registry.Renew(renewed));
        Assert.Null(registry.Stop(boardId, noteId, "tab-1", 1, now));

        var stopped = registry.Stop(boardId, noteId, "tab-1", 3, now);
        Assert.NotNull(stopped);
        Assert.Equal(3, stopped.Sequence);
        Assert.Null(registry.Renew(first with { Sequence = 3 }));
        Assert.NotNull(registry.Renew(first with
        {
            Sequence = 4,
            ExpiresAt = now + NoteEditingRegistry.Lifetime
        }));

        Assert.Empty(registry.Expire(now + TimeSpan.FromSeconds(6)));
        var expired = Assert.Single(registry.Expire(now + TimeSpan.FromSeconds(8)));
        Assert.Equal(userId, expired.UserId);
        Assert.Equal(4, expired.Sequence);
        Assert.Empty(registry.Expire(now + TimeSpan.FromSeconds(9)));

        var otherNote = Guid.NewGuid();
        registry.Renew(new NoteEditingStartedEvent(
            boardId, otherNote, userId, "tab-1", 5, now + NoteEditingRegistry.Lifetime));
        Assert.Single(registry.EndBoard(boardId, "tab-1"));
        Assert.Empty(registry.EndConnection("tab-1"));
    }
}

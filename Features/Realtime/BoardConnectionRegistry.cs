namespace Lapis.Features.Realtime;

using System.Collections.Concurrent;

public sealed record BoardPresenceViewer(Guid UserId, int ConnectionCount);

public sealed record BoardPresenceSnapshot(
    Guid BoardId,
    long Revision,
    IReadOnlyList<BoardPresenceViewer> Viewers);

public sealed record BoardConnectionMutation(
    bool Changed,
    BoardPresenceSnapshot Snapshot);

public sealed record BoardUserConnectionRemoval(
    IReadOnlyCollection<string> ConnectionIds,
    BoardConnectionMutation Presence);

public interface IBoardConnectionRegistry
{
    BoardConnectionMutation Add(Guid boardId, Guid userId, string connectionId);
    BoardConnectionMutation Remove(Guid boardId, Guid userId, string connectionId);
    IReadOnlyList<BoardPresenceSnapshot> RemoveConnection(string connectionId);
    BoardUserConnectionRemoval RemoveUser(Guid boardId, Guid userId);
    bool Contains(Guid boardId, Guid userId, string connectionId);
    IReadOnlyCollection<string> GetConnections(Guid boardId, Guid userId);
    IReadOnlyCollection<string> GetConnections(Guid boardId);
}

public sealed class BoardConnectionRegistry : IBoardConnectionRegistry
{
    private readonly ConcurrentDictionary<Guid, BoardConnections> boards = new();

    public BoardConnectionMutation Add(Guid boardId, Guid userId, string connectionId) =>
        State(boardId).Add(userId, connectionId);

    public BoardConnectionMutation Remove(Guid boardId, Guid userId, string connectionId) =>
        State(boardId).Remove(userId, connectionId);

    public IReadOnlyList<BoardPresenceSnapshot> RemoveConnection(string connectionId)
    {
        var snapshots = new List<BoardPresenceSnapshot>();
        foreach (var state in boards.Values)
        {
            var mutation = state.RemoveConnection(connectionId);
            if (mutation.Changed) snapshots.Add(mutation.Snapshot);
        }
        return snapshots;
    }

    public BoardUserConnectionRemoval RemoveUser(Guid boardId, Guid userId) =>
        State(boardId).RemoveUser(userId);

    public bool Contains(Guid boardId, Guid userId, string connectionId) =>
        boards.TryGetValue(boardId, out var state) && state.Contains(userId, connectionId);

    public IReadOnlyCollection<string> GetConnections(Guid boardId, Guid userId) =>
        boards.TryGetValue(boardId, out var state) ? state.GetConnections(userId) : [];

    public IReadOnlyCollection<string> GetConnections(Guid boardId) =>
        boards.TryGetValue(boardId, out var state) ? state.GetConnections() : [];

    private BoardConnections State(Guid boardId) =>
        boards.GetOrAdd(boardId, static id => new BoardConnections(id));

    private sealed class BoardConnections(Guid boardId)
    {
        private readonly object gate = new();
        private readonly Dictionary<Guid, HashSet<string>> connections = new();
        private long revision;

        public BoardConnectionMutation Add(Guid userId, string connectionId)
        {
            lock (gate)
            {
                if (!connections.TryGetValue(userId, out var userConnections))
                {
                    userConnections = new HashSet<string>(StringComparer.Ordinal);
                    connections.Add(userId, userConnections);
                }
                var changed = userConnections.Add(connectionId);
                if (changed) revision++;
                return new BoardConnectionMutation(changed, Snapshot());
            }
        }

        public BoardConnectionMutation Remove(Guid userId, string connectionId)
        {
            lock (gate)
            {
                var changed = connections.TryGetValue(userId, out var userConnections) &&
                    userConnections.Remove(connectionId);
                if (changed)
                {
                    if (userConnections!.Count == 0) connections.Remove(userId);
                    revision++;
                }
                return new BoardConnectionMutation(changed, Snapshot());
            }
        }

        public BoardConnectionMutation RemoveConnection(string connectionId)
        {
            lock (gate)
            {
                var changed = false;
                foreach (var userId in connections.Keys.ToArray())
                {
                    var userConnections = connections[userId];
                    if (!userConnections.Remove(connectionId)) continue;
                    changed = true;
                    if (userConnections.Count == 0) connections.Remove(userId);
                }
                if (changed) revision++;
                return new BoardConnectionMutation(changed, Snapshot());
            }
        }

        public BoardUserConnectionRemoval RemoveUser(Guid userId)
        {
            lock (gate)
            {
                if (!connections.Remove(userId, out var removed))
                    return new BoardUserConnectionRemoval(
                        [],
                        new BoardConnectionMutation(false, Snapshot()));
                revision++;
                return new BoardUserConnectionRemoval(
                    removed.ToArray(),
                    new BoardConnectionMutation(true, Snapshot()));
            }
        }

        public bool Contains(Guid userId, string connectionId)
        {
            lock (gate)
                return connections.TryGetValue(userId, out var userConnections) &&
                    userConnections.Contains(connectionId);
        }

        public IReadOnlyCollection<string> GetConnections(Guid userId)
        {
            lock (gate)
                return connections.TryGetValue(userId, out var userConnections)
                    ? userConnections.ToArray()
                    : [];
        }

        public IReadOnlyCollection<string> GetConnections()
        {
            lock (gate)
                return connections.Values.SelectMany(value => value).ToArray();
        }

        // Called only while holding gate, so mutation, revision, and immutable aggregate are one
        // atomic registry operation.
        private BoardPresenceSnapshot Snapshot() => new(
            boardId,
            revision,
            connections
                .OrderBy(entry => entry.Key)
                .Select(entry => new BoardPresenceViewer(entry.Key, entry.Value.Count))
                .ToArray());
    }
}

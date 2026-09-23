namespace Lapis.Features.Realtime;

using System.Collections.Concurrent;

public enum NoteGeometryOperation
{
    Drag = 0,
    Resize = 1
}

public sealed record NoteGeometryPreviewRequest(
    Guid BoardId,
    Guid NoteId,
    NoteGeometryOperation Operation,
    double? X,
    double? Y,
    double? Width,
    double? Height,
    uint BaseVersion,
    long Sequence);

public sealed record NoteGeometryPreviewEvent(
    Guid BoardId,
    Guid NoteId,
    Guid UserId,
    string ConnectionId,
    NoteGeometryOperation Operation,
    double? X,
    double? Y,
    double? Width,
    double? Height,
    uint BaseVersion,
    long Sequence,
    DateTimeOffset SentAt);

public sealed record EndNoteGeometryPreviewRequest(
    Guid BoardId,
    Guid NoteId,
    long Sequence);

public sealed record NoteGeometryPreviewEndedEvent(
    Guid BoardId,
    Guid NoteId,
    Guid UserId,
    string ConnectionId,
    long Sequence);

public sealed record ActiveNoteGeometryPreview(
    Guid BoardId,
    Guid NoteId,
    Guid UserId,
    string ConnectionId,
    long Sequence);

public interface INoteGeometryPreviewRegistry
{
    bool TryAdvance(ActiveNoteGeometryPreview preview);
    ActiveNoteGeometryPreview? End(Guid boardId, Guid noteId, string connectionId, long sequence);
    IReadOnlyList<ActiveNoteGeometryPreview> EndBoard(Guid boardId, string connectionId);
    IReadOnlyList<ActiveNoteGeometryPreview> EndConnection(string connectionId);
}

public sealed class NoteGeometryPreviewRegistry : INoteGeometryPreviewRegistry
{
    private readonly ConcurrentDictionary<(string ConnectionId, Guid BoardId, Guid NoteId),
        ActiveNoteGeometryPreview> previews = new();

    public bool TryAdvance(ActiveNoteGeometryPreview preview)
    {
        var key = (preview.ConnectionId, preview.BoardId, preview.NoteId);
        while (true)
        {
            if (!previews.TryGetValue(key, out var current))
                return previews.TryAdd(key, preview);
            if (preview.Sequence <= current.Sequence) return false;
            if (previews.TryUpdate(key, preview, current)) return true;
        }
    }

    public ActiveNoteGeometryPreview? End(
        Guid boardId,
        Guid noteId,
        string connectionId,
        long sequence)
    {
        var key = (connectionId, boardId, noteId);
        while (previews.TryGetValue(key, out var current))
        {
            if (sequence < current.Sequence) return null;
            var ended = current with { Sequence = sequence };
            if (previews.TryUpdate(key, ended, current)) return ended;
        }
        return null;
    }

    public IReadOnlyList<ActiveNoteGeometryPreview> EndBoard(
        Guid boardId,
        string connectionId) =>
        EndWhere(preview => preview.BoardId == boardId && preview.ConnectionId == connectionId);

    public IReadOnlyList<ActiveNoteGeometryPreview> EndConnection(string connectionId) =>
        EndWhere(preview => preview.ConnectionId == connectionId);

    private IReadOnlyList<ActiveNoteGeometryPreview> EndWhere(
        Func<ActiveNoteGeometryPreview, bool> predicate)
    {
        var removed = new List<ActiveNoteGeometryPreview>();
        foreach (var entry in previews)
        {
            if (!predicate(entry.Value)) continue;
            if (previews.TryRemove(entry)) removed.Add(entry.Value);
        }
        return removed;
    }
}

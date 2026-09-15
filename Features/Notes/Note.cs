namespace Lapis.Features.Notes;

using Features.Board;
using Features.NoteConnection;

public enum NoteKind
{
    Standalone = 0,
    List = 1,
    ChecklistItem = 2
}

public class Note
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BoardId { get; set; }
    public Board Board { get; set; } = null!;

    public NoteKind Kind { get; set; } = NoteKind.Standalone;
    public Guid? ParentNoteId { get; set; }
    public Note? ParentNote { get; set; }

    // EF populates these initialized collections; callers only need to mutate their contents.
    public ICollection<Note> ChecklistItems { get; } = new List<Note>();
    public ICollection<NoteConnection> OutgoingConnections { get; } = new List<NoteConnection>();
    public ICollection<NoteConnection> IncomingConnections { get; } = new List<NoteConnection>();

    // Content
    public string Title { get; set; } = string.Empty;
    // Content intentionally remains unbounded PostgreSQL text for Markdown or rich-text JSON.
    public string Content { get; set; } = string.Empty;

    // Canvas position is required for top-level notes and absent for checklist items.
    public double? PositionX { get; set; }
    public double? PositionY { get; set; }
    public double Width { get; set; } = 240;
    public double Height { get; set; } = 160;
    public int ZIndex { get; set; } = 1;
    public string Color { get; set; } = "#FFFFFF";

    // Completion applies to both top-level notes and checklist items.
    public bool IsCompleted { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    // Npgsql maps this property to PostgreSQL's xmin system column for optimistic concurrency.
    public uint Version { get; set; }
}

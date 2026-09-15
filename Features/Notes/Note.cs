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
    public ICollection<Note> ChecklistItems { get; set; } = new List<Note>();
    public ICollection<NoteConnection> OutgoingConnections { get; set; } = new List<NoteConnection>();
    public ICollection<NoteConnection> IncomingConnections { get; set; } = new List<NoteConnection>();

    // Content
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty; // markdown or json rich text

    // Spatial canvas att
    public double? PositionX {get; set;}
    public double? PositionY {get; set;}
    public double Width { get; set; } = 240;
    public double Height { get; set; } = 160;
    public int ZIndex { get; set; } = 1;
    public string Color { get; set; } = "#FFFFFF";

    

    // Todo/Task state
    public bool IsCompleted { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public uint Version { get; set; }
}

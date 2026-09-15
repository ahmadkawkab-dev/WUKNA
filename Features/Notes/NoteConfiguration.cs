namespace Lapis.Features.Notes;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class NoteConfiguration : IEntityTypeConfiguration<Note>
{
    public void Configure(EntityTypeBuilder<Note> entity)
    {
        entity.HasKey(note => note.Id);
        entity.HasAlternateKey(note => new { note.BoardId, note.Id });

        entity.HasIndex(note => new { note.BoardId, note.Kind });
        entity.HasIndex(note => new { note.BoardId, note.ParentNoteId });

        entity.Property(note => note.Title).IsRequired();
        entity.Property(note => note.Content).IsRequired();
        entity.Property(note => note.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(note => note.Version).IsRowVersion();

        entity.ToTable(table => table.HasCheckConstraint(
            "ck_note_kind",
            "\"kind\" IN (0, 1, 2)"));

        entity.HasOne(note => note.Board)
              .WithMany(board => board.Notes)
              .HasForeignKey(note => note.BoardId)
              .OnDelete(DeleteBehavior.Cascade);

        entity.HasOne(note => note.ParentNote)
              .WithMany(parent => parent.ChecklistItems)
              .HasForeignKey(note => new { note.BoardId, note.ParentNoteId })
              .HasPrincipalKey(parent => new { parent.BoardId, parent.Id })
              .OnDelete(DeleteBehavior.Restrict);
    }
}

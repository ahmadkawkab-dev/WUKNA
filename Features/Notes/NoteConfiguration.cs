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
        entity.HasIndex(note => new { note.BoardId, note.ParentNoteId })
              .HasFilter("\"parent_note_id\" IS NOT NULL");

        entity.Property(note => note.Title)
              .IsRequired()
              .HasMaxLength(200);
        entity.Property(note => note.Content).IsRequired();
        entity.Property(note => note.Color)
              .IsRequired()
              .HasMaxLength(9);
        entity.Property(note => note.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(note => note.Version).IsRowVersion();

        entity.ToTable(table => table.HasCheckConstraint(
            "ck_note_kind",
            "\"kind\" IN (0, 1, 2)"));
        entity.ToTable(table => table.HasCheckConstraint(
            "ck_note_parent_matches_kind",
            "(\"kind\" = 2 AND \"parent_note_id\" IS NOT NULL) OR " +
            "(\"kind\" IN (0, 1) AND \"parent_note_id\" IS NULL)"));
        entity.ToTable(table => table.HasCheckConstraint(
            "ck_note_position_matches_kind",
            "(\"kind\" = 2 AND \"position_x\" IS NULL AND \"position_y\" IS NULL) OR " +
            "(\"kind\" IN (0, 1) AND \"position_x\" IS NOT NULL AND \"position_y\" IS NOT NULL)"));
        entity.ToTable(table => table.HasCheckConstraint(
            "ck_note_dimensions_positive",
            "\"width\" > 0 AND \"height\" > 0"));
        entity.ToTable(table => table.HasCheckConstraint(
            "ck_note_color_hex",
            "\"color\" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'"));

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

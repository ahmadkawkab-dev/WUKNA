namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class LibraryDocumentConfiguration : IEntityTypeConfiguration<LibraryDocument>
{
    public void Configure(EntityTypeBuilder<LibraryDocument> entity)
    {
        entity.ToTable("library_documents", table =>
        {
            table.HasCheckConstraint("ck_library_document_category", "category = 1");
            table.HasCheckConstraint("ck_library_document_kind", "preview_kind IN (0, 1, 2, 3)");
            table.HasCheckConstraint("ck_library_document_source", """
                (preview_kind IN (1, 2) AND source_text IS NOT NULL AND octet_length(source_text) <= 256000 AND encoding IS NOT NULL AND encoding = 'utf-8')
                OR (preview_kind IN (0, 3) AND source_text IS NULL AND encoding IS NULL)
                """);
            table.HasCheckConstraint("ck_library_document_language", """
                (preview_kind = 1 AND language IS NOT NULL AND language IN
                    ('csharp','typescript','javascript','tsx','jsx','css','html','python','sql','json','bash','plaintext'))
                OR (preview_kind <> 1 AND language IS NULL)
                """);
        });
        entity.HasKey(document => document.ItemId);
        entity.Property(document => document.Language).HasMaxLength(20);
        entity.Property(document => document.Encoding).HasMaxLength(10);
        entity.Property(document => document.SourceText).HasColumnType("text");
        entity.HasOne(document => document.Item).WithOne(item => item.Document)
            .HasForeignKey<LibraryDocument>(document => new { document.ItemId, document.UserId, document.Category })
            .HasPrincipalKey<LibraryItem>(item => new { item.Id, item.UserId, item.Category }).OnDelete(DeleteBehavior.Cascade);
        entity.HasOne<LibraryAsset>().WithMany()
            .HasForeignKey(document => new { document.ItemId, document.UserId, document.Category })
            .HasPrincipalKey(asset => new { asset.ItemId, asset.UserId, asset.Category }).OnDelete(DeleteBehavior.Cascade);
    }
}

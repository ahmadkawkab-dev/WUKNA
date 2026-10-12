namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class LibraryItemConfiguration : IEntityTypeConfiguration<LibraryItem>
{
    public void Configure(EntityTypeBuilder<LibraryItem> entity)
    {
        entity.ToTable("library_items", table =>
        {
            table.HasCheckConstraint("ck_library_item_category", "category IN (0, 1, 2)");
            table.HasCheckConstraint("ck_library_item_name", "char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'");
            table.HasCheckConstraint("ck_library_item_dates", "updated_at >= created_at AND (deleted_at IS NULL OR deleted_at >= created_at)");
            table.HasCheckConstraint("ck_library_item_tags", """
                cardinality(tags) <= 12 AND array_position(tags, NULL) IS NULL
                AND (cardinality(tags) = 0 OR (array_ndims(tags) = 1
                    AND array_to_string(tags, '') !~ '[[:cntrl:]]'
                    AND array_to_string(tags, chr(31)) ~ ('^[^' || chr(31) || ']{1,40}(' || chr(31) || '[^' || chr(31) || ']{1,40})*$')))
                """);
        });
        entity.HasKey(item => item.Id);
        entity.HasAlternateKey(item => new { item.Id, item.UserId });
        entity.HasAlternateKey(item => new { item.Id, item.UserId, item.Category });
        entity.Property(item => item.Name).HasMaxLength(160).IsRequired();
        entity.Property(item => item.Description).HasMaxLength(2000);
        entity.Property(item => item.Notes).HasMaxLength(4000).IsRequired();
        entity.Property(item => item.Tags).HasColumnType("text[]").IsRequired();
        entity.Property(item => item.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(item => item.UpdatedAt).HasDefaultValueSql("now()");
        // Account removal must use the reviewed purge/cleanup workflow, not silently lose binary keys.
        entity.HasOne(item => item.User).WithMany().HasForeignKey(item => item.UserId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(item => item.Folder).WithMany()
            .HasForeignKey(item => new { item.FolderId, item.UserId, item.Category })
            .HasPrincipalKey(folder => new { folder.Id, folder.UserId, folder.Category }).OnDelete(DeleteBehavior.Restrict);
        // Actual category/all-item lists, recents, name sorting, favorites and Trash query patterns.
        entity.HasIndex(item => new { item.UserId, item.Category, item.CreatedAt, item.Id }).HasFilter("deleted_at IS NULL");
        entity.HasIndex(item => new { item.UserId, item.CreatedAt, item.Id }).HasFilter("deleted_at IS NULL");
        entity.HasIndex(item => new { item.UserId, item.UpdatedAt, item.Id }).HasFilter("deleted_at IS NULL");
        entity.HasIndex(item => new { item.UserId, item.Name, item.Id }).HasFilter("deleted_at IS NULL");
        entity.HasIndex(item => new { item.UserId, item.CreatedAt, item.Id }, "ix_library_items_favorites")
            .HasFilter("deleted_at IS NULL AND favorite");
        entity.HasIndex(item => new { item.UserId, item.DeletedAt, item.Id }).HasFilter("deleted_at IS NOT NULL");
    }
}

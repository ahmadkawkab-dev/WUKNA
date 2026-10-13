namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class LibraryFolderConfiguration : IEntityTypeConfiguration<LibraryFolder>
{
    public void Configure(EntityTypeBuilder<LibraryFolder> entity)
    {
        entity.ToTable("library_folders", table =>
        {
            table.HasTrigger("library_folders_hierarchy");
            table.HasCheckConstraint("ck_library_folder_category", "category IN (0, 1, 2)");
            table.HasCheckConstraint("ck_library_folder_name", "char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'");
            table.HasCheckConstraint("ck_library_folder_parent", "parent_id IS NULL OR parent_id <> id");
            table.HasCheckConstraint("ck_library_folder_depth", "depth BETWEEN 0 AND 32");
            table.HasCheckConstraint("ck_library_folder_dates", "updated_at >= created_at");
        });
        entity.HasKey(folder => folder.Id);
        entity.HasAlternateKey(folder => new { folder.Id, folder.UserId, folder.Category });
        entity.Property(folder => folder.Name).HasMaxLength(160).IsRequired();
        entity.Property(folder => folder.NormalizedName).HasMaxLength(160)
            .HasComputedColumnSql("upper(btrim(name))", stored: true);
        entity.Property(folder => folder.Depth).ValueGeneratedOnAddOrUpdate();
        entity.Property(folder => folder.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(folder => folder.UpdatedAt).HasDefaultValueSql("now()");
        entity.HasOne(folder => folder.User).WithMany().HasForeignKey(folder => folder.UserId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(folder => folder.Parent).WithMany()
            .HasForeignKey(folder => new { folder.ParentId, folder.UserId, folder.Category })
            .HasPrincipalKey(folder => new { folder.Id, folder.UserId, folder.Category }).OnDelete(DeleteBehavior.Restrict);
        // NULLS NOT DISTINCT closes duplicate-name races for root folders as well as nested folders.
        entity.HasIndex(folder => new { folder.UserId, folder.Category, folder.ParentId, folder.NormalizedName })
            .IsUnique().AreNullsDistinct(false).HasDatabaseName("ix_library_folders_sibling_name");
        entity.HasIndex(folder => new { folder.UserId, folder.Name, folder.Id });
    }
}

namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class LibraryCollectionConfiguration : IEntityTypeConfiguration<LibraryCollection>
{
    public void Configure(EntityTypeBuilder<LibraryCollection> entity)
    {
        entity.ToTable("library_collections", table =>
        {
            table.HasCheckConstraint("ck_library_collection_name", "char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'");
            table.HasCheckConstraint("ck_library_collection_dates", "updated_at >= created_at");
        });
        entity.HasKey(collection => collection.Id);
        entity.HasAlternateKey(collection => new { collection.Id, collection.UserId });
        entity.Property(collection => collection.Name).HasMaxLength(160).IsRequired();
        entity.Property(collection => collection.Description).HasMaxLength(2000);
        entity.Property(collection => collection.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(collection => collection.UpdatedAt).HasDefaultValueSql("now()");
        entity.HasOne(collection => collection.User).WithMany().HasForeignKey(collection => collection.UserId).OnDelete(DeleteBehavior.Cascade);
        entity.HasIndex(collection => new { collection.UserId, collection.CreatedAt, collection.Id });
    }
}

public sealed class LibraryCollectionItemConfiguration : IEntityTypeConfiguration<LibraryCollectionItem>
{
    public void Configure(EntityTypeBuilder<LibraryCollectionItem> entity)
    {
        entity.ToTable("library_collection_items");
        entity.HasKey(member => new { member.CollectionId, member.ItemId });
        entity.Property(member => member.AddedAt).HasDefaultValueSql("now()");
        entity.HasOne(member => member.Collection).WithMany()
            .HasForeignKey(member => new { member.CollectionId, member.UserId })
            .HasPrincipalKey(collection => new { collection.Id, collection.UserId }).OnDelete(DeleteBehavior.Cascade);
        entity.HasOne(member => member.Item).WithMany()
            .HasForeignKey(member => new { member.ItemId, member.UserId })
            .HasPrincipalKey(item => new { item.Id, item.UserId }).OnDelete(DeleteBehavior.Cascade);
    }
}

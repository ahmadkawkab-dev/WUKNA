namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class StorageEntitlementConfiguration : IEntityTypeConfiguration<StorageEntitlement>
{
    public void Configure(EntityTypeBuilder<StorageEntitlement> entity)
    {
        entity.ToTable("storage_entitlements", table =>
        {
            table.HasCheckConstraint("ck_storage_entitlement_quota", "quota_bytes > 0");
            table.HasCheckConstraint("ck_storage_entitlement_source", "source IN (0, 1, 2)");
            table.HasCheckConstraint("ck_storage_entitlement_dates", "updated_at >= created_at");
        });
        entity.HasKey(entitlement => entitlement.UserId);
        entity.Property(entitlement => entitlement.QuotaBytes).HasDefaultValue(LibraryOptions.DefaultFreeQuotaBytes);
        entity.Property(entitlement => entitlement.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(entitlement => entitlement.UpdatedAt).HasDefaultValueSql("now()");
        entity.HasOne(entitlement => entitlement.User).WithOne().HasForeignKey<StorageEntitlement>(entitlement => entitlement.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

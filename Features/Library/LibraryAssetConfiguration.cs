namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class LibraryAssetConfiguration : IEntityTypeConfiguration<LibraryAsset>
{
    public void Configure(EntityTypeBuilder<LibraryAsset> entity)
    {
        entity.ToTable("library_assets", table =>
        {
            table.HasCheckConstraint("ck_library_asset_category", "category IN (0, 1)");
            table.HasCheckConstraint("ck_library_asset_status", "processing_status IN (0, 1, 2, 3, 4)");
            table.HasCheckConstraint("ck_library_asset_filename", "char_length(btrim(original_file_name)) > 0 AND original_file_name !~ '[[:cntrl:]/\\\\]'");
            table.HasCheckConstraint("ck_library_asset_sizes", "size_bytes >= 0 AND thumbnail_bytes >= 0 AND stored_bytes >= size_bytes AND stored_bytes - size_bytes >= thumbnail_bytes");
            table.HasCheckConstraint("ck_library_asset_checksum", "checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'");
            table.HasCheckConstraint("ck_library_asset_keys", """
                (original_storage_key IS NULL OR original_storage_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$')
                AND (thumbnail_storage_key IS NULL OR thumbnail_storage_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$')
                AND (thumbnail_storage_key IS NULL) = (thumbnail_bytes = 0)
                AND (thumbnail_storage_key IS NULL OR thumbnail_storage_key <> original_storage_key)
                """);
            table.HasCheckConstraint("ck_library_asset_verified", "verified_at IS NULL OR (size_bytes > 0 AND content_type IS NOT NULL AND char_length(content_type) > 0 AND checksum IS NOT NULL AND original_storage_key IS NOT NULL)");
            table.HasCheckConstraint("ck_library_asset_scan", """
                (scan_verdict IS NULL AND scanned_at IS NULL) OR
                (scan_verdict IS NOT NULL AND scan_verdict IN (0, 1) AND scanned_at IS NOT NULL AND verified_at IS NOT NULL
                    AND scanned_at >= verified_at AND (scan_verdict = 0 OR processing_status = 4))
                """);
            table.HasCheckConstraint("ck_library_asset_available", """
                processing_status <> 3 OR (verified_at IS NOT NULL AND scanned_at IS NOT NULL AND scan_verdict IS NOT NULL AND scan_verdict = 0
                    AND original_storage_key LIKE 'library/available/%'
                    AND (thumbnail_storage_key IS NULL OR thumbnail_storage_key LIKE 'library/available/%')
                    AND (category <> 0 OR (width IS NOT NULL AND height IS NOT NULL AND thumbnail_storage_key IS NOT NULL)))
                """);
            table.HasCheckConstraint("ck_library_asset_dimensions", "(width IS NULL AND height IS NULL) OR (category = 0 AND width > 0 AND height > 0 AND width IS NOT NULL AND height IS NOT NULL)");
            table.HasCheckConstraint("ck_library_asset_dates", "updated_at >= created_at AND (verified_at IS NULL OR verified_at >= created_at)");
        });
        entity.HasKey(asset => asset.Id);
        entity.HasAlternateKey(asset => new { asset.ItemId, asset.UserId, asset.Category });
        entity.Property(asset => asset.OriginalFileName).HasMaxLength(255).IsRequired();
        entity.Property(asset => asset.ContentType).HasMaxLength(100);
        entity.Property(asset => asset.Checksum).HasMaxLength(64);
        entity.Property(asset => asset.OriginalStorageKey).HasMaxLength(200);
        entity.Property(asset => asset.ThumbnailStorageKey).HasMaxLength(200);
        entity.Property(asset => asset.LastErrorCode).HasMaxLength(100);
        entity.Property(asset => asset.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(asset => asset.UpdatedAt).HasDefaultValueSql("now()");
        entity.HasOne(asset => asset.Item).WithOne(item => item.Asset)
            .HasForeignKey<LibraryAsset>(asset => new { asset.ItemId, asset.UserId, asset.Category })
            .HasPrincipalKey<LibraryItem>(item => new { item.Id, item.UserId, item.Category }).OnDelete(DeleteBehavior.Restrict);
        // Used-byte reconciliation and largest-file queries are scoped by owner.
        entity.HasIndex(asset => new { asset.UserId, asset.SizeBytes, asset.Id });
        entity.HasIndex(asset => asset.OriginalStorageKey).IsUnique().HasFilter("original_storage_key IS NOT NULL");
        entity.HasIndex(asset => asset.ThumbnailStorageKey).IsUnique().HasFilter("thumbnail_storage_key IS NOT NULL");
    }
}

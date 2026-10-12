namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class StorageReservationConfiguration : IEntityTypeConfiguration<StorageReservation>
{
    public void Configure(EntityTypeBuilder<StorageReservation> entity)
    {
        entity.ToTable("storage_reservations", table =>
        {
            table.HasCheckConstraint("ck_library_upload_category", "category IN (0, 1)");
            table.HasCheckConstraint("ck_library_upload_state", "state IN (0, 1, 2, 3, 4, 5, 6)");
            table.HasCheckConstraint("ck_library_upload_identity", "client_upload_id <> '00000000-0000-0000-0000-000000000000' AND request_fingerprint ~ '^[0-9a-f]{64}$' AND declared_checksum ~ '^[0-9a-f]{64}$'");
            table.HasCheckConstraint("ck_library_upload_filename", "char_length(btrim(file_name)) > 0 AND file_name !~ '[[:cntrl:]/\\\\]' AND char_length(btrim(declared_content_type)) > 0");
            table.HasCheckConstraint("ck_library_upload_sizes", "declared_size_bytes > 0 AND reserved_bytes >= 0 AND (state NOT IN (0, 1) OR reserved_bytes >= declared_size_bytes)");
            table.HasCheckConstraint("ck_library_upload_dates", "updated_at >= created_at AND expires_at > created_at AND (completed_at IS NULL OR completed_at >= created_at)");
            table.HasCheckConstraint("ck_library_upload_lease", """
                ((lease_token IS NULL AND lease_expires_at IS NULL) OR
                    (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND attempt_id IS NOT NULL
                        AND lease_expires_at > created_at))
                AND (state <> 1 OR lease_token IS NOT NULL)
                AND (state IN (0, 1, 2) OR lease_token IS NULL)
                AND (lease_token IS NULL OR lease_token <> '00000000-0000-0000-0000-000000000000')
                AND (attempt_id IS NULL OR attempt_id <> '00000000-0000-0000-0000-000000000000')
                """);
            table.HasCheckConstraint("ck_library_upload_result", """
                (state = 3 AND reserved_bytes = 0 AND completed_at IS NOT NULL AND
                    ((result_item_id IS NOT NULL AND result_purged_at IS NULL) OR
                     (result_item_id IS NULL AND result_purged_at IS NOT NULL AND result_purged_at >= completed_at)))
                OR (state = 2 AND completed_at IS NULL AND result_item_id IS NOT NULL AND result_purged_at IS NULL)
                OR (state NOT IN (2, 3) AND completed_at IS NULL AND result_item_id IS NULL AND result_purged_at IS NULL)
                """);
            // Terminal rows no longer pin an upload destination, but failures can retain charged bytes.
            table.HasCheckConstraint("ck_library_upload_terminal_folder", "state IN (0, 1, 2) OR folder_id IS NULL");
        });
        entity.HasKey(upload => upload.Id);
        entity.Property(upload => upload.RequestFingerprint).HasMaxLength(64).IsRequired();
        entity.Property(upload => upload.DeclaredChecksum).HasMaxLength(64).IsRequired();
        entity.Property(upload => upload.FileName).HasMaxLength(255).IsRequired();
        entity.Property(upload => upload.DeclaredContentType).HasMaxLength(100).IsRequired();
        entity.Property(upload => upload.LastErrorCode).HasMaxLength(100);
        entity.Property(upload => upload.CreatedAt).HasDefaultValueSql("now()");
        entity.Property(upload => upload.UpdatedAt).HasDefaultValueSql("now()");
        entity.HasOne(upload => upload.Entitlement).WithMany().HasForeignKey(upload => upload.UserId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(upload => upload.Folder).WithMany()
            .HasForeignKey(upload => new { upload.FolderId, upload.UserId, upload.Category })
            .HasPrincipalKey(folder => new { folder.Id, folder.UserId, folder.Category }).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(upload => upload.ResultItem).WithMany()
            .HasForeignKey(upload => new { upload.ResultItemId, upload.UserId, upload.Category })
            .HasPrincipalKey(item => new { item.Id, item.UserId, item.Category }).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne<LibraryAsset>().WithMany()
            .HasForeignKey(upload => new { upload.ResultItemId, upload.UserId, upload.Category })
            .HasPrincipalKey(asset => new { asset.ItemId, asset.UserId, asset.Category }).OnDelete(DeleteBehavior.Restrict);
        entity.HasIndex(upload => new { upload.UserId, upload.ClientUploadId }).IsUnique();
        entity.HasIndex(upload => new { upload.ExpiresAt, upload.Id }).HasFilter("state IN (0, 1, 2)");
    }
}

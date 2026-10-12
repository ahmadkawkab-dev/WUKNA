namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class LibraryBlobWorkConfiguration : IEntityTypeConfiguration<LibraryBlobWork>
{
    public void Configure(EntityTypeBuilder<LibraryBlobWork> entity)
    {
        entity.ToTable("library_blob_work", table =>
        {
            table.HasCheckConstraint("ck_library_blob_work_purpose", "purpose IN (0, 1)");
            table.HasCheckConstraint("ck_library_blob_work_identity", "user_id <> '00000000-0000-0000-0000-000000000000' AND (asset_id IS NULL OR asset_id <> '00000000-0000-0000-0000-000000000000')");
            table.HasCheckConstraint("ck_library_blob_work_key", "object_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$'");
            table.HasCheckConstraint("ck_library_blob_work_scan", "purpose <> 0 OR (asset_id IS NOT NULL AND charged_bytes = 0 AND object_key LIKE 'library/quarantine/%')");
            table.HasCheckConstraint("ck_library_blob_work_counters", "charged_bytes >= 0 AND attempts >= 0");
            table.HasCheckConstraint("ck_library_blob_work_lease", """
                (lease_token IS NULL AND lease_expires_at IS NULL) OR
                (lease_token IS NOT NULL AND lease_token <> '00000000-0000-0000-0000-000000000000'
                    AND lease_expires_at IS NOT NULL AND lease_expires_at > created_at)
                """);
            table.HasCheckConstraint("ck_library_blob_work_dates", "due_at >= created_at");
        });
        entity.HasKey(work => work.Id);
        entity.Property(work => work.ObjectKey).HasMaxLength(200).IsRequired();
        entity.Property(work => work.LastErrorCode).HasMaxLength(100);
        entity.Property(work => work.CreatedAt).HasDefaultValueSql("now()");
        entity.HasIndex(work => new { work.Purpose, work.ObjectKey }).IsUnique();
        entity.HasIndex(work => new { work.DueAt, work.Id });
        entity.HasIndex(work => new { work.UserId, work.Purpose });
    }
}

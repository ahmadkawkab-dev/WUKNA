namespace Wukna.Features.Library;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public sealed class LibraryVideoConfiguration : IEntityTypeConfiguration<LibraryVideo>
{
    public void Configure(EntityTypeBuilder<LibraryVideo> entity)
    {
        entity.ToTable("library_videos", table =>
        {
            table.HasCheckConstraint("ck_library_video_category", "category = 2");
            table.HasCheckConstraint("ck_library_video_thumbnail", "thumbnail_url IS NULL OR (provider = 0 AND thumbnail_url ~ '^https://i[.]ytimg[.]com/vi/') OR (provider = 1 AND thumbnail_url ~ '^https://i[.]vimeocdn[.]com/video/')");
            table.HasCheckConstraint("ck_library_video_reference", """
                (provider = 0 AND video_id IS NOT NULL AND video_id ~ '^[A-Za-z0-9_-]{11}$' AND url = 'https://www.youtube.com/watch?v=' || video_id)
                OR (provider = 1 AND video_id IS NOT NULL AND video_id ~ '^[0-9]{1,20}$' AND url = 'https://vimeo.com/' || video_id)
                OR (provider = 2 AND video_id IS NULL AND url ~ '^https://[^/@[:space:]]+(/|$)' AND url !~ '[[:cntrl:]]')
                """);
        });
        entity.HasKey(video => video.ItemId);
        entity.Property(video => video.Url).HasMaxLength(2048).IsRequired();
        entity.Property(video => video.VideoId).HasMaxLength(20);
        entity.Property(video => video.Creator).HasMaxLength(200);
        entity.Property(video => video.ProviderTitle).HasMaxLength(200);
        entity.Property(video => video.ThumbnailUrl).HasMaxLength(2048);
        entity.Property(video => video.MetadataErrorCode).HasMaxLength(100);
        // A lookup hash bounds index width for long URLs. Exact URL equality is still required;
        // this hash is neither a security check nor a uniqueness constraint.
        entity.Property<string>("UrlLookupHash").HasMaxLength(32).HasComputedColumnSql("md5(url)", stored: true);
        entity.HasIndex(nameof(LibraryVideo.UserId), "UrlLookupHash");
        entity.HasOne(video => video.Item).WithOne(item => item.Video)
            .HasForeignKey<LibraryVideo>(video => new { video.ItemId, video.UserId, video.Category })
            .HasPrincipalKey<LibraryItem>(item => new { item.Id, item.UserId, item.Category }).OnDelete(DeleteBehavior.Cascade);
    }
}

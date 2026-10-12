using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wukna.Migrations
{
    /// <inheritdoc />
    public partial class AddLibraryVideoMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "provider_title",
                table: "library_videos",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "thumbnail_url",
                table: "library_videos",
                type: "character varying(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_library_video_thumbnail",
                table: "library_videos",
                sql: "thumbnail_url IS NULL OR (provider = 0 AND thumbnail_url ~ '^https://i[.]ytimg[.]com/vi/') OR (provider = 1 AND thumbnail_url ~ '^https://i[.]vimeocdn[.]com/video/')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_library_video_thumbnail",
                table: "library_videos");

            migrationBuilder.DropColumn(
                name: "provider_title",
                table: "library_videos");

            migrationBuilder.DropColumn(
                name: "thumbnail_url",
                table: "library_videos");
        }
    }
}

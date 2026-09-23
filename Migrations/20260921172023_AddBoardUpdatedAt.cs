using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wukna.Migrations
{
    /// <inheritdoc />
    public partial class AddBoardUpdatedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "boards",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            // Existing history cannot be reconstructed, so creation is the only truthful baseline.
            migrationBuilder.Sql("UPDATE boards SET updated_at = created_at;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "boards");
        }
    }
}

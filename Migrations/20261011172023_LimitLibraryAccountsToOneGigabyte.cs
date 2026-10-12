using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wukna.Migrations
{
    /// <inheritdoc />
    public partial class LimitLibraryAccountsToOneGigabyte : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Preserve files, reservations and cleanup liabilities when lowering the ceiling.
            migrationBuilder.Sql("""
                UPDATE storage_entitlements
                SET quota_bytes = 1000000000,
                    updated_at = GREATEST(updated_at, now())
                WHERE quota_bytes > 1000000000;
                """);

            migrationBuilder.AlterColumn<long>(
                name: "quota_bytes",
                table: "storage_entitlements",
                type: "bigint",
                nullable: false,
                defaultValue: 1000000000L,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldDefaultValue: 5000000000L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<long>(
                name: "quota_bytes",
                table: "storage_entitlements",
                type: "bigint",
                nullable: false,
                defaultValue: 5000000000L,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldDefaultValue: 1000000000L);
        }
    }
}

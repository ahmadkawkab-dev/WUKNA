using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lapis.Migrations
{
    /// <inheritdoc />
    public partial class AddProfileManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "display_name",
                table: "asp_net_users",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "normalized_username",
                table: "asp_net_users",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "profile_image_key",
                table: "asp_net_users",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "profile_image_version",
                table: "asp_net_users",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "username",
                table: "asp_net_users",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.Sql("""
                WITH source AS (
                    SELECT id,
                           COALESCE(NULLIF(trim(both '._-' FROM regexp_replace(
                               lower(split_part(COALESCE(email, 'user'), '@', 1)),
                               '[^a-z0-9._-]', '', 'g')), ''), 'user') AS base,
                           count(*) OVER (PARTITION BY COALESCE(NULLIF(trim(both '._-' FROM regexp_replace(
                               lower(split_part(COALESCE(email, 'user'), '@', 1)),
                               '[^a-z0-9._-]', '', 'g')), ''), 'user')) AS duplicates
                    FROM asp_net_users
                ), assigned AS (
                    SELECT id,
                           CASE WHEN duplicates = 1 AND length(base) <= 30
                                THEN base
                                ELSE left(base, 19) || '-' || left(replace(id::text, '-', ''), 10)
                           END AS username
                    FROM source
                )
                UPDATE asp_net_users AS users
                SET username = assigned.username,
                    normalized_username = upper(assigned.username)
                FROM assigned
                WHERE users.id = assigned.id;
                """);

            migrationBuilder.AlterColumn<string>(
                name: "username", table: "asp_net_users", type: "character varying(30)",
                maxLength: 30, nullable: false, oldClrType: typeof(string), oldType: "character varying(30)", oldMaxLength: 30, oldNullable: true);
            migrationBuilder.AlterColumn<string>(
                name: "normalized_username", table: "asp_net_users", type: "character varying(30)",
                maxLength: 30, nullable: false, oldClrType: typeof(string), oldType: "character varying(30)", oldMaxLength: 30, oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_asp_net_users_normalized_username",
                table: "asp_net_users",
                column: "normalized_username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_asp_net_users_normalized_username",
                table: "asp_net_users");

            migrationBuilder.DropColumn(
                name: "display_name",
                table: "asp_net_users");

            migrationBuilder.DropColumn(
                name: "normalized_username",
                table: "asp_net_users");

            migrationBuilder.DropColumn(
                name: "profile_image_key",
                table: "asp_net_users");

            migrationBuilder.DropColumn(
                name: "profile_image_version",
                table: "asp_net_users");

            migrationBuilder.DropColumn(
                name: "username",
                table: "asp_net_users");
        }
    }
}

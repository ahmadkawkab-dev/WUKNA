using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lapis.Migrations
{
    /// <inheritdoc />
    public partial class FinalizeModelsAndExternalLogin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_notes_board_id_parent_note_id",
                table: "notes");

            migrationBuilder.DropIndex(
                name: "EmailIndex",
                table: "asp_net_users");

            migrationBuilder.AlterColumn<string>(
                name: "title",
                table: "notes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<string>(
                name: "color",
                table: "notes",
                type: "character varying(9)",
                maxLength: 9,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.CreateTable(
                name: "external_login_grants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    browser_binding_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_external_login_grants", x => x.id);
                    table.ForeignKey(
                        name: "fk_external_login_grants_users_user_id",
                        column: x => x.user_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_notes_board_id_parent_note_id",
                table: "notes",
                columns: new[] { "board_id", "parent_note_id" },
                filter: "\"parent_note_id\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_note_color_hex",
                table: "notes",
                sql: "\"color\" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_note_dimensions_positive",
                table: "notes",
                sql: "\"width\" > 0 AND \"height\" > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_note_parent_matches_kind",
                table: "notes",
                sql: "(\"kind\" = 2 AND \"parent_note_id\" IS NOT NULL) OR (\"kind\" IN (0, 1) AND \"parent_note_id\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_note_position_matches_kind",
                table: "notes",
                sql: "(\"kind\" = 2 AND \"position_x\" IS NULL AND \"position_y\" IS NULL) OR (\"kind\" IN (0, 1) AND \"position_x\" IS NOT NULL AND \"position_y\" IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "EmailIndex",
                table: "asp_net_users",
                column: "normalized_email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_external_login_grants_code_hash",
                table: "external_login_grants",
                column: "code_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_external_login_grants_expires_at",
                table: "external_login_grants",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "ix_external_login_grants_user_id",
                table: "external_login_grants",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "external_login_grants");

            migrationBuilder.DropIndex(
                name: "ix_notes_board_id_parent_note_id",
                table: "notes");

            migrationBuilder.DropCheckConstraint(
                name: "ck_note_color_hex",
                table: "notes");

            migrationBuilder.DropCheckConstraint(
                name: "ck_note_dimensions_positive",
                table: "notes");

            migrationBuilder.DropCheckConstraint(
                name: "ck_note_parent_matches_kind",
                table: "notes");

            migrationBuilder.DropCheckConstraint(
                name: "ck_note_position_matches_kind",
                table: "notes");

            migrationBuilder.DropIndex(
                name: "EmailIndex",
                table: "asp_net_users");

            migrationBuilder.AlterColumn<string>(
                name: "title",
                table: "notes",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "color",
                table: "notes",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(9)",
                oldMaxLength: 9);

            migrationBuilder.CreateIndex(
                name: "ix_notes_board_id_parent_note_id",
                table: "notes",
                columns: new[] { "board_id", "parent_note_id" });

            migrationBuilder.CreateIndex(
                name: "EmailIndex",
                table: "asp_net_users",
                column: "normalized_email");
        }
    }
}

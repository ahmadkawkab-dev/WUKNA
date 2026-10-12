using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wukna.Migrations
{
    /// <inheritdoc />
    public partial class AddPersonalLibraryFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "library_blob_work",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    asset_id = table.Column<Guid>(type: "uuid", nullable: true),
                    purpose = table.Column<int>(type: "integer", nullable: false),
                    object_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    charged_bytes = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    due_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    lease_token = table.Column<Guid>(type: "uuid", nullable: true),
                    lease_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    last_error_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_blob_work", x => x.id);
                    table.CheckConstraint("ck_library_blob_work_counters", "charged_bytes >= 0 AND attempts >= 0");
                    table.CheckConstraint("ck_library_blob_work_dates", "due_at >= created_at");
                    table.CheckConstraint("ck_library_blob_work_identity", "user_id <> '00000000-0000-0000-0000-000000000000' AND (asset_id IS NULL OR asset_id <> '00000000-0000-0000-0000-000000000000')");
                    table.CheckConstraint("ck_library_blob_work_key", "object_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$'");
                    table.CheckConstraint("ck_library_blob_work_lease", "(lease_token IS NULL AND lease_expires_at IS NULL) OR\n(lease_token IS NOT NULL AND lease_token <> '00000000-0000-0000-0000-000000000000'\n    AND lease_expires_at IS NOT NULL AND lease_expires_at > created_at)");
                    table.CheckConstraint("ck_library_blob_work_purpose", "purpose IN (0, 1)");
                    table.CheckConstraint("ck_library_blob_work_scan", "purpose <> 0 OR (asset_id IS NOT NULL AND charged_bytes = 0 AND object_key LIKE 'library/quarantine/%')");
                });

            migrationBuilder.CreateTable(
                name: "library_collections",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_collections", x => x.id);
                    table.UniqueConstraint("ak_library_collections_id_user_id", x => new { x.id, x.user_id });
                    table.CheckConstraint("ck_library_collection_dates", "updated_at >= created_at");
                    table.CheckConstraint("ck_library_collection_name", "char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'");
                    table.ForeignKey(
                        name: "fk_library_collections_users_user_id",
                        column: x => x.user_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "library_folders",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    normalized_name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false, computedColumnSql: "upper(btrim(name))", stored: true),
                    parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    depth = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_folders", x => x.id);
                    table.UniqueConstraint("ak_library_folders_id_user_id_category", x => new { x.id, x.user_id, x.category });
                    table.CheckConstraint("ck_library_folder_category", "category IN (0, 1, 2)");
                    table.CheckConstraint("ck_library_folder_dates", "updated_at >= created_at");
                    table.CheckConstraint("ck_library_folder_depth", "depth BETWEEN 0 AND 32");
                    table.CheckConstraint("ck_library_folder_name", "char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'");
                    table.CheckConstraint("ck_library_folder_parent", "parent_id IS NULL OR parent_id <> id");
                    table.ForeignKey(
                        name: "fk_library_folders_library_folders_parent_id_user_id_category",
                        columns: x => new { x.parent_id, x.user_id, x.category },
                        principalTable: "library_folders",
                        principalColumns: new[] { "id", "user_id", "category" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_library_folders_users_user_id",
                        column: x => x.user_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "storage_entitlements",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    quota_bytes = table.Column<long>(type: "bigint", nullable: false, defaultValue: 5000000000L),
                    source = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_storage_entitlements", x => x.user_id);
                    table.CheckConstraint("ck_storage_entitlement_dates", "updated_at >= created_at");
                    table.CheckConstraint("ck_storage_entitlement_quota", "quota_bytes > 0");
                    table.CheckConstraint("ck_storage_entitlement_source", "source IN (0, 1, 2)");
                    table.ForeignKey(
                        name: "fk_storage_entitlements_asp_net_users_user_id",
                        column: x => x.user_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "library_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    notes = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    tags = table.Column<string[]>(type: "text[]", nullable: false),
                    folder_id = table.Column<Guid>(type: "uuid", nullable: true),
                    favorite = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_items", x => x.id);
                    table.UniqueConstraint("ak_library_items_id_user_id", x => new { x.id, x.user_id });
                    table.UniqueConstraint("ak_library_items_id_user_id_category", x => new { x.id, x.user_id, x.category });
                    table.CheckConstraint("ck_library_item_category", "category IN (0, 1, 2)");
                    table.CheckConstraint("ck_library_item_dates", "updated_at >= created_at AND (deleted_at IS NULL OR deleted_at >= created_at)");
                    table.CheckConstraint("ck_library_item_name", "char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'");
                    table.CheckConstraint("ck_library_item_tags", "cardinality(tags) <= 12 AND array_position(tags, NULL) IS NULL\nAND (cardinality(tags) = 0 OR (array_ndims(tags) = 1\n    AND array_to_string(tags, '') !~ '[[:cntrl:]]'\n    AND array_to_string(tags, chr(31)) ~ ('^[^' || chr(31) || ']{1,40}(' || chr(31) || '[^' || chr(31) || ']{1,40})*$')))");
                    table.ForeignKey(
                        name: "fk_library_items_library_folders_folder_id_user_id_category",
                        columns: x => new { x.folder_id, x.user_id, x.category },
                        principalTable: "library_folders",
                        principalColumns: new[] { "id", "user_id", "category" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_library_items_users_user_id",
                        column: x => x.user_id,
                        principalTable: "asp_net_users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "library_assets",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category = table.Column<int>(type: "integer", nullable: false),
                    original_file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    content_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    original_storage_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    thumbnail_storage_key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    thumbnail_bytes = table.Column<long>(type: "bigint", nullable: false),
                    stored_bytes = table.Column<long>(type: "bigint", nullable: false),
                    width = table.Column<int>(type: "integer", nullable: true),
                    height = table.Column<int>(type: "integer", nullable: true),
                    processing_status = table.Column<int>(type: "integer", nullable: false),
                    verified_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    scanned_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    scan_verdict = table.Column<int>(type: "integer", nullable: true),
                    last_error_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_assets", x => x.id);
                    table.UniqueConstraint("ak_library_assets_item_id_user_id_category", x => new { x.item_id, x.user_id, x.category });
                    table.CheckConstraint("ck_library_asset_available", "processing_status <> 3 OR (verified_at IS NOT NULL AND scanned_at IS NOT NULL AND scan_verdict IS NOT NULL AND scan_verdict = 0\n    AND original_storage_key LIKE 'library/available/%'\n    AND (thumbnail_storage_key IS NULL OR thumbnail_storage_key LIKE 'library/available/%')\n    AND (category <> 0 OR (width IS NOT NULL AND height IS NOT NULL AND thumbnail_storage_key IS NOT NULL)))");
                    table.CheckConstraint("ck_library_asset_category", "category IN (0, 1)");
                    table.CheckConstraint("ck_library_asset_checksum", "checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'");
                    table.CheckConstraint("ck_library_asset_dates", "updated_at >= created_at AND (verified_at IS NULL OR verified_at >= created_at)");
                    table.CheckConstraint("ck_library_asset_dimensions", "(width IS NULL AND height IS NULL) OR (category = 0 AND width > 0 AND height > 0 AND width IS NOT NULL AND height IS NOT NULL)");
                    table.CheckConstraint("ck_library_asset_filename", "char_length(btrim(original_file_name)) > 0 AND original_file_name !~ '[[:cntrl:]/\\\\]'");
                    table.CheckConstraint("ck_library_asset_keys", "(original_storage_key IS NULL OR original_storage_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$')\nAND (thumbnail_storage_key IS NULL OR thumbnail_storage_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$')\nAND (thumbnail_storage_key IS NULL) = (thumbnail_bytes = 0)\nAND (thumbnail_storage_key IS NULL OR thumbnail_storage_key <> original_storage_key)");
                    table.CheckConstraint("ck_library_asset_scan", "(scan_verdict IS NULL AND scanned_at IS NULL) OR\n(scan_verdict IS NOT NULL AND scan_verdict IN (0, 1) AND scanned_at IS NOT NULL AND verified_at IS NOT NULL\n    AND scanned_at >= verified_at AND (scan_verdict = 0 OR processing_status = 4))");
                    table.CheckConstraint("ck_library_asset_sizes", "size_bytes >= 0 AND thumbnail_bytes >= 0 AND stored_bytes >= size_bytes AND stored_bytes - size_bytes >= thumbnail_bytes");
                    table.CheckConstraint("ck_library_asset_status", "processing_status IN (0, 1, 2, 3, 4)");
                    table.CheckConstraint("ck_library_asset_verified", "verified_at IS NULL OR (size_bytes > 0 AND content_type IS NOT NULL AND char_length(content_type) > 0 AND checksum IS NOT NULL AND original_storage_key IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_library_assets_library_items_item_id_user_id_category",
                        columns: x => new { x.item_id, x.user_id, x.category },
                        principalTable: "library_items",
                        principalColumns: new[] { "id", "user_id", "category" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "library_collection_items",
                columns: table => new
                {
                    collection_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    added_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_collection_items", x => new { x.collection_id, x.item_id });
                    table.ForeignKey(
                        name: "fk_library_collection_items_library_collections_collection_id_",
                        columns: x => new { x.collection_id, x.user_id },
                        principalTable: "library_collections",
                        principalColumns: new[] { "id", "user_id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_library_collection_items_library_items_item_id_user_id",
                        columns: x => new { x.item_id, x.user_id },
                        principalTable: "library_items",
                        principalColumns: new[] { "id", "user_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "library_videos",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category = table.Column<int>(type: "integer", nullable: false),
                    provider = table.Column<int>(type: "integer", nullable: false),
                    video_id = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    creator = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    metadata_fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    metadata_error_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    url_lookup_hash = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true, computedColumnSql: "md5(url)", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_videos", x => x.item_id);
                    table.CheckConstraint("ck_library_video_category", "category = 2");
                    table.CheckConstraint("ck_library_video_reference", "(provider = 0 AND video_id IS NOT NULL AND video_id ~ '^[A-Za-z0-9_-]{11}$' AND url = 'https://www.youtube.com/watch?v=' || video_id)\nOR (provider = 1 AND video_id IS NOT NULL AND video_id ~ '^[0-9]{1,20}$' AND url = 'https://vimeo.com/' || video_id)\nOR (provider = 2 AND video_id IS NULL AND url ~ '^https://[^/@[:space:]]+(/|$)' AND url !~ '[[:cntrl:]]')");
                    table.ForeignKey(
                        name: "fk_library_videos_library_items_item_id_user_id_category",
                        columns: x => new { x.item_id, x.user_id, x.category },
                        principalTable: "library_items",
                        principalColumns: new[] { "id", "user_id", "category" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "library_documents",
                columns: table => new
                {
                    item_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category = table.Column<int>(type: "integer", nullable: false),
                    preview_kind = table.Column<int>(type: "integer", nullable: false),
                    language = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    encoding = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    source_text = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_library_documents", x => x.item_id);
                    table.CheckConstraint("ck_library_document_category", "category = 1");
                    table.CheckConstraint("ck_library_document_kind", "preview_kind IN (0, 1, 2, 3)");
                    table.CheckConstraint("ck_library_document_language", "(preview_kind = 1 AND language IS NOT NULL AND language IN\n    ('csharp','typescript','javascript','tsx','jsx','css','html','python','sql','json','bash','plaintext'))\nOR (preview_kind <> 1 AND language IS NULL)");
                    table.CheckConstraint("ck_library_document_source", "(preview_kind IN (1, 2) AND source_text IS NOT NULL AND octet_length(source_text) <= 256000 AND encoding IS NOT NULL AND encoding = 'utf-8')\nOR (preview_kind IN (0, 3) AND source_text IS NULL AND encoding IS NULL)");
                    table.ForeignKey(
                        name: "fk_library_documents_library_assets_item_id_user_id_category",
                        columns: x => new { x.item_id, x.user_id, x.category },
                        principalTable: "library_assets",
                        principalColumns: new[] { "item_id", "user_id", "category" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_library_documents_library_items_item_id_user_id_category",
                        columns: x => new { x.item_id, x.user_id, x.category },
                        principalTable: "library_items",
                        principalColumns: new[] { "id", "user_id", "category" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "storage_reservations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_upload_id = table.Column<Guid>(type: "uuid", nullable: false),
                    request_fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    category = table.Column<int>(type: "integer", nullable: false),
                    file_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    declared_content_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    declared_size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    declared_checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    folder_id = table.Column<Guid>(type: "uuid", nullable: true),
                    reserved_bytes = table.Column<long>(type: "bigint", nullable: false),
                    state = table.Column<int>(type: "integer", nullable: false),
                    attempt_id = table.Column<Guid>(type: "uuid", nullable: true),
                    lease_token = table.Column<Guid>(type: "uuid", nullable: true),
                    lease_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    cancellation_requested_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    result_item_id = table.Column<Guid>(type: "uuid", nullable: true),
                    result_purged_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_error_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_storage_reservations", x => x.id);
                    table.CheckConstraint("ck_library_upload_category", "category IN (0, 1)");
                    table.CheckConstraint("ck_library_upload_dates", "updated_at >= created_at AND expires_at > created_at AND (completed_at IS NULL OR completed_at >= created_at)");
                    table.CheckConstraint("ck_library_upload_filename", "char_length(btrim(file_name)) > 0 AND file_name !~ '[[:cntrl:]/\\\\]' AND char_length(btrim(declared_content_type)) > 0");
                    table.CheckConstraint("ck_library_upload_identity", "client_upload_id <> '00000000-0000-0000-0000-000000000000' AND request_fingerprint ~ '^[0-9a-f]{64}$' AND declared_checksum ~ '^[0-9a-f]{64}$'");
                    table.CheckConstraint("ck_library_upload_lease", "((lease_token IS NULL AND lease_expires_at IS NULL) OR\n    (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND attempt_id IS NOT NULL\n        AND lease_expires_at > created_at))\nAND (state <> 1 OR lease_token IS NOT NULL)\nAND (state IN (0, 1, 2) OR lease_token IS NULL)\nAND (lease_token IS NULL OR lease_token <> '00000000-0000-0000-0000-000000000000')\nAND (attempt_id IS NULL OR attempt_id <> '00000000-0000-0000-0000-000000000000')");
                    table.CheckConstraint("ck_library_upload_result", "(state = 3 AND reserved_bytes = 0 AND completed_at IS NOT NULL AND\n    ((result_item_id IS NOT NULL AND result_purged_at IS NULL) OR\n     (result_item_id IS NULL AND result_purged_at IS NOT NULL AND result_purged_at >= completed_at)))\nOR (state = 2 AND completed_at IS NULL AND result_item_id IS NOT NULL AND result_purged_at IS NULL)\nOR (state NOT IN (2, 3) AND completed_at IS NULL AND result_item_id IS NULL AND result_purged_at IS NULL)");
                    table.CheckConstraint("ck_library_upload_sizes", "declared_size_bytes > 0 AND reserved_bytes >= 0 AND (state NOT IN (0, 1) OR reserved_bytes >= declared_size_bytes)");
                    table.CheckConstraint("ck_library_upload_state", "state IN (0, 1, 2, 3, 4, 5, 6)");
                    table.CheckConstraint("ck_library_upload_terminal_folder", "state IN (0, 1, 2) OR folder_id IS NULL");
                    table.ForeignKey(
                        name: "fk_storage_reservations_library_assets_result_item_id_user_id_",
                        columns: x => new { x.result_item_id, x.user_id, x.category },
                        principalTable: "library_assets",
                        principalColumns: new[] { "item_id", "user_id", "category" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_storage_reservations_library_folders_folder_id_user_id_cate",
                        columns: x => new { x.folder_id, x.user_id, x.category },
                        principalTable: "library_folders",
                        principalColumns: new[] { "id", "user_id", "category" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_storage_reservations_library_items_result_item_id_user_id_c",
                        columns: x => new { x.result_item_id, x.user_id, x.category },
                        principalTable: "library_items",
                        principalColumns: new[] { "id", "user_id", "category" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_storage_reservations_storage_entitlements_user_id",
                        column: x => x.user_id,
                        principalTable: "storage_entitlements",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_library_assets_original_storage_key",
                table: "library_assets",
                column: "original_storage_key",
                unique: true,
                filter: "original_storage_key IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_library_assets_thumbnail_storage_key",
                table: "library_assets",
                column: "thumbnail_storage_key",
                unique: true,
                filter: "thumbnail_storage_key IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_library_assets_user_id_size_bytes_id",
                table: "library_assets",
                columns: new[] { "user_id", "size_bytes", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_library_blob_work_due_at_id",
                table: "library_blob_work",
                columns: new[] { "due_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_library_blob_work_purpose_object_key",
                table: "library_blob_work",
                columns: new[] { "purpose", "object_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_library_blob_work_user_id_purpose",
                table: "library_blob_work",
                columns: new[] { "user_id", "purpose" });

            migrationBuilder.CreateIndex(
                name: "ix_library_collection_items_collection_id_user_id",
                table: "library_collection_items",
                columns: new[] { "collection_id", "user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_library_collection_items_item_id_user_id",
                table: "library_collection_items",
                columns: new[] { "item_id", "user_id" });

            migrationBuilder.CreateIndex(
                name: "ix_library_collections_user_id_created_at_id",
                table: "library_collections",
                columns: new[] { "user_id", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_library_documents_item_id_user_id_category",
                table: "library_documents",
                columns: new[] { "item_id", "user_id", "category" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_library_folders_parent_id_user_id_category",
                table: "library_folders",
                columns: new[] { "parent_id", "user_id", "category" });

            migrationBuilder.CreateIndex(
                name: "ix_library_folders_sibling_name",
                table: "library_folders",
                columns: new[] { "user_id", "category", "parent_id", "normalized_name" },
                unique: true)
                .Annotation("Npgsql:NullsDistinct", false);

            migrationBuilder.CreateIndex(
                name: "ix_library_folders_user_id_name_id",
                table: "library_folders",
                columns: new[] { "user_id", "name", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_library_items_folder_id_user_id_category",
                table: "library_items",
                columns: new[] { "folder_id", "user_id", "category" });

            migrationBuilder.CreateIndex(
                name: "ix_library_items_user_id_category_created_at_id",
                table: "library_items",
                columns: new[] { "user_id", "category", "created_at", "id" },
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_library_items_user_id_created_at_id",
                table: "library_items",
                columns: new[] { "user_id", "created_at", "id" },
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_library_items_user_id_created_at_id1",
                table: "library_items",
                columns: new[] { "user_id", "created_at", "id" },
                filter: "deleted_at IS NULL AND favorite");

            migrationBuilder.CreateIndex(
                name: "ix_library_items_user_id_deleted_at_id",
                table: "library_items",
                columns: new[] { "user_id", "deleted_at", "id" },
                filter: "deleted_at IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_library_items_user_id_name_id",
                table: "library_items",
                columns: new[] { "user_id", "name", "id" },
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_library_items_user_id_updated_at_id",
                table: "library_items",
                columns: new[] { "user_id", "updated_at", "id" },
                filter: "deleted_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_library_videos_item_id_user_id_category",
                table: "library_videos",
                columns: new[] { "item_id", "user_id", "category" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_library_videos_user_id_url_lookup_hash",
                table: "library_videos",
                columns: new[] { "user_id", "url_lookup_hash" });

            migrationBuilder.CreateIndex(
                name: "ix_storage_reservations_expires_at_id",
                table: "storage_reservations",
                columns: new[] { "expires_at", "id" },
                filter: "state IN (0, 1, 2)");

            migrationBuilder.CreateIndex(
                name: "ix_storage_reservations_folder_id_user_id_category",
                table: "storage_reservations",
                columns: new[] { "folder_id", "user_id", "category" });

            migrationBuilder.CreateIndex(
                name: "ix_storage_reservations_result_item_id_user_id_category",
                table: "storage_reservations",
                columns: new[] { "result_item_id", "user_id", "category" });

            migrationBuilder.CreateIndex(
                name: "ix_storage_reservations_user_id_client_upload_id",
                table: "storage_reservations",
                columns: new[] { "user_id", "client_upload_id" },
                unique: true);

            // Parent links are immutable in the current create/open/delete-empty product scope.
            // Requiring an existing parent and deriving depth closes cycles, including multi-row inserts.
            migrationBuilder.Sql("""
                CREATE FUNCTION wukna_library_folder_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
                DECLARE parent_depth integer;
                BEGIN
                    IF TG_OP = 'UPDATE' THEN
                        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id
                            OR NEW.category IS DISTINCT FROM OLD.category OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
                            OR NEW.depth IS DISTINCT FROM OLD.depth THEN
                            RAISE EXCEPTION 'Library folder hierarchy is immutable.'
                                USING ERRCODE = '23514', CONSTRAINT = 'ck_library_folder_hierarchy';
                        END IF;
                    ELSIF NEW.parent_id IS NULL THEN
                        NEW.depth := 0;
                    ELSE
                        SELECT depth INTO parent_depth FROM library_folders
                            WHERE id = NEW.parent_id AND user_id = NEW.user_id AND category = NEW.category
                            FOR KEY SHARE;
                        IF NOT FOUND THEN
                            RAISE EXCEPTION 'Library folder parent must exist in the same owner and category.'
                                USING ERRCODE = '23503', CONSTRAINT = 'fk_library_folder_owned_parent';
                        END IF;
                        NEW.depth := parent_depth + 1;
                    END IF;
                    RETURN NEW;
                END;
                $$;
                CREATE TRIGGER library_folders_hierarchy BEFORE INSERT OR UPDATE ON library_folders
                    FOR EACH ROW EXECUTE FUNCTION wukna_library_folder_hierarchy();

                CREATE FUNCTION wukna_library_upload_completion() RETURNS trigger LANGUAGE plpgsql AS $$
                DECLARE current_upload storage_reservations%ROWTYPE;
                BEGIN
                    -- Read the final row, not an earlier queued trigger's NEW snapshot.
                    SELECT * INTO current_upload FROM storage_reservations WHERE id = NEW.id;
                    IF FOUND AND current_upload.state = 3 AND current_upload.result_item_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM library_assets
                            WHERE item_id = current_upload.result_item_id AND user_id = current_upload.user_id
                                AND category = current_upload.category AND processing_status = 3) THEN
                        RAISE EXCEPTION 'Library upload completion requires an available owned asset.'
                            USING ERRCODE = '23514', CONSTRAINT = 'ck_library_upload_available_asset';
                    END IF;
                    RETURN NULL;
                END;
                $$;
                CREATE CONSTRAINT TRIGGER library_upload_completion AFTER INSERT OR UPDATE ON storage_reservations
                    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION wukna_library_upload_completion();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TRIGGER library_upload_completion ON storage_reservations;
                DROP FUNCTION wukna_library_upload_completion();
                DROP TRIGGER library_folders_hierarchy ON library_folders;
                DROP FUNCTION wukna_library_folder_hierarchy();
                """);
            migrationBuilder.DropTable(
                name: "library_blob_work");

            migrationBuilder.DropTable(
                name: "library_collection_items");

            migrationBuilder.DropTable(
                name: "library_documents");

            migrationBuilder.DropTable(
                name: "library_videos");

            migrationBuilder.DropTable(
                name: "storage_reservations");

            migrationBuilder.DropTable(
                name: "library_collections");

            migrationBuilder.DropTable(
                name: "library_assets");

            migrationBuilder.DropTable(
                name: "storage_entitlements");

            migrationBuilder.DropTable(
                name: "library_items");

            migrationBuilder.DropTable(
                name: "library_folders");
        }
    }
}

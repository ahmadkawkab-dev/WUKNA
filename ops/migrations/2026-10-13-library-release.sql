-- Reviewed production upgrade: 16-migration onboarding baseline -> 20 migrations.
-- Run with psql -X -v ON_ERROR_STOP=1 while the API/frontend are stopped.
-- Generated EF body: --idempotent --no-transactions; wrapper makes the release atomic.
-- Supports replay and a contiguous prefix of this release; rejects other histories.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
LOCK TABLE "__EFMigrationsHistory" IN EXCLUSIVE MODE;
DO $WUKNA_RELEASE$
DECLARE
    expected text[] := ARRAY[
        '20260915144829_InitialCreate',
        '20260915215039_FinalizeModelsAndExternalLogin',
        '20260921172023_AddBoardUpdatedAt',
        '20260923153200_AddProfileManagement',
        '20260928153353_TrackConnectionVersions',
        '20260930154807_AddPersonalTasks',
        '20260930165025_AddTaskListsAndPlanningSettings',
        '20260930173527_CascadeTaskListDeletion',
        '20260930174224_AddCalendarEvents',
        '20261001110733_AddTaskTemplates',
        '20261001165613_AddTaskRemindersAndNotifications',
        '20261002192234_AddBoardChatFoundation',
        '20261003214259_AddChatTaskCalendarImports',
        '20261003235804_AddNotificationFoundation',
        '20261004004046_AddNotificationDelivery',
        '20261004180751_AddUserOnboarding',
        '20261009181230_AddBoardCardAppearance',
        '20261011112213_AddPersonalLibraryFoundation',
        '20261011134920_AddLibraryVideoMetadata',
        '20261011172023_LimitLibraryAccountsToOneGigabyte'
    ];
    applied text[];
BEGIN
    SELECT array_agg(migration_id::text ORDER BY migration_id) INTO applied
    FROM "__EFMigrationsHistory";
    IF cardinality(applied) IS NULL OR cardinality(applied) < 16
        OR cardinality(applied) > 20
        OR applied IS DISTINCT FROM expected[1:cardinality(applied)] THEN
        RAISE EXCEPTION 'Unexpected Wukna migration history; expected onboarding baseline plus a contiguous Library release prefix.';
    END IF;
END $WUKNA_RELEASE$;
DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261009181230_AddBoardCardAppearance') THEN
    ALTER TABLE boards ADD card_color character varying(16);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261009181230_AddBoardCardAppearance') THEN
    ALTER TABLE boards ADD card_color_version integer NOT NULL DEFAULT 0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261009181230_AddBoardCardAppearance') THEN
    ALTER TABLE boards ADD CONSTRAINT ck_boards_card_color CHECK (card_color IS NULL OR card_color IN ('sage', 'blue', 'lavender', 'clay', 'gold', 'rose'));
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261009181230_AddBoardCardAppearance') THEN
    ALTER TABLE boards ADD CONSTRAINT ck_boards_card_color_version CHECK (card_color_version >= 0);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261009181230_AddBoardCardAppearance') THEN
    INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
    VALUES ('20261009181230_AddBoardCardAppearance', '10.0.12');
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_blob_work (
        id uuid NOT NULL,
        user_id uuid NOT NULL,
        asset_id uuid,
        purpose integer NOT NULL,
        object_key character varying(200) NOT NULL,
        charged_bytes bigint NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT (now()),
        due_at timestamp with time zone NOT NULL,
        lease_token uuid,
        lease_expires_at timestamp with time zone,
        attempts integer NOT NULL,
        last_error_code character varying(100),
        CONSTRAINT pk_library_blob_work PRIMARY KEY (id),
        CONSTRAINT ck_library_blob_work_counters CHECK (charged_bytes >= 0 AND attempts >= 0),
        CONSTRAINT ck_library_blob_work_dates CHECK (due_at >= created_at),
        CONSTRAINT ck_library_blob_work_identity CHECK (user_id <> '00000000-0000-0000-0000-000000000000' AND (asset_id IS NULL OR asset_id <> '00000000-0000-0000-0000-000000000000')),
        CONSTRAINT ck_library_blob_work_key CHECK (object_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$'),
        CONSTRAINT ck_library_blob_work_lease CHECK ((lease_token IS NULL AND lease_expires_at IS NULL) OR
    (lease_token IS NOT NULL AND lease_token <> '00000000-0000-0000-0000-000000000000'
        AND lease_expires_at IS NOT NULL AND lease_expires_at > created_at)),
        CONSTRAINT ck_library_blob_work_purpose CHECK (purpose IN (0, 1)),
        CONSTRAINT ck_library_blob_work_scan CHECK (purpose <> 0 OR (asset_id IS NOT NULL AND charged_bytes = 0 AND object_key LIKE 'library/quarantine/%'))
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_collections (
        id uuid NOT NULL,
        user_id uuid NOT NULL,
        name character varying(160) NOT NULL,
        description character varying(2000),
        created_at timestamp with time zone NOT NULL DEFAULT (now()),
        updated_at timestamp with time zone NOT NULL DEFAULT (now()),
        CONSTRAINT pk_library_collections PRIMARY KEY (id),
        CONSTRAINT ak_library_collections_id_user_id UNIQUE (id, user_id),
        CONSTRAINT ck_library_collection_dates CHECK (updated_at >= created_at),
        CONSTRAINT ck_library_collection_name CHECK (char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'),
        CONSTRAINT fk_library_collections_users_user_id FOREIGN KEY (user_id) REFERENCES asp_net_users (id) ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_folders (
        id uuid NOT NULL,
        user_id uuid NOT NULL,
        category integer NOT NULL,
        name character varying(160) NOT NULL,
        normalized_name character varying(160) GENERATED ALWAYS AS (upper(btrim(name))) STORED NOT NULL,
        parent_id uuid,
        depth integer NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT (now()),
        updated_at timestamp with time zone NOT NULL DEFAULT (now()),
        CONSTRAINT pk_library_folders PRIMARY KEY (id),
        CONSTRAINT ak_library_folders_id_user_id_category UNIQUE (id, user_id, category),
        CONSTRAINT ck_library_folder_category CHECK (category IN (0, 1, 2)),
        CONSTRAINT ck_library_folder_dates CHECK (updated_at >= created_at),
        CONSTRAINT ck_library_folder_depth CHECK (depth BETWEEN 0 AND 32),
        CONSTRAINT ck_library_folder_name CHECK (char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'),
        CONSTRAINT ck_library_folder_parent CHECK (parent_id IS NULL OR parent_id <> id),
        CONSTRAINT fk_library_folders_library_folders_parent_id_user_id_category FOREIGN KEY (parent_id, user_id, category) REFERENCES library_folders (id, user_id, category) ON DELETE RESTRICT,
        CONSTRAINT fk_library_folders_users_user_id FOREIGN KEY (user_id) REFERENCES asp_net_users (id) ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE storage_entitlements (
        user_id uuid NOT NULL,
        quota_bytes bigint NOT NULL DEFAULT 5000000000,
        source integer NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT (now()),
        updated_at timestamp with time zone NOT NULL DEFAULT (now()),
        CONSTRAINT pk_storage_entitlements PRIMARY KEY (user_id),
        CONSTRAINT ck_storage_entitlement_dates CHECK (updated_at >= created_at),
        CONSTRAINT ck_storage_entitlement_quota CHECK (quota_bytes > 0),
        CONSTRAINT ck_storage_entitlement_source CHECK (source IN (0, 1, 2)),
        CONSTRAINT fk_storage_entitlements_asp_net_users_user_id FOREIGN KEY (user_id) REFERENCES asp_net_users (id) ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_items (
        id uuid NOT NULL,
        user_id uuid NOT NULL,
        category integer NOT NULL,
        name character varying(160) NOT NULL,
        description character varying(2000),
        notes character varying(4000) NOT NULL,
        tags text[] NOT NULL,
        folder_id uuid,
        favorite boolean NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT (now()),
        updated_at timestamp with time zone NOT NULL DEFAULT (now()),
        deleted_at timestamp with time zone,
        CONSTRAINT pk_library_items PRIMARY KEY (id),
        CONSTRAINT ak_library_items_id_user_id UNIQUE (id, user_id),
        CONSTRAINT ak_library_items_id_user_id_category UNIQUE (id, user_id, category),
        CONSTRAINT ck_library_item_category CHECK (category IN (0, 1, 2)),
        CONSTRAINT ck_library_item_dates CHECK (updated_at >= created_at AND (deleted_at IS NULL OR deleted_at >= created_at)),
        CONSTRAINT ck_library_item_name CHECK (char_length(btrim(name)) > 0 AND name !~ '[[:cntrl:]]'),
        CONSTRAINT ck_library_item_tags CHECK (cardinality(tags) <= 12 AND array_position(tags, NULL) IS NULL
    AND (cardinality(tags) = 0 OR (array_ndims(tags) = 1
        AND array_to_string(tags, '') !~ '[[:cntrl:]]'
        AND array_to_string(tags, chr(31)) ~ ('^[^' || chr(31) || ']{1,40}(' || chr(31) || '[^' || chr(31) || ']{1,40})*$')))),
        CONSTRAINT fk_library_items_library_folders_folder_id_user_id_category FOREIGN KEY (folder_id, user_id, category) REFERENCES library_folders (id, user_id, category) ON DELETE RESTRICT,
        CONSTRAINT fk_library_items_users_user_id FOREIGN KEY (user_id) REFERENCES asp_net_users (id) ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_assets (
        id uuid NOT NULL,
        item_id uuid NOT NULL,
        user_id uuid NOT NULL,
        category integer NOT NULL,
        original_file_name character varying(255) NOT NULL,
        content_type character varying(100),
        size_bytes bigint NOT NULL,
        checksum character varying(64),
        original_storage_key character varying(200),
        thumbnail_storage_key character varying(200),
        thumbnail_bytes bigint NOT NULL,
        stored_bytes bigint NOT NULL,
        width integer,
        height integer,
        processing_status integer NOT NULL,
        verified_at timestamp with time zone,
        scanned_at timestamp with time zone,
        scan_verdict integer,
        last_error_code character varying(100),
        created_at timestamp with time zone NOT NULL DEFAULT (now()),
        updated_at timestamp with time zone NOT NULL DEFAULT (now()),
        CONSTRAINT pk_library_assets PRIMARY KEY (id),
        CONSTRAINT ak_library_assets_item_id_user_id_category UNIQUE (item_id, user_id, category),
        CONSTRAINT ck_library_asset_available CHECK (processing_status <> 3 OR (verified_at IS NOT NULL AND scanned_at IS NOT NULL AND scan_verdict IS NOT NULL AND scan_verdict = 0
        AND original_storage_key LIKE 'library/available/%'
        AND (thumbnail_storage_key IS NULL OR thumbnail_storage_key LIKE 'library/available/%')
        AND (category <> 0 OR (width IS NOT NULL AND height IS NOT NULL AND thumbnail_storage_key IS NOT NULL)))),
        CONSTRAINT ck_library_asset_category CHECK (category IN (0, 1)),
        CONSTRAINT ck_library_asset_checksum CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_library_asset_dates CHECK (updated_at >= created_at AND (verified_at IS NULL OR verified_at >= created_at)),
        CONSTRAINT ck_library_asset_dimensions CHECK ((width IS NULL AND height IS NULL) OR (category = 0 AND width > 0 AND height > 0 AND width IS NOT NULL AND height IS NOT NULL)),
        CONSTRAINT ck_library_asset_filename CHECK (char_length(btrim(original_file_name)) > 0 AND original_file_name !~ '[[:cntrl:]/\\]'),
        CONSTRAINT ck_library_asset_keys CHECK ((original_storage_key IS NULL OR original_storage_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$')
    AND (thumbnail_storage_key IS NULL OR thumbnail_storage_key ~ '^library/(quarantine|available)/[0-9a-f]{32}$')
    AND (thumbnail_storage_key IS NULL) = (thumbnail_bytes = 0)
    AND (thumbnail_storage_key IS NULL OR thumbnail_storage_key <> original_storage_key)),
        CONSTRAINT ck_library_asset_scan CHECK ((scan_verdict IS NULL AND scanned_at IS NULL) OR
    (scan_verdict IS NOT NULL AND scan_verdict IN (0, 1) AND scanned_at IS NOT NULL AND verified_at IS NOT NULL
        AND scanned_at >= verified_at AND (scan_verdict = 0 OR processing_status = 4))),
        CONSTRAINT ck_library_asset_sizes CHECK (size_bytes >= 0 AND thumbnail_bytes >= 0 AND stored_bytes >= size_bytes AND stored_bytes - size_bytes >= thumbnail_bytes),
        CONSTRAINT ck_library_asset_status CHECK (processing_status IN (0, 1, 2, 3, 4)),
        CONSTRAINT ck_library_asset_verified CHECK (verified_at IS NULL OR (size_bytes > 0 AND content_type IS NOT NULL AND char_length(content_type) > 0 AND checksum IS NOT NULL AND original_storage_key IS NOT NULL)),
        CONSTRAINT fk_library_assets_library_items_item_id_user_id_category FOREIGN KEY (item_id, user_id, category) REFERENCES library_items (id, user_id, category) ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_collection_items (
        collection_id uuid NOT NULL,
        item_id uuid NOT NULL,
        user_id uuid NOT NULL,
        added_at timestamp with time zone NOT NULL DEFAULT (now()),
        CONSTRAINT pk_library_collection_items PRIMARY KEY (collection_id, item_id),
        CONSTRAINT fk_library_collection_items_library_collections_collection_id_ FOREIGN KEY (collection_id, user_id) REFERENCES library_collections (id, user_id) ON DELETE CASCADE,
        CONSTRAINT fk_library_collection_items_library_items_item_id_user_id FOREIGN KEY (item_id, user_id) REFERENCES library_items (id, user_id) ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_videos (
        item_id uuid NOT NULL,
        user_id uuid NOT NULL,
        category integer NOT NULL,
        provider integer NOT NULL,
        video_id character varying(20),
        url character varying(2048) NOT NULL,
        creator character varying(200),
        metadata_fetched_at timestamp with time zone,
        metadata_error_code character varying(100),
        url_lookup_hash character varying(32) GENERATED ALWAYS AS (md5(url)) STORED,
        CONSTRAINT pk_library_videos PRIMARY KEY (item_id),
        CONSTRAINT ck_library_video_category CHECK (category = 2),
        CONSTRAINT ck_library_video_reference CHECK ((provider = 0 AND video_id IS NOT NULL AND video_id ~ '^[A-Za-z0-9_-]{11}$' AND url = 'https://www.youtube.com/watch?v=' || video_id)
    OR (provider = 1 AND video_id IS NOT NULL AND video_id ~ '^[0-9]{1,20}$' AND url = 'https://vimeo.com/' || video_id)
    OR (provider = 2 AND video_id IS NULL AND url ~ '^https://[^/@[:space:]]+(/|$)' AND url !~ '[[:cntrl:]]')),
        CONSTRAINT fk_library_videos_library_items_item_id_user_id_category FOREIGN KEY (item_id, user_id, category) REFERENCES library_items (id, user_id, category) ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE library_documents (
        item_id uuid NOT NULL,
        user_id uuid NOT NULL,
        category integer NOT NULL,
        preview_kind integer NOT NULL,
        language character varying(20),
        encoding character varying(10),
        source_text text,
        CONSTRAINT pk_library_documents PRIMARY KEY (item_id),
        CONSTRAINT ck_library_document_category CHECK (category = 1),
        CONSTRAINT ck_library_document_kind CHECK (preview_kind IN (0, 1, 2, 3)),
        CONSTRAINT ck_library_document_language CHECK ((preview_kind = 1 AND language IS NOT NULL AND language IN
        ('csharp','typescript','javascript','tsx','jsx','css','html','python','sql','json','bash','plaintext'))
    OR (preview_kind <> 1 AND language IS NULL)),
        CONSTRAINT ck_library_document_source CHECK ((preview_kind IN (1, 2) AND source_text IS NOT NULL AND octet_length(source_text) <= 256000 AND encoding IS NOT NULL AND encoding = 'utf-8')
    OR (preview_kind IN (0, 3) AND source_text IS NULL AND encoding IS NULL)),
        CONSTRAINT fk_library_documents_library_assets_item_id_user_id_category FOREIGN KEY (item_id, user_id, category) REFERENCES library_assets (item_id, user_id, category) ON DELETE CASCADE,
        CONSTRAINT fk_library_documents_library_items_item_id_user_id_category FOREIGN KEY (item_id, user_id, category) REFERENCES library_items (id, user_id, category) ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE TABLE storage_reservations (
        id uuid NOT NULL,
        user_id uuid NOT NULL,
        client_upload_id uuid NOT NULL,
        request_fingerprint character varying(64) NOT NULL,
        category integer NOT NULL,
        file_name character varying(255) NOT NULL,
        declared_content_type character varying(100) NOT NULL,
        declared_size_bytes bigint NOT NULL,
        declared_checksum character varying(64) NOT NULL,
        folder_id uuid,
        reserved_bytes bigint NOT NULL,
        state integer NOT NULL,
        attempt_id uuid,
        lease_token uuid,
        lease_expires_at timestamp with time zone,
        cancellation_requested_at timestamp with time zone,
        result_item_id uuid,
        result_purged_at timestamp with time zone,
        completed_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT (now()),
        updated_at timestamp with time zone NOT NULL DEFAULT (now()),
        expires_at timestamp with time zone NOT NULL,
        last_error_code character varying(100),
        CONSTRAINT pk_storage_reservations PRIMARY KEY (id),
        CONSTRAINT ck_library_upload_category CHECK (category IN (0, 1)),
        CONSTRAINT ck_library_upload_dates CHECK (updated_at >= created_at AND expires_at > created_at AND (completed_at IS NULL OR completed_at >= created_at)),
        CONSTRAINT ck_library_upload_filename CHECK (char_length(btrim(file_name)) > 0 AND file_name !~ '[[:cntrl:]/\\]' AND char_length(btrim(declared_content_type)) > 0),
        CONSTRAINT ck_library_upload_identity CHECK (client_upload_id <> '00000000-0000-0000-0000-000000000000' AND request_fingerprint ~ '^[0-9a-f]{64}$' AND declared_checksum ~ '^[0-9a-f]{64}$'),
        CONSTRAINT ck_library_upload_lease CHECK (((lease_token IS NULL AND lease_expires_at IS NULL) OR
        (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND attempt_id IS NOT NULL
            AND lease_expires_at > created_at))
    AND (state <> 1 OR lease_token IS NOT NULL)
    AND (state IN (0, 1, 2) OR lease_token IS NULL)
    AND (lease_token IS NULL OR lease_token <> '00000000-0000-0000-0000-000000000000')
    AND (attempt_id IS NULL OR attempt_id <> '00000000-0000-0000-0000-000000000000')),
        CONSTRAINT ck_library_upload_result CHECK ((state = 3 AND reserved_bytes = 0 AND completed_at IS NOT NULL AND
        ((result_item_id IS NOT NULL AND result_purged_at IS NULL) OR
         (result_item_id IS NULL AND result_purged_at IS NOT NULL AND result_purged_at >= completed_at)))
    OR (state = 2 AND completed_at IS NULL AND result_item_id IS NOT NULL AND result_purged_at IS NULL)
    OR (state NOT IN (2, 3) AND completed_at IS NULL AND result_item_id IS NULL AND result_purged_at IS NULL)),
        CONSTRAINT ck_library_upload_sizes CHECK (declared_size_bytes > 0 AND reserved_bytes >= 0 AND (state NOT IN (0, 1) OR reserved_bytes >= declared_size_bytes)),
        CONSTRAINT ck_library_upload_state CHECK (state IN (0, 1, 2, 3, 4, 5, 6)),
        CONSTRAINT ck_library_upload_terminal_folder CHECK (state IN (0, 1, 2) OR folder_id IS NULL),
        CONSTRAINT fk_storage_reservations_library_assets_result_item_id_user_id_ FOREIGN KEY (result_item_id, user_id, category) REFERENCES library_assets (item_id, user_id, category) ON DELETE RESTRICT,
        CONSTRAINT fk_storage_reservations_library_folders_folder_id_user_id_cate FOREIGN KEY (folder_id, user_id, category) REFERENCES library_folders (id, user_id, category) ON DELETE RESTRICT,
        CONSTRAINT fk_storage_reservations_library_items_result_item_id_user_id_c FOREIGN KEY (result_item_id, user_id, category) REFERENCES library_items (id, user_id, category) ON DELETE RESTRICT,
        CONSTRAINT fk_storage_reservations_storage_entitlements_user_id FOREIGN KEY (user_id) REFERENCES storage_entitlements (user_id) ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE UNIQUE INDEX ix_library_assets_original_storage_key ON library_assets (original_storage_key) WHERE original_storage_key IS NOT NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE UNIQUE INDEX ix_library_assets_thumbnail_storage_key ON library_assets (thumbnail_storage_key) WHERE thumbnail_storage_key IS NOT NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_assets_user_id_size_bytes_id ON library_assets (user_id, size_bytes, id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_blob_work_due_at_id ON library_blob_work (due_at, id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE UNIQUE INDEX ix_library_blob_work_purpose_object_key ON library_blob_work (purpose, object_key);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_blob_work_user_id_purpose ON library_blob_work (user_id, purpose);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_collection_items_collection_id_user_id ON library_collection_items (collection_id, user_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_collection_items_item_id_user_id ON library_collection_items (item_id, user_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_collections_user_id_created_at_id ON library_collections (user_id, created_at, id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE UNIQUE INDEX ix_library_documents_item_id_user_id_category ON library_documents (item_id, user_id, category);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_folders_parent_id_user_id_category ON library_folders (parent_id, user_id, category);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE UNIQUE INDEX ix_library_folders_sibling_name ON library_folders (user_id, category, parent_id, normalized_name) NULLS NOT DISTINCT;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_folders_user_id_name_id ON library_folders (user_id, name, id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_items_folder_id_user_id_category ON library_items (folder_id, user_id, category);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_items_user_id_category_created_at_id ON library_items (user_id, category, created_at, id) WHERE deleted_at IS NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_items_user_id_created_at_id ON library_items (user_id, created_at, id) WHERE deleted_at IS NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_items_user_id_created_at_id1 ON library_items (user_id, created_at, id) WHERE deleted_at IS NULL AND favorite;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_items_user_id_deleted_at_id ON library_items (user_id, deleted_at, id) WHERE deleted_at IS NOT NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_items_user_id_name_id ON library_items (user_id, name, id) WHERE deleted_at IS NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_items_user_id_updated_at_id ON library_items (user_id, updated_at, id) WHERE deleted_at IS NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE UNIQUE INDEX ix_library_videos_item_id_user_id_category ON library_videos (item_id, user_id, category);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_library_videos_user_id_url_lookup_hash ON library_videos (user_id, url_lookup_hash);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_storage_reservations_expires_at_id ON storage_reservations (expires_at, id) WHERE state IN (0, 1, 2);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_storage_reservations_folder_id_user_id_category ON storage_reservations (folder_id, user_id, category);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE INDEX ix_storage_reservations_result_item_id_user_id_category ON storage_reservations (result_item_id, user_id, category);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    CREATE UNIQUE INDEX ix_storage_reservations_user_id_client_upload_id ON storage_reservations (user_id, client_upload_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
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
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011112213_AddPersonalLibraryFoundation') THEN
    INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
    VALUES ('20261011112213_AddPersonalLibraryFoundation', '10.0.12');
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011134920_AddLibraryVideoMetadata') THEN
    ALTER TABLE library_videos ADD provider_title character varying(200);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011134920_AddLibraryVideoMetadata') THEN
    ALTER TABLE library_videos ADD thumbnail_url character varying(2048);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011134920_AddLibraryVideoMetadata') THEN
    ALTER TABLE library_videos ADD CONSTRAINT ck_library_video_thumbnail CHECK (thumbnail_url IS NULL OR (provider = 0 AND thumbnail_url ~ '^https://i[.]ytimg[.]com/vi/') OR (provider = 1 AND thumbnail_url ~ '^https://i[.]vimeocdn[.]com/video/'));
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011134920_AddLibraryVideoMetadata') THEN
    INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
    VALUES ('20261011134920_AddLibraryVideoMetadata', '10.0.12');
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011172023_LimitLibraryAccountsToOneGigabyte') THEN
    UPDATE storage_entitlements
    SET quota_bytes = 1000000000,
        updated_at = GREATEST(updated_at, now())
    WHERE quota_bytes > 1000000000;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011172023_LimitLibraryAccountsToOneGigabyte') THEN
    ALTER TABLE storage_entitlements ALTER COLUMN quota_bytes SET DEFAULT 1000000000;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "migration_id" = '20261011172023_LimitLibraryAccountsToOneGigabyte') THEN
    INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
    VALUES ('20261011172023_LimitLibraryAccountsToOneGigabyte', '10.0.12');
    END IF;
END $EF$;

COMMIT;

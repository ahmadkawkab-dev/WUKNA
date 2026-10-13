# Production release: Library and rebranding

This is the current release procedure. The October 4 runbook and its SQL describe
an older release and must not be used for this upgrade. The owner performs VM
operations and merges `wukna/production-stack` into `main`; preparation on the
production-stack branch does not deploy the application.

## Confirmed preparation

The owner confirmed the live database has exactly 16 migrations, ending at
`20261004180751_AddUserOnboarding`. Its existing application data must be retained.
The running API is commit `5be45cc6cb55cbaa54930b3b01b04df668c3ca0c`.

The October 12 online preparation backup was checksum-verified, restored into an
isolated PostgreSQL container, and copied to protected off-VM storage. The restored
counts were six users, five boards, 16 notes, zero personal tasks, 16 chat messages
and 16 migrations. This is not the final maintenance backup: users could continue
writing afterwards, and it predates the new Library credentials.

The private SeaweedFS container is healthy. The owner verified the empty
`wukna-library` bucket is owned by `wukna-library` and SeaweedFS has no published
host ports. This does not yet verify signed S3 transfers or production Library
uploads. Chat's existing `clamd` container will scan Library files too.

## Reviewed upgrade

`ops/migrations/2026-10-13-library-release.sql` applies these four migrations:

1. `20261009181230_AddBoardCardAppearance`
2. `20261011112213_AddPersonalLibraryFoundation`
3. `20261011134920_AddLibraryVideoMetadata`
4. `20261011172023_LimitLibraryAccountsToOneGigabyte`

It adds board appearance and the owned Library schema, video metadata and a
decimal 1 GB (1,000,000,000 bytes) account default. Existing grants above 1 GB are
lowered; files, reservations and cleanup charges are retained. An account already
above the limit must release storage before uploading more. Smaller manual grants
remain smaller.

Generate the EF body with:

```bash
dotnet ef migrations script 20261004180751_AddUserOnboarding \
  20261011172023_LimitLibraryAccountsToOneGigabyte \
  --idempotent --no-transactions --configuration Release --no-build
```

The committed artifact adds an outer transaction, local timeouts and a history
guard before that body. Preserve this wrapper when regenerating. It accepts the
exact 16-migration baseline, a contiguous prefix of the four release migrations,
or the complete 20-migration history. It rejects older, unknown and gapped
histories. All four upgrades commit together; with `ON_ERROR_STOP=1`, a failure
leaves this release's schema/history changes uncommitted. Never insert history
rows manually. Existing migration sources remain unchanged.

## Install the optional deployment configuration

Keep `PROD_AUTO_DEPLOY=false`. Stage artifacts from a recorded full commit SHA
and verify their SHA256 hashes against that commit before root installation:

- `compose.production.yaml`
- `compose.attachments.production.yaml`
- `compose.library.production.yaml`
- `compose.library.services.yaml`
- `ops/library-filer.toml`
- `ops/production-deploy`
- the reviewed Library release SQL

Back up the currently installed configuration and helper first. Install Compose
files and filer TOML as root:root mode 0644 under `/home/ubuntu/wukna-deploy`, and
the helper as root:root mode 0755 at `/usr/local/sbin/wukna-deploy`. Preserve the
existing root-owned mode 0700 `/etc/wukna` directory and mode 0600 production env.

Library opts into the helper through `/etc/wukna/library.enabled`: a root-owned
mode 0600 regular file containing `enabled`. Preserve the existing attachment
marker. The Library marker changes future helper runs; writing it does not
restart the application or change the database.

Keep `/etc/wukna/library-storage` root-owned mode 0700 and `storage.env` root-owned
mode 0600 (0400 is also accepted). Retain the generated credentials. The pinned
SeaweedFS entrypoint runs as UID/GID 1000, so `library-s3.json` must be root:1000
mode 0640, mounted read-only. Do not rotate credentials during this upgrade.

The helper uses both env files without sourcing shell code. It adds the Library
override after the base and any Chat override. Library extends the production
scanner definition even when Chat is disabled. `check` validates configuration,
database health and the existing API key-ring mount without pulling images or
changing containers. Run it with the full intended release SHA:

```bash
sudo /usr/local/sbin/wukna-deploy check RELEASE_SHA
```

`RELEASE_SHA` is a placeholder. Before maintenance, the owner merges to `main`,
waits for CI and both ARM64 image publishes, records the resulting full SHA,
checks the installed artifacts against that release and pulls those exact images.
The GitHub deployment workflow intentionally rejects migration-file changes
between the running and target releases, even after SQL has been applied. Use the
reviewed VM procedure for this release and retain that gate.

## Maintenance and final backup

Stop the API and frontend to stop writes; keep PostgreSQL running. Record the
running images and volume mounts first. Before SQL, make a fresh private backup
set containing:

- A custom-format PostgreSQL dump and ordered migration history/row counts.
- Current `/etc/wukna`, installed Compose files and deployment helper, preserving
  ownership and modes, including Library's new credentials and both markers.
- The existing Data Protection keys and profile images from their stopped API
  volumes, mounted read-only for archival.
- The matching SeaweedFS `/data` volume after stopping SeaweedFS cleanly. Retain
  the volume; a live recursive copy of LevelDB/volume files is not consistent.

Use new timestamped root-owned mode 0700 directories and mode 0600 backup files.
Do not overwrite the preparation backup or print credentials. Hash every archive,
copy the set off the VM into protected storage and verify the copied hashes.
Restore the dump into a disposable PostgreSQL 17 container with no production
mounts or published ports and `--network none`; wait until TCP SQL queries succeed,
then use `pg_restore --exit-on-error --no-owner --no-privileges`. Compare baseline
history and row counts. Rehearse the exact release SQL on that disposable restore
and verify all 20 migrations and preserved domain counts before production SQL.
Remove only the disposable container. If backup/rehearsal fails, restart the old
application containers and resolve it before applying SQL.

## Apply and validate

After the final backup, isolated rehearsal, artifact/image verification and
maintenance preparation, the owner runs the staged script. In fish, start Bash
explicitly for redirection (replace `STAGED_SQL_PATH` with the verified path):

```bash
sudo bash -c 'set -euo pipefail; /usr/bin/docker exec -i wukna-prod-db-1 psql -X -U wukna -d wukna -v ON_ERROR_STOP=1 < STAGED_SQL_PATH'
```

Verify history now has 20 entries and ends at
`20261011172023_LimitLibraryAccountsToOneGigabyte`. Deploy the exact published
release SHA through the reviewed helper. It does not back up or migrate the DB.
It starts SeaweedFS, verifies the existing `wukna-prod_library_objects` mount,
waits for the shared scanner, then replaces only API/frontend. A failed dependency
stops before application replacement. The existing database, key-ring,
profile-image and scanner signature volumes must remain attached.

Verify HTTPS, login, existing boards/notes/tasks/chat/profile images, rebranding
and desktop/mobile navigation. Test a real clean picture and code document upload,
preview/download/reload, folder/collection/video links, favorites, Trash,
restore/purge and eventual storage-charge release. Confirm 1 GB account storage,
anonymous/cross-account denial and scanner failure behavior. Use only disposable
operator test files/accounts; do not purge user data. Keep auto-deployment disabled
until the owner completes validation. Container health alone is not this evidence.

After migration, reverting images alone is not a complete rollback. Stop writers,
retain the failed state/logs, and choose a reviewed recovery procedure using the
matching pre-release database, object store, key ring, profile images and private
configuration. Do not reverse history or remove Library objects to force recovery.

## Repository verification

Local preparation checks on October 13, 2026: the Release build passed with zero
warnings/errors; the complete backend suite passed with 396 successes, zero
failures and two skipped opt-in tests (398 total, including seven release-SQL
checks). All nine isolated deployment-helper tests passed. The resolved Compose
models retained the existing shared scanner, database, API settings and volumes,
and private Library networking with no published storage ports. Production SQL
and the new application images have not been applied by this preparation.

The release SQL tests use disposable PostgreSQL 17 databases to verify preserved
domain rows, replay from supported baselines, the SQL quota default, rejected
unexpected histories and complete rollback after a later SQL failure. Deployment
helper tests run inside an isolated container with a fake Docker executable and
no host secrets/socket. They cover base/Chat/Library combinations, read-only
preflight, file protections, dependency failures and wrong storage volumes. CI
runs both and requires operations checks before publishing images. These tests
do not replace the owner's restored-production rehearsal or live feature checks.
The shared API test factory disables Library storage and its worker explicitly so
normal tests cannot inherit a contributor's live development storage settings;
storage-specific factories opt in to controlled fixtures.

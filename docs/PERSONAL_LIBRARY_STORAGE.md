# Personal Library private storage

Storage implemented in Phase 5; final account/subscription integration completed
in phases 6–7 on October 11, 2026. Production deployment remains a
separate, explicitly approved operation. The default API leaves storage disabled
unless `Library:Storage:Enabled=true` and valid private credentials are supplied.

## Design and boundaries

`ILibraryFileStorage` is a feature-owned, generated-key-only boundary implemented
with the official AWS S3 SDK against SeaweedFS. It exposes put, bounded read,
confirmed deletion and existence checks. It cannot create public URLs, choose
arbitrary buckets from a request, or issue credentials to a browser. PostgreSQL
stores metadata and the authoritative per-owner quota/reservation ledger.

The current 20,000,000-byte ceiling fits a single S3 PutObject. Multipart uploads
would introduce separate abandoned-part accounting and recovery without improving
this bounded workflow, so they are not enabled. The SDK has no automatic write
retry; durable application session replay determines whether another write is
safe. Requests and S3 operations have explicit deadlines and concurrency limits.
No video binaries are downloaded or stored.

The upload flow is:

1. Reserve capacity using the existing owned, idempotent upload-session API.
2. Claim a generated attempt and a bounded lease while holding the owner lock.
   A dedicated PostgreSQL session advisory lock coordinates that attempt with
   recovery across replicas, without holding a SQL transaction during I/O.
3. Stream into a private, randomly named temporary quarantine file (0600 files,
   0700 directory on Linux), checking exact length and SHA-256. User filenames
   never determine a filesystem path or S3 key.
4. Require an exact clean ClamAV INSTREAM verdict. Scanner outages fail closed.
   Decode supported images with bounded pixels/memory; check strict UTF-8 text,
   PDF header/end structure, and bounded, non-extracted OOXML package contents.
   Reject archive traversal, duplicate entries, macros, embedded objects, invalid
   XML and archive expansion limits. Uploaded HTML/code is displayed as escaped
   text. PDF structural checks plus scanning do not constitute full PDF content
   disarm/reconstruction; native PDF rendering is browser-dependent.
5. Generate a static PNG thumbnail within 480×480 for pictures, remove metadata,
   and scan the derivative too. Recheck cancellation/expiry before remote writes.
6. Write only validated, scanned bytes to generated private available keys.
   Atomically publish an available item/asset and transfer its actual original
   and derivative byte charge from the reservation. No failed/quarantined upload
   appears as a completed Library item.
7. Finalize replays the completed result or its permanent-purge tombstone.

Downloads and thumbnails use owned API routes and bounded backend reads; originals
are checksum-verified before response. Authorization/status is checked again
after storage I/O. Responses are no-store/nosniff, originals have attachment
disposition, and file responses set a sandbox CSP. Available DTOs contain API
references, never private keys. Native picture/PDF previews use authenticated
Blobs; code/text previews use the verified, bounded source cache.

Receiving failures that may have written remotely transfer conservative original
and thumbnail charges to durable deletion work. A ten-minute quiet period avoids
immediate deletion after an ambiguous network write; keys are never reused.
Abandoned receiving leases require acquiring the same attempt advisory lock.
The worker visits bounded batches, leases cleanup records across replicas,
retries outages with backoff, and releases charge only after successful deletion
and an authenticated absence check. Trash retains charge. Purge transfers asset
charges to deletion work in its database transaction. Quota locking and cleanup
accounting remain the existing per-owner implementation.

Temporary files close/delete on completed requests; the worker also visits a
bounded set of files older than one hour to remove crash leftovers. Configure a
dedicated quarantine directory; it must never be under the frontend document
root or share an unrelated application's temporary files.
The API image creates this directory with app ownership and 0700 permissions,
which Docker copies into a fresh quarantine volume. Use the rebuilt API image
with the new overrides; an older image does not initialize that directory.
Quarantine and generated storage credential files are excluded from image builds.

## Configuration

`Library:Storage` options use the existing .NET configuration mechanism:

| Option | Default |
| --- | --- |
| `Enabled` | false |
| `Endpoint` | `http://seaweedfs:8333` |
| `Bucket` | `wukna-library` |
| `Region` | `us-east-1` |
| `AccessKey`, `SecretKey` | Required when enabled; never frontend configuration |
| `QuarantineDirectory` | `App_Data/library-quarantine` |
| `ClamHost`, `ClamPort` | `clamd`, 3310 |
| `ClamTimeoutSeconds` | 60 |
| `TransferTimeoutSeconds` | 180 |
| `ObjectTimeoutSeconds` | 30 |
| `MaxConcurrentTransfers` | 2 |
| `WorkerEnabled` | true |

Every account is capped at 1,000,000,000 bytes (decimal 1 GB), replacing the
earlier 5 GB proposal. Smaller configured limits remain valid; larger configured
limits are rejected. Effective usage also caps legacy database grants before
migration. `20261011172023_LimitLibraryAccountsToOneGigabyte` lowers existing
larger entitlements and changes the SQL default. It preserves files, reservations
and pending deletion charge. Accounts already over the ceiling can read, organize
and delete files; new capacity cannot be reserved or published until usage fits.
An untouched upload whose reservation no longer fits fails without scanning or
writing. Completed upload acknowledgments remain replayable. The migration's
rollback restores the old default only; it cannot reconstruct earlier grants.
Checkout and paid grants remain disabled.
Upload progress is indeterminate with real checking/transferring/
confirmation stages; it does not manufacture a percentage. Retrying an ambiguous
failure reuses its operation ID. A new operation starts only after a confirmed
terminal session; cancelling the current file also requests server cancellation.

## Compose setup

The opt-in dev/production overrides reuse `compose.library.services.yaml`.

### Host-run development API

For an existing `dotnet watch` API and local PostgreSQL, use the standalone
`compose.library.host.yaml` instead of moving the application into Docker.
It reuses the same pinned storage/scanner services, persists files and scanner
signatures in Docker volumes, and publishes only `127.0.0.1:18333` (private S3)
and `127.0.0.1:13311` (scanner). SeaweedFS has an additional bridge network
because Docker does not publish ports from an internal-only network. The
production overrides retain their private networks with no published ports.
The host setup also waits for the volume server to register with the master
before declaring storage healthy, covering the brief registration delay on restart.

```bash
ops/create-library-storage-config /absolute/private/library-storage
docker compose --project-name wukna-library-local \
  --env-file /absolute/private/library-storage/storage.env \
  -f compose.library.host.yaml up -d --wait --wait-timeout 300
docker compose --project-name wukna-library-local \
  --env-file /absolute/private/library-storage/storage.env \
  -f compose.library.host.yaml exec -T seaweedfs weed shell <<'EOF'
s3.bucket.create -name wukna-library
EOF
ops/configure-local-library-storage /absolute/private/library-storage
```

Generate credentials and create the bucket on first setup only. The configuration
helper merges the Library settings into the existing project's .NET user secrets
through stdin, preserving authentication/database settings and keeping credentials
out of command arguments and output. It creates a private quarantine directory
alongside the generated configuration and restricts the secret file to mode 0600.
Restart the Development API (Ctrl+R in `dotnet watch`) after configuration. Check
the existing database's Library migrations before use; this setup neither resets
the database nor applies migrations automatically.

Subsequent starts use the same Compose command and private environment file.
The containers restart automatically after Docker restarts. Stop them with
`docker compose ... stop`; do not use `down --volumes` on storage you want to
keep. Container volumes are persistent storage, not backups; the backup and
recovery guidance below also applies to local data you want to retain.

### Containerized development and production

SeaweedFS 4.48 is pinned by digest. One `weed server -filer -s3` process provides
the master, volume, filer and S3 gateway, without unnecessary distributed nodes
or bundled administrative/Iceberg services. Its persistent `/data` volume holds
volume files, master state and the explicitly configured LevelDB2 filer store.
This single-node arrangement has no high availability.

Both overrides keep SeaweedFS off published host ports and on an internal private
network. ClamAV has a separate egress network for signature updates and exposes
no host port. Application credentials permit Read/Write only within
`wukna-library`; there is no anonymous identity, global Admin or unrelated-bucket
access. Administrators initialize the bucket through local `docker exec`.
The API has no bucket-administration route.

Production Library reuses the `clamd` definition from
`compose.attachments.production.yaml`: the pinned ARM64 image,
`clamav_signatures_prod` volume, and scanner networks remain the same as Chat.
Its API joins `scanner_private` as well as `library_private`, so both features
reach the same scanner. Combine the base, Chat attachment, and Library overrides
when enabling both features. The development scanner defaults remain separate.

Generate configuration outside the repository (the script refuses to overwrite
existing credentials or print their values):

The existing ImageSharp dependency also requires an issued Six Labors license
at build time. Local builds use ignored `sixlabors.lic`, or the complete license
in `SIXLABORS_LICENSE_KEY`. The API Dockerfile requires BuildKit and receives it
only through the temporary `sixlabors_license` secret mount:

```bash
docker build --secret id=sixlabors_license,src=/absolute/private/sixlabors.lic -t wukna-api-local .
```

Development Compose supplies the ignored root file by default; set
`SIXLABORS_LICENSE_FILE` to a different private path when needed. GitHub Actions
reads repository secret `SIXLABORS_LICENSE_KEY` for the backend build and Docker
secret mount. Supply the full issued license, never an extracted field. No
license has been committed, copied into an image or provisioned into GitHub by
this task. Image-only production Compose does not need a runtime license secret.
See [ImageSharp licensing setup](https://docs.sixlabors.com/articles/imagesharp/index.html)
and [Docker build secrets](https://docs.docker.com/build/building/secrets/).

Storage setup:

```bash
ops/create-library-storage-config /absolute/private/library-storage
docker compose --env-file .env.docker \
  --env-file /absolute/private/library-storage/storage.env \
  -f compose.yaml -f compose.library.dev.yaml up -d seaweedfs clamd
docker compose --env-file .env.docker \
  --env-file /absolute/private/library-storage/storage.env \
  -f compose.yaml -f compose.library.dev.yaml exec -T seaweedfs \
  weed shell <<'EOF'
s3.bucket.create -name wukna-library
EOF
```

Apply the already reviewed Library migrations to the selected development
database before starting its API/frontend. Starting the overrides does not run
database migrations. For production, keep generated JSON and `storage.env`
root-owned and 0600 under `/etc/wukna/library-storage`, following the existing
root-owned production environment-file approach. Use `compose.production.yaml`
with `compose.library.production.yaml` and both private environment files only
after explicit deployment approval. Never run `compose config` without `--quiet`
in shared logs because resolved environment values include credentials.

The frontend proxy has a Library-transfer-only 20,000,000-byte limit and 300-second
timeout. Existing Chat/Profile routes retain their smaller proxy ceiling.
Restart policies, health checks and bounded JSON log rotation are included.
SeaweedFS is capped at 2 GiB/2 CPUs and ClamAV at 4 GiB/2 CPUs; provision additional
RAM for API, PostgreSQL and the OS. A configured resource ceiling is not reserved
memory or assurance that a smaller VPS can run the combined stack.

## Capacity, backup and recovery

Monitor free disk space/inodes, container health/restarts, clamd signature age,
cleanup backlog/oldest due record, reservation age and API 503 rates. Reserve disk
headroom for quarantine, SeaweedFS append-only data, indexes, PostgreSQL WAL and
temporary maintenance/restore space; user quotas are not the entire host capacity.
SeaweedFS logical deletion releases Library charge after confirmed absence, but
physical disk space can require SeaweedFS volume compaction. Schedule reviewed
maintenance and inspect capacity before running vacuum; do not delete live volume
or filer files manually.

A single node and a local Docker volume are not backups. Use encrypted, off-host,
versioned backups with a retention policy and periodic isolated restore drills.
A consistent cold-backup procedure is:

1. Stop writes by stopping the API; allow its bounded in-flight transfers to end.
2. Stop SeaweedFS cleanly before copying its full `/data` volume. A live recursive
   file copy of LevelDB/volume files is not a consistent backup.
3. Back up the matching PostgreSQL database (including Identity and all Library
   metadata, reservations and work), Data Protection keys, and root-owned private
   storage configuration separately. Keep secrets encrypted with limited access.
4. Upload encrypted copies to separate off-host storage, verify hashes and record
   the matching database/object backup set and exact image digest.
5. Restore the set into an isolated stack with the pinned image, verify S3 private
   access, owned content hashes and quota/work state, then resume cleanup before
   accepting writes. Never release charge simply because a restored object is
   initially unavailable while the store starts.

An S3 export of only active originals misses filer/master metadata, derivatives,
Trash and cleanup liabilities. If using logical exports instead of full cold
volume backups, design and verify a complete export/restore manifest first.
On storage/scanner outage, keep the API's truthful errors and retry paths; restore
service before reconciling charge. Rotate credentials by generating a new private
configuration, coordinating the SeaweedFS/API restart and revoking the old key;
never remove authentication to bypass an outage.

## Verification status and remaining work

The host-run development setup was configured and verified on October 12, 2026.
SeaweedFS and ClamAV run under the `wukna-library-local` Compose project with
private credentials and persistent volumes; the Development API reports storage
available. Real desktop/mobile browser checks passed code and picture uploads,
scanned picture thumbnails, escaped code previews, byte-exact downloads, reload
and storage-restart persistence, anonymous/cross-owner denial, and rejection of
the harmless EICAR antivirus test signature. The focused storage suite passed
24 tests with its separate disposable real-storage opt-in skipped. Normal
background cleanup released all test storage, and four temporary test accounts
were removed. Local evidence is in ignored `artifacts/library-local-storage/`.
This local setup does not configure a production deployment or off-host backups.

The default test suite uses controlled storage/scanner fixtures with real
PostgreSQL to exercise publication, ownership, checksum/content rejection,
cancellation, leases, failures and cleanup. The opt-in real test requires a
disposable SeaweedFS container named `wukna-library-phase5-seaweed`, ClamAV on
localhost:13311, and a private environment file containing generated
`LIBRARY_S3_ACCESS_KEY`, `LIBRARY_S3_SECRET_KEY`, and
`LIBRARY_TEST_ENDPOINT=http://127.0.0.1:18333`. It creates files, restarts that
test container, scans the harmless EICAR test signature, and purges its own files.
It must never target production. Run it with:

```bash
WUKNA_LIBRARY_STORAGE_TEST_ENV=/absolute/private/test-storage.env \
dotnet test --project tests/Wukna.IntegrationTests/Wukna.IntegrationTests.csproj \
  --configuration Release --no-build --filter-class 'Wukna.IntegrationTests.LibraryStorageTests'
```

Phase 5 verification completed with:

- Final Release build: zero warnings/errors; `dotnet publish` also passed.
- Final focused storage suite: 23 passed, zero failures/skips, including real
  SeaweedFS restart persistence, private S3 access, clean ClamAV scanning, EICAR
  rejection and confirmed deletion. PostgreSQL-backed controlled fixtures cover
  malformed PDF/OOXML/images/UTF-8, interrupted/ambiguous writes, conservative
  quota charge, cancellation, replay, corruption and cleanup leases.
- Broader backend run before the final PDF cross-reference/derivative scan-limit
  refinements: 383 passed, two opt-in tests skipped (385 total). The final storage
  run verifies those refinements. A repeat full run was interrupted by SIGTERM
  after 177 successes without a test failure; it is not counted as a completed run.
- Chat's explicit real ClamAV test also passed separately, including infection
  rejection and recovery after a socket outage, validating the shared scan client.
- Frontend typecheck, all 306 tests and production build passed. Existing SignalR
  annotation warnings remain in the frontend build.
- A real authenticated Opera/Playwright flow passed on desktop and mobile:
  code/picture uploads, escaped source, native private Blob preview, byte-exact
  downloads, reload persistence, cross-owner denial, real infection rejection,
  navigation/storage, Trash/restore/purge and eventual zero cleanup charge.
  Five screenshots were visually inspected. Successful evidence is retained in
  ignored `artifacts/library-storage-phase5/`; no credential files are included.
- EF reports no pending model changes; development and production overrides
  validate using `compose config --quiet`; Nginx syntax passes in the repository's
  unprivileged Nginx image. Production was not started or migrated.
- The clean multi-stage image build stalled during dependency restore and was
  stopped. Runtime-stage verification uses the successful host Release publish;
  that image built successfully and its non-root app user (UID 1654) could write
  and remove a file in a fresh app-owned 0700 quarantine volume. This does not
  establish a successful clean multi-stage build.
- Disposable browser/API/frontend processes and storage/scanner/database
  containers were stopped after verification. Verification logs and successful
  screenshots are retained. No production configuration or data was used.

The Phase 5 results above are historical. Phases 6–7 add the disabled provider
boundary and account ceiling and remove Library samples, placeholder media and
mock preview UI. See [final acceptance](PERSONAL_LIBRARY_ACCEPTANCE.md) for the
latest complete backend run, real browser verification and clean image build.
An isolated backup restore drill has not been performed; the recovery procedure
above is an operational plan, not evidence of a completed restore.

References: [SeaweedFS S3 API](https://github.com/seaweedfs/seaweedfs/wiki/Amazon-S3-API),
[official single-node guidance](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini),
[ASP.NET uploads](https://learn.microsoft.com/en-us/aspnet/core/mvc/models/file-uploads?view=aspnetcore-10.0),
[OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
and [AWS SDK for .NET](https://docs.aws.amazon.com/sdk-for-net/v4/developer-guide/welcome.html).

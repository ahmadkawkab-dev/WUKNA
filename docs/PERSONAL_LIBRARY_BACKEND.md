# Personal Library backend

Foundation checkpoint B1: October 11, 2026. This implements the approved Phase 2 schema and
contracts under `Features/Library`, using Wukna's existing EF Core context,
Identity users, PostgreSQL naming, and assembly-scanned configuration.

Current checkpoint: phases 6–7, with private SeaweedFS storage, authenticated
frontend, a 1 GB account ceiling and disabled subscriptions. See
[PERSONAL_LIBRARY_ACCEPTANCE.md](PERSONAL_LIBRARY_ACCEPTANCE.md) for final checks
and [PERSONAL_LIBRARY_STORAGE.md](PERSONAL_LIBRARY_STORAGE.md) for the
upload, scanning, download, cleanup, deployment and recovery contracts. Storage
requires explicit configuration; checkout remains disabled. Library sample data,
mock adapters, sample media and development preview routes have been removed.
Verification uses disposable PostgreSQL, SeaweedFS and ClamAV instances. No
production deployment or database migration has been performed. The historical
checkpoint sections below record what was available at each earlier phase.

## Scope and product rules

The audited current Library has Pictures, Documents, Videos, folders,
collections, favorites, search, Trash, and storage management. Code files are
Documents with a read-only viewer. There is no separate snippet entity, editor,
destination, quota, or creation API. Video binaries are outside scope; video
records are YouTube, Vimeo, or external HTTPS bookmarks.

Current folder controls create, open, and delete empty folders. Folder rename,
reparenting, recursive deletion, item duplication, public sharing, board
attachments, and chat sharing are absent from the current product contract.
Collections are mixed-media membership lists; deleting one leaves its items.
The current authenticated frontend is documented in
[PERSONAL_LIBRARY_FRONTEND.md](PERSONAL_LIBRARY_FRONTEND.md).

## Persistence

| Table | Responsibility | Important integrity rules |
| --- | --- | --- |
| `library_items` | Common owner, category, name, description, notes, tags, folder, favorite, timestamps and Trash state | Owner required; owned folder in same category; bounded metadata; assets prevent implicit item deletion |
| `library_folders` | Owner/category hierarchy | Owned parent; case-insensitive trimmed sibling uniqueness including roots; derived depth 0–32; hierarchy immutable |
| `library_assets` | Original and thumbnail keys, verified type/checksum/bytes, processing and scan state | One asset per owned picture/document; private generated-key shape; nonnegative physical-byte accounting; available requires verified, clean-scanned metadata |
| `library_documents` | PDF, code, text or unavailable preview metadata | Owned document item and asset required; code/text cache UTF-8 and at most 256,000 bytes; code language allowlist |
| `library_videos` | Provider, normalized URL/identifier and optional metadata | Owned video item; canonical YouTube/Vimeo identifiers or external HTTPS reference |
| `library_collections` | Owner, name, description, timestamps | Personal ownership; bounded metadata |
| `library_collection_items` | Membership and added timestamp | Unique collection/item pair; both resources owned by the same user; cascade only memberships |
| `storage_entitlements` | Owner quota and source | One row per owner; positive quota; decimal 5,000,000,000-byte free default |
| `storage_reservations` | Upload identity, requested file metadata, byte budget, state, leases, result and tombstone | Per-owner client-upload uniqueness; owned folder/result/asset links; coherent states and leases; completion requires an available asset |
| `library_blob_work` | Durable per-object scan/delete work and cleanup charge | Generated private key; unique purpose/key; coherent lease; no cascading owner/item/asset relationship |

Composite foreign keys include `user_id` and, for category-specific links,
`category`. They reject cross-account and cross-category relationships even
when the application passes the wrong ID. They do **not** authorize reads:
every future handler must independently apply JWT-derived ownership predicates,
including related IDs, batches, downloads, and thumbnails. The application must
never serialize entities directly.

Library items, folders and entitlements restrict account deletion so object keys
cannot disappear through an account cascade. Asset deletion must be explicit
before permanent item deletion. Documents and video metadata follow their item;
documents also follow their asset. Folder deletion is blocked by children,
items including Trash, and upload sessions still targeting that folder.
Terminal upload sessions must clear their destination.

Trash preserves originals, derivatives, folders and collection membership.
Future collection counts/list queries must join only active owned items.
Permanent purge must atomically detach completed-session result links, set their
`result_purged_at` tombstone, transfer object charges to durable deletion work,
and remove asset/item metadata. Retry identity remains after the result is gone.
Cleanup work intentionally survives metadata/account removal; a scan worker must
recheck that the owned asset is live before publishing anything.

### Hierarchy and completion triggers

`wukna_library_folder_hierarchy` requires an existing owned/category-matching
parent, locks it for key share, and assigns depth. Updates cannot change identity,
owner, category, parent or depth. This prevents cycles, including multi-row
inserts, without a recursive trigger or speculative folder-move algorithm.
Supporting future folder moves would require a reviewed migration and command.

`wukna_library_upload_completion` is a deferred constraint trigger. It checks the
transaction's final reservation row and rejects a completed result unless its
owned asset is available. The reservation and asset can therefore be finalized
in either statement order in one transaction. Purge can replace the result link
with its tombstone in the same transaction. This trigger guards metadata
finalization; it cannot prove object existence, inspect bytes, run malware scans,
or enforce the correctness of a future worker's storage calls.

### Query indexes

Active item indexes cover owner/category/date/ID, owner/date/ID recents,
owner/updated/ID, owner/name/ID and owner/favorite/date/ID. Trash has its own
owner/deleted/ID index. Owned foreign-key indexes support folder and membership
joins. Asset owner/size/ID supports usage reconciliation and largest files.
Folder sibling uniqueness uses PostgreSQL `NULLS NOT DISTINCT` so root folders
receive the same duplicate-name protection as nested folders.

Video lookup uses owner plus a computed `md5(url)` to bound index width for long
URLs. A future deduplication query must also compare the exact canonical URL and
join an active owned item. The hash is not a security mechanism or uniqueness
guarantee. Active duplicate-video prevention belongs in the owner-locked command,
including restore, because Trash permits creating a new active bookmark.

Reservation expiry and durable-work due-time indexes support bounded recovery
queries. No trigram/full-text extension was added speculatively; Phase 3 should
start with bounded owner-scoped literal search and measure before adding one.
Sorts need deterministic ID tie-breakers and protected owner/filter-bound cursors.

## Wire contracts

`LibraryContracts.cs` provides lightweight summaries, category-specific details,
bounded page envelopes, folders, collections, memberships, storage totals,
upload sessions and capabilities. String category/processing/preview/provider
values will be mapped explicitly by future handlers, matching the TypeScript
discriminants rather than exposing database enum integers. Polymorphic detail
serialization preserves derived fields without adding a `$type` discriminator.

Summaries omit original content and code source. Document details may contain
bounded code `source` or plain `text` only when the asset is available. No DTO
contains ownership IDs, credentials, private keys, leases or internal work state.
Future content and thumbnail references must point to authenticated application
access, with account-scoped Blob fetching/revocation in the HTTP adapter.

Write contracts reject unmapped properties. PATCH fields distinguish omitted,
explicit `null`, `false`, empty arrays, and empty strings. Omitted values preserve
stored data. Nullable fields can be cleared; explicit null for required fields
must fail validation. Owner, category, storage keys and processing state cannot
be changed through the item update contract. Request binding alone does not
validate names, byte limits, URL policy, ownership or state transitions; those
checks remain required in Phase 3 handlers.

Two transfer refinements require coordinated frontend changes in Phase 4:

- Verified asset content type and checksum are nullable while processing. The
  current mock's always-available asset type must reflect that state.
- An upload session can return a processing item after bytes are received. Queue
  completion and download availability must wait for clean verification; receiving
  bytes is not equivalent to availability.

`LibraryErrors.cs` defines stable machine codes for not-found, invalid requests,
folder conflicts, Trash conflicts, upload identity/expiry, unsupported type,
size/quota exhaustion, storage/processing availability and rate limits. No HTTP
status mapping existed in B1; Phase 3 mappings are listed below. Foreign resource IDs must return the same
not-found behavior as nonexistent IDs.

## Upload and accounting contract for later implementation

These are design obligations enabled by the schema, **not working upload or
quota services in B1**.

| Reservation state | Meaning and retained accounting |
| --- | --- |
| Reserved | Validated request and capacity budget; no completed item; budget at least declared original size |
| Receiving | Active writer with attempt/token/expiry lease; budget retained while bytes may still be written |
| Processing | Owned asset/result exists; actual physical bytes move to the asset charge; residual budget can remain for bounded derivatives/copies |
| Complete | Available owned asset; zero reservation budget; completion timestamp; result or permanent-purge tombstone |
| Failed / Cancelled / Expired | No result, completion timestamp, destination or writer lease; any residual charge remains until cleanup is accounted for |

`cancellation_requested_at` is an abort request, separate from a terminal
cancellation. An active writer must acknowledge or lose its fenced lease before
budget release. Expiry alone never proves that object bytes are gone.
`request_fingerprint` binds a client upload ID to its immutable request; a retry
with a different fingerprint must conflict. Declared MIME/checksum are untrusted
claims, distinct from verified asset type/checksum. Server time-sensitive logic
must use the existing `TimeProvider`.

Asset processing states are pending, quarantined, processing, available and
failed. An available asset requires verified positive byte length/type/checksum,
clean scan verdict/time and an available-path original key. Pictures additionally
require positive decoded dimensions and a thumbnail. Infected verdicts require
failed state. Code/text source caches must remain withheld until availability.
These checks make invalid metadata combinations fail, but scanning and actual
type/size validation are storage-phase responsibilities.

Future accounting must use:

```text
used bytes     = SUM(asset.stored_bytes) + SUM(delete_work.charged_bytes)
reserved bytes = SUM(reservation.reserved_bytes), including positive terminal balances
available      = MAX(0, entitlement.quota_bytes - used bytes - reserved bytes)
```

Count originals, thumbnails, quarantine/promoted copies while both exist,
failed assets and Trash. Scan work has zero additional charge. Deletion work
takes over a charge from an asset/reservation in the same database transaction;
it must not double count the same physical bytes. Confirmed object deletion or
confirmed absence permits releasing the corresponding cleanup charge. Never
drop charges merely because an upload expires or the user empties Trash.

All future capacity checks and ledger-changing mutations must acquire the same
per-owner entitlement row lock, recalculate totals inside that short transaction,
and atomically reserve/transfer/release budget. Long streaming/scanning/provider
I/O must run outside the transaction with fenced leases and idempotent work.
Reservations must include bounded derivative/copy headroom before writes. The
schema alone does not enforce a concurrent aggregate quota or physical-charge
transfer; real race/failure tests belong to the API/storage checkpoints.

`LibraryOptions` defines a configurable free quota, 20,000,000-byte maximum file,
256,000-byte preview ceiling and 900-second default reservation. It is not bound
or enabled in B1. Future handlers must apply configured free quota when creating
entitlements; the SQL default is only a safe fallback. Smaller limits are valid;
raising file/preview ceilings requires a reviewed change.

Subscription/manual source enum values reserve future schema vocabulary. No
provider interface implementation, checkout route, webhook, payment operation,
paid quota grant or client-writable entitlement exists. The provider-independent
billing boundary remains separate from Library CRUD/storage and is a later
checkpoint. Upgrade controls must remain disabled.

## Migration and verification

`20261011112213_AddPersonalLibraryFoundation` adds the ten tables, constraints,
indexes, hierarchy trigger and deferred completion trigger. It alters no existing
domain table. Previously applied migrations remain unchanged. Its rollback drops
only this foundation and its functions; rollback loses Library data and is tested
only against disposable databases.

Reproduce the relevant checks without using application database credentials:

```bash
dotnet build tests/Wukna.IntegrationTests/Wukna.IntegrationTests.csproj --configuration Release --no-restore
dotnet test --project tests/Wukna.IntegrationTests/Wukna.IntegrationTests.csproj --configuration Release --no-build --filter-class 'Wukna.IntegrationTests.Library*'
dotnet test --project tests/Wukna.IntegrationTests/Wukna.IntegrationTests.csproj --configuration Release --no-build
dotnet ef migrations has-pending-model-changes --configuration Release --no-build
```

Schema tests cover owner/category isolation, root/nested sibling uniqueness,
bounded hierarchy, folder deletion pins, membership and Trash retention,
explicit purge/cleanup charges, idempotency, processing charge transfer,
completion guards and invalid state/size/source/lease records. Migration tests
seed the preceding schema with profile, Board membership, Chat and Tasks,
upgrade twice, check model drift, roll back only B1, then reapply it. Contract
tests cover PATCH semantics, immutable-field rejection, polymorphic details,
summary privacy and free defaults.

Verification completed for B1:

- Release backend/test-project build: passed, zero warnings/errors.
- Focused Library tests: 58 passed, zero failures/skips.
- Full backend suite: 320 passed, zero failures, one skipped. The existing
  opt-in real-ClamAV test is excluded by the default test selection.
- EF pending-model check: no changes since this migration.
- Frontend type check: passed; frontend tests: 280 passed, zero failures/skips.
- Frontend production build: passed, with the existing SignalR PURE-annotation
  warnings. No frontend source was changed in B1.
- Forward SQL review: ten new tables, no existing domain-table alterations;
  migration rollback/reapply passed against the disposable test fixture.
- `git diff --check`: passed.

At the B1 checkpoint, HTTP authorization, CRUD/search/pagination, aggregate
quota races, real type validation/scanning, private downloads, SeaweedFS
persistence/recovery and frontend refresh synchronization remained pending.
The user subsequently approved Phase 3 API work. The current status follows.

Storage implementation references for that later checkpoint are the official
[SeaweedFS project](https://github.com/seaweedfs/seaweedfs),
[ASP.NET Core upload guidance](https://learn.microsoft.com/en-us/aspnet/core/mvc/models/file-uploads),
and [OWASP upload security guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## Phase 3 — authenticated metadata and session APIs

Implemented under `Features/Library/Queries`, `Commands`, and `Storage`, using
EF directly. Every route requires the existing JWT and an existing Identity
subject. Every resource query checks its owner. Foreign and missing resource IDs
return identical `404 {code: "library_not_found"}` responses, including query
filters, destinations, collection memberships, uploads and content access.
No body can choose an owner or mutate an entitlement.

All routes below are relative to `/api/library`:

| Method and route | Behavior |
| --- | --- |
| `GET /capabilities` | `storageAvailable` follows configured storage enablement; `checkoutEnabled=false` |
| `GET /summary`, `GET /storage` | Active category totals and authoritative storage ledger |
| `GET /items` | Bounded filtered/sorted summary page |
| `GET /items/{id}` | Owned category detail and bounded complete folder breadcrumb; Trash details remain readable |
| `PATCH /items/{id}` | Rename, description, notes, tags, folder and explicit favorite assignment |
| `POST /items/bulk-update` | Same update for 1–100 selected IDs, atomically |
| `POST /items/trash`, `/items/restore`, `/items/purge` | Atomic lifecycle commands; purge requires Trash |
| `GET /folders`, `GET /folders/{id}` | Bounded hierarchy listing or exact owned folder |
| `POST /folders`, `DELETE /folders/{id}` | Create and delete empty folders; no folder move/editor workflow |
| `GET /collections`, `GET /collections/{id}` | Bounded listing or detail with active membership counts |
| `POST /collections`, `PUT /collections/{id}`, `DELETE /collections/{id}` | Collection metadata lifecycle; originals preserved |
| `POST /collections/{id}/items/add`, `/items/remove` | Bounded owned membership command; repeated add/remove is safe |
| `POST /videos` | Validate/normalize and save a video bookmark with best-effort provider metadata |
| `POST /uploads` | Durable idempotent capacity reservation; no item/asset created |
| `GET /uploads/{id}`, `DELETE /uploads/{id}` | Session status and cancellation request |
| `PUT /uploads/{id}/content` | Owned, bounded transfer into quarantine; verify length/checksum/type and clean scans, then store and publish atomically; unavailable if storage is disabled |
| `POST /uploads/{id}/finalize` | Validate operation/checksum and acknowledge the published result; idempotent completion/purge-tombstone replay |
| `GET /items/{id}/content` | Owned clean available file, bounded checksum-verified read and attachment response; video binaries unsupported |
| `GET /items/{id}/thumbnail` | Owned picture derivative from private storage or bounded provider-thumbnail proxy for videos |

Metadata responses use camelCase DTOs. Private routes, including authentication
and limiter failures, send `Cache-Control: no-store` and `X-Content-Type-Options:
nosniff`. Library metadata bodies are bounded to 64 KiB; binary PUT bodies use the
configured file ceiling (20,000,000 bytes by default). Existing Chat/Profile
upload limits are preserved. Malformed JSON or unmapped properties receive the
framework's `400`; expected domain failures use the code envelope below.

### Queries and pagination

Item query fields are `category`, `folderId`, `collectionId`, `favorite`, `trash`,
`documentKind`, `tag`, `search`, `sort`, `cursor`, and `limit`. Folder fields are
`category`, `parentId`, `cursor`, and `limit`; collection pages use `cursor` and
`limit`. Unknown/repeated fields, invalid types and out-of-range values fail with
`library_invalid_query`. Items default to 24 rows; organization pages default to
100; all page sizes are 1–100. Sorts are `created-desc`, `updated-desc`, `name-asc`
and `size-desc`, always with a matching deterministic ID tiebreaker.

Omit a folder/parent field for an unrestricted list; pass `root` for a null
folder/parent; pass an owned UUID for a specific destination. An explicit false
favorite flag means the unrestricted list, matching the current mock contract.
Trash defaults to false. Search is literal, case-insensitive, at most 200
characters, across name, description, tags and **available** document source or
language. Tags are bounded exact case-insensitive filters. No source cache is
loaded into item-list responses. Counts use SQL projections, not one read per
collection.

Cursors use the existing ASP.NET Data Protection key ring with a Library-specific
purpose, version, owner, normalized-filter scope, sort, selected sort value, ID
and one-hour expiry. Changing page size is allowed; changing owner, filters,
resource or sort invalidates the cursor. Tokens are opaque, at most 2,048
characters, and tampering/expiry returns `library_invalid_cursor`. Keyset seeks
use PostgreSQL row comparisons through Npgsql. This follows
[EF's pagination guidance](https://learn.microsoft.com/en-us/ef/core/querying/pagination)
and [Npgsql's row comparison support](https://www.npgsql.org/efcore/mapping/translations.html#row-value-comparisons).
Lists do not promise a snapshot across mutations; clients must restart affected
pages after confirmed writes.

### Atomic writes and deletion

Every Library write locks the existing user's row for key share, safely creates
the free entitlement if needed, then locks that entitlement for update. Related
IDs are revalidated inside the short transaction. All replicas use this lock
order. The owner lock serializes quota checks, folder name races, membership
changes, and active video save/restore duplicates. No provider HTTP call runs
while holding it. The original B1 migration remains unchanged.

Batch payloads require 1–100 input IDs before deduplication. A missing/foreign ID,
invalid destination, or conflicting restore rejects the entire transaction.
Edits and membership additions reject Trash. Trash preserves binary charges and
memberships; restore checks active canonical video duplicates, including within
the batch. Collection deletion cascades only memberships.

Purge clears completed upload result links and records their tombstones, removes
scan work, transfers known object bytes into durable deletion work, then deletes
asset/item metadata in one transaction. Used bytes do not fall until a later
storage worker confirms deletion. An in-flight processing session, unidentified
extra physical copies, or conflicting cleanup ownership returns
`library_processing_unavailable` rather than releasing a charge unsafely. Actual
object deletion is reserved for Phase 5.

### Reservations and recovery

Session creation checks declared filename, extension/MIME allowlists, positive
size, the configured file/text ceiling, checksum shape and owned/category-matched
destination. These are **request metadata checks**, not actual content validation.
Signature/OOXML/UTF-8/image validation and malware scanning remain Phase 5 work.

The reservation budget is twice the declared original size, plus two
1,000,000-byte thumbnail budgets for a picture, covering quarantine/promotion
copies. A later storage implementation must respect these ceilings or reserve
additional capacity before writing. The owner ledger includes all assets,
Trash/failed assets, charged deletion work and positive reservation balances in
every state. Capacity checks and inserts share the owner lock; concurrent API
instances cannot admit reservations beyond available quota. At most 32 pending
sessions per owner are admitted.

`clientUploadId` plus an immutable normalized request fingerprint provides
idempotency: first creation returns 201, an identical retry returns 200 with the
same session, and a changed request returns 409. A cancelled/expired operation ID
retains its session; a new attempt needs a new operation ID. Finalize checks both
the path session's stored client ID and declared checksum. Existing completed
sessions can replay their stored result/tombstone, but Phase 3 cannot create one.

Untouched reserved sessions have no attempt, lease or result and can safely
become expired/cancelled with zero reservation and no folder pin. Receiving,
processing or attempted sessions retain their lease and capacity while marking
a cancellation request. Expiry never proves that bytes are absent. A bounded
30-second worker visits up to 50 due rows' owners per iteration, with the same
database lock order; storage/summary/session reads also reconcile safe expiry.
The worker survives restarts and duplicate polling. Storage-dependent attempted
session cleanup remains deferred and charged.

### Provider metadata and thumbnails

YouTube watch/short/embed/youtu.be URLs normalize to a specific 11-character ID;
Vimeo links normalize to a numeric ID of at most 20 digits. HTTPS, no credentials,
and default ports are required. Other HTTPS bookmarks are stored as references
and **never fetched** by the backend.

Known provider saves query fixed HTTPS oEmbed endpoints, outside transactions,
with redirects/cookies/request logging disabled, a five-second deadline,
32 KiB maximum JSON, depth limit, and four concurrent provider calls per process.
Only bounded plain title/creator and a provider-specific trusted thumbnail URL
are kept. Provider HTML is ignored. Failure records
`library_video_metadata_unavailable` and preserves the valid bookmark. The new
`20261011134920_AddLibraryVideoMetadata` migration adds two nullable cache columns
and a trusted-provider thumbnail shape check to `library_videos`.

Thumbnail references point to Wukna's authenticated route. Only `i.ytimg.com/vi/`
and `i.vimeocdn.com/video/` HTTPS/default-port URLs are fetched. Responses are
bounded to 1 MB and four million decoded pixels, restricted to JPEG/PNG/WebP,
fully decoded, limited to one frame, resized within 640×360, and re-encoded as
PNG with metadata profiles removed. Output is capped at 1 MB; ownership is
checked again after provider I/O. Redirect, malformed, oversized, unsupported
or unavailable responses fail closed. This is an ephemeral public-provider
thumbnail proxy, not uploaded-file storage or video downloading.

### Errors and configuration

| HTTP status | Expected codes |
| --- | --- |
| 400 | Invalid query/cursor/item/folder or invalid upload identity/checksum metadata |
| 404 | `library_not_found` for missing/foreign resources |
| 409 | Folder name/nonempty conflicts, trashed edits/purge preconditions, active video duplicates, changed/expired upload identity, quota exhaustion, pending processing conflicts |
| 413 | `library_file_too_large` for declared file/text or request-body ceiling |
| 415 | `library_file_type` for unsupported extension/MIME or video binary access |
| 429 | `library_rate_limited`, with Retry-After |
| 503 | `library_storage_unavailable` for file transfer; `library_processing_unavailable` for failed provider thumbnail access |

Bind `Library` options through the existing configuration mechanism. Defaults:
free quota 5,000,000,000 bytes, file 20,000,000 bytes, source 256,000 bytes,
reservation 900 seconds, cleanup enabled, read/write/provider requests per minute
240/120/30. Limits validate on startup. Rate limits are per owner and preserve
existing Chat/Board rejection behavior. Tests disable scheduled cleanup and drive
the recovery method deterministically. No frontend environment settings,
production secrets, Docker, proxy or release workflow were changed.

### Phase 3 verification

- Release backend build: passed with zero warnings and errors.
- Focused Library suite: 100 passed, zero failures or skips.
- Full backend suite, including the final thumbnail decoder changes: 362 passed,
  zero failures, one existing opt-in real ClamAV test skipped (363 total).
- Frontend typecheck, all 280 tests, and production build: passed. The build
  retains the existing SignalR annotation warnings; Phase 3 changes no frontend
  source.
- The integration suite uses disposable PostgreSQL databases and covers owner
  isolation, atomic batch failures, cursor validation and all four sort orders,
  two-instance quota/idempotency races, conservative cancellation/expiry, purge
  charge retention, provider failures, bounded authenticated thumbnails and rate
  limiting. Provider responses in these tests are controlled fixtures.
- EF reports no model changes since the last migration. Reviewed forward SQL
  adds only the two video cache columns and their thumbnail constraint. The
  approved B1 migration remains unchanged; no production database was migrated.
- Separate read-only provider checks returned valid YouTube oEmbed JSON (200)
  and an unavailable Vimeo sample (404). These checks establish no guarantee of
  provider availability; saves handle either outcome without losing a bookmark.
- `git diff --check`: passed.

Phase 4 supplied the authenticated HTTP adapter and private frontend state;
Phase 5 now supplies real transfers, validation/scanning, authorized content and
deletion/recovery. See `PERSONAL_LIBRARY_FRONTEND.md` and
`PERSONAL_LIBRARY_STORAGE.md` for current behavior and verification. Payments
remain disabled. The subscription-boundary review and final acceptance/preview
cleanup remain next checkpoints; the brief requires approval between phases.

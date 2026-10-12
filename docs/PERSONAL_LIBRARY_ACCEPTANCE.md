# Personal Library final acceptance

Implementation date: October 11, 2026. The user's final instruction sets the
account limit to **1 GB = 1,000,000,000 bytes**, superseding the initial 5 GB
proposal. This is local implementation and acceptance work; production has not
been deployed or migrated.

## Implemented contracts

| User action | Persisted backend behavior | Verification |
| --- | --- | --- |
| Browse, filter, sort, search and paginate | Owned metadata reads, bounded cursors, category/tag/code search and counts | PostgreSQL integration, HTTP/DOM and real browser flows |
| Create/open/delete folders | Owned hierarchy and breadcrumbs; only empty folders can be deleted, including Trash and upload references | PostgreSQL integration and real nested-folder browser flow |
| Create/edit/delete collections; add/remove members | Owned mixed-media membership; deleting a collection preserves originals | PostgreSQL integration and real browser flow |
| Rename, tags, notes, favorites, move and bulk actions | Authenticated mutations with independently validated item/folder/collection ownership | PostgreSQL integration, HTTP/DOM and real browser flow |
| Save/edit/delete videos | Canonical YouTube/Vimeo/external HTTPS bookmarks; duplicate checks and bounded provider metadata fetching | Provider security/endpoint tests and real persisted external-link browser flow |
| Upload pictures, PDF, DOCX, XLSX, UTF-8 text and code | Idempotent reservation; bounded quarantine, content validation, clean scanner verdict and atomic publication into private SeaweedFS | Storage integration and real storage browser flow |
| View/download private originals | Owned bounded backend reads, original SHA-256 verification, authenticated account-scoped Blobs; escaped read-only code/text | Backend authorization, Blob lifecycle tests and byte-exact real browser downloads |
| Trash/restore/permanent deletion | Trash retains quota; purge creates durable deletion work and releases charge only after confirmed private object absence | Fault/recovery integration and real browser cleanup |
| Storage management | Authoritative originals/derivatives/reservations/Trash/deletion ledger, with a 1 GB ceiling for every account | Concurrent quota, migration and lowered-reservation tests; real desktop/mobile usage |
| View storage plans | Authenticated provider-independent catalog; Free 1 GB, Plus 100 GB and Pro 1 TB; checkout disabled | Subscription boundary integration, HTTP/DOM and browser assertions |
| Reload/change account | Existing JWT/refresh-cookie session; cache disposal and expected-account guards; persisted metadata and object bytes | Authentication/DOM integration, browser API restart and SeaweedFS restart tests |

Code belongs to Documents and has no editor, executable preview, separate
destination or quota. Videos are bookmarks; uploaded or downloaded video binaries
are outside the product contract. Office files offer original download and an
explicit unavailable-preview state. PDFs use the browser's native viewer, whose
rendering support varies. Provider players require an explicit user action.

Library follows Boards. Notifications is last among primary destinations.
Storage is a separate utility directly below Notifications in expanded,
collapsed and mobile navigation, including workspace pages outside Library.

## Latest layout refinement

The dashboard now has one capture action area and one initial empty state;
populated Favorites and Collections remain available. All Library pages use
shared heading/description spacing and native semantic surfaces. Library sections
remain open across workspace routes until the Library toggle closes them, with
fluid height/opacity motion and reduced-motion support. Mobile sections persist
between Library destinations and support Escape/focus restoration. Collection
selection is retained in the URL for reload and history navigation.

The latest frontend suite passes **300 tests**, and production build/typechecking
pass. Opera passed **58 layout/navigation/motion checks**: all nine Library views
at 390/768/1440 widths in light/dark themes, plus phone/desktop disclosure opening
and closing under normal/reduced motion, route persistence, and collection
reload/back/forward selection. Twenty screenshots were captured and representative
desktop/mobile pages visually inspected. These presentation checks use test-only
HTTP interception; they do not replace the real persisted backend/storage
acceptance below. Logs and screenshots are in `artifacts/library-layout/`.

## Final cleanup

Both development and production use the authenticated HTTP adapter. Removed:

- The Library preview session/flag, mock adapter, runtime sample fixtures,
  sample selectors and mock upload/download success paths.
- The old Library/Pictures demo pages, `/dev/library` and `/dev/pictures` routes,
  six local preview SVGs and the obsolete mock-only browser/adapter tests.
- Sample disclosure/settings UI and generic card copy that claimed a document
  preview for video links. Missing thumbnails use ordinary file/media icons.

New accounts start empty. Backend failures show errors/retry and cannot seed or
fall back to samples. Test fixtures live inside tests; the unrelated Journal
development preview remains outside Library's scope. Real private thumbnails,
native empty states and input hints remain functional UI.

## Account and subscription boundary

The latest forward migration lowers larger existing entitlements to 1 GB and
changes the database default. Smaller grants are preserved. Files, active
reservations and deletion liabilities are retained. Existing over-limit accounts
can read/organize/delete; new capacity and publication are blocked until usage
fits. The API caps legacy entitlements even before the migration. Untouched old
reservations that no longer fit fail before scanning/writing. Completed sessions
retain their replay/tombstone behavior. Rollback restores only the former SQL
default; it does not reconstruct historical per-account grants.

`Features/Subscriptions` owns the provider interface and disabled implementation.
It cannot grant Library entitlements. Every checkout attempt returns
`subscription_checkout_unavailable` without a URL, and no checkout HTTP route,
payment provider, webhook or paid-grant flow is enabled. Informational Plus/Pro
plan labels do not increase the current 1 GB account ceiling.

## Executed acceptance checks

- Release backend/integration build passed with zero warnings/errors.
- The complete backend suite passed **391 tests**, zero failures/errors/skips,
  in 766.526 seconds. Both opt-ins were enabled: real SeaweedFS restart/private
  object persistence and real ClamAV/EICAR/socket-outage recovery. Auth, Boards,
  Chat, Profile, Tasks, Calendar and Notifications are included in this suite.
- Frontend typecheck, **298 tests** (zero failures/skips) and production build
  passed after the final card-copy cleanup. Only existing SignalR annotation
  warnings remain in the frontend build.
- Both real API browser flows passed on desktop and mobile using disposable
  PostgreSQL, SeaweedFS, ClamAV and accounts. The metadata flow covers nested
  folders, videos, notes, favorites, collections, search, duplicate conflict,
  Trash/restore/purge, persistence and ownership. The storage flow covers scanned
  code, PNG, PDF, DOCX, XLSX and UTF-8 Markdown; byte-exact downloads for every
  original; anonymous/other-owner denial; escaped code; native private Blob
  previews/fallbacks; actual EICAR rejection; 1 GB usage; API-restart persistence;
  Trash/restore/purge and eventual zero used/reserved charge.
- Fourteen successful browser captures were visually inspected. New accounts
  contain no seeded items or sample disclosure. Production JavaScript contains
  none of the retired Library flags/adapters/media routes.
- EF reports no pending model changes. The reviewed quota SQL preserves assets
  and changes only larger entitlements/the default. Migration and replay/rollback
  behavior passed against disposable databases, including legacy over-limit data.
- Both clean Docker image builds passed locally (Linux amd64). The API build
  uses the private license secret mount; a separate nonincremental backend build
  also passed using the CI license environment variable and no valid file path.
  The frontend image's Nginx syntax check passed. Development and production
  Library Compose configurations validate with `config --quiet`; production
  validation used dummy configuration only. Linux arm64 publication was not run.
- The final API image's non-root app user (UID 1654) wrote/removed a test file in
  a fresh app-owned 0700 quarantine volume. The image contains no issued license
  file, build-secret mount or test-artifact directory; the issued license value
  is absent from both image histories.

Evidence is retained in ignored `artifacts/library-final/`: backend result XML,
build/test logs, migration SQL, browser reports and successful screenshots.
Credential files, API credential configuration and browser profiles are excluded.
Disposable API/frontend/browser processes, storage/scanner/database containers,
test volumes and generated private configuration were removed after verification.
The earlier Phase 4/5 verification sections are historical; these checks describe
the final implementation.

## Operational prerequisites

Deploying the feature remains a separate operation. Apply reviewed migrations
to the intended database and enable the private SeaweedFS/ClamAV override with
restricted credentials and its persistent volumes. Disabled storage is an
explicit unavailable state, never a successful upload. The API fails closed on
scanner outages. Reserve adequate host disk/RAM and keep monitoring signatures,
disk headroom, cleanup backlog and storage/scanner health.

The existing ImageSharp dependency requires a privately supplied, issued license.
Docker builds use the `sixlabors_license` BuildKit secret; local Compose can use
ignored `sixlabors.lic` or `SIXLABORS_LICENSE_FILE`. CI expects repository secret
`SIXLABORS_LICENSE_KEY`. No GitHub secret was provisioned by this task. The file
is excluded from build context, and the secret is mounted only during publish.

Single-node SeaweedFS provides no high availability or backup by itself. The
documented cold backup/recovery procedure requires matching PostgreSQL, all
SeaweedFS data, Data Protection keys and private configuration in an encrypted
off-host backup. An isolated restore drill remains unperformed. Native PDF
rendering, live third-party provider availability and VPS capacity must be
assessed in their operational environment.

See [frontend contracts](PERSONAL_LIBRARY_FRONTEND.md),
[backend contracts](PERSONAL_LIBRARY_BACKEND.md) and
[storage setup/recovery](PERSONAL_LIBRARY_STORAGE.md).

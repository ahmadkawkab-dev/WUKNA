# Personal Library frontend

Frontend implemented October 10, 2026; authenticated API integration completed
in Phase 4 on October 11. This record supersedes the frontend proposals in
`PERSONAL_LIBRARY_PLAN.md`. See `PERSONAL_LIBRARY_BACKEND.md` for the implemented
API and database contracts. Phase 5 now connects real private file storage; see
[PERSONAL_LIBRARY_STORAGE.md](PERSONAL_LIBRARY_STORAGE.md). Phases 6–7 set the
account ceiling to 1 GB, add a disabled subscription boundary and remove Library
sample data, media, mock adapters and development preview routes. See
[final acceptance](PERSONAL_LIBRARY_ACCEPTANCE.md) for current verification.

## Library layout refinement (October 11)

The latest layout request applies the repository's `better-layout_SKILL.md`.
Library navigation now renders inside the account-scoped workspace shell,
instead of a portal owned by the current Library page. Once opened, the section
list remains available when navigating to Home, Boards, or other workspace
pages. Clicking Library again closes it without changing the current page or
file selection. Reopening from another page opens the dashboard. Collapsing the
whole sidebar preserves the section-list state; no second Library rail appears.
Mobile Library sections remain open across Library destinations and close via
their disclosure button or Escape, which restores focus to that button.
Dashboard uses the supplied SVG at `frontend/public/icons/library-dashboard.svg`
as a 16px mask, inheriting the navigation color in both themes and mobile sections.

Disclosure uses intrinsic-height grid animation, opacity, translation, and a
rotating arrow with existing motion/easing tokens. Closed content is immediately
inert and hidden from accessibility APIs; the visual collapse can finish without
leaving hidden links keyboard-focusable. Reduced-motion preferences remove the
transitions. Collection shortcuts use an owned collection selected through the
`collection` query parameter, preserving selection on reload and history travel.

The dashboard has one action area (Upload and Save video link), category counts,
and recent files in update order. Favorites and collections appear when populated;
a new Library shows one empty state. The duplicate Quick Capture panel, repeated
privacy panel, and empty Favorites/Collections panels have been removed. Folder
and collection creation remain available in their respective sections.

Dashboard, browse, collections, search, favorites, Trash, and storage reuse the
same section-heading structure, descriptions, gutters, and content spacing.
Controls wrap below headings before narrowing their text columns. Status messages
use a shared surface and appear only after storage availability is known. Empty
states use the native panel surface and do not repeat the privacy badge already
shown by the page header and storage utility.

Search fields, sort/type selectors, and action buttons share the 36px desktop
control height and 44px touch/narrow-screen target. Dropdown focus uses the shared
inset ring; pointer selections clear the action highlight while preserving DOM
focus, and keyboard navigation restores the visible ring.

Library-wide search uses one field in the header and displays results within Dashboard. The separate Global Search destination and duplicate search form have been removed. Header search and browse filters use the shared clearable input; its × clears immediately and returns input focus. Clearing an active dashboard query restores the overview. Search terms use `/library?search=…` so reload and browser history preserve results; “View all recent” opens `/library?view=all`. Category filters, sorting, file actions, and pagination remain available in dashboard results. Existing `/library/search` links remain an alias for the dashboard's all-recent view.

The opt-in `frontend/tests/browser-library-layout.mjs` checks intercepted HTTP
presentation responses in a disposable Opera profile. It does not seed runtime
Library data or make backend mutations. Evidence lives in
`artifacts/library-layout/`; current results are recorded in final acceptance.

## Design and architecture

The repository is the architectural and design-system source of truth. The
[Canva design](https://www.canva.com/design/DAHXo-ovsfs/_yedxGkruw5XnnmGGEXQ5w/edit)
was successfully inspected through Canva MCP: 20 pages, 1,359 text elements,
357 image fills, and frame geometry. The inspection transaction was cancelled
without design changes. Current dashboard/mobile previews have missing nested
card content; the user confirmed it is absent in the editor. Older page-list
thumbnails are stale. MCP text does not provide typography or semantic tokens.
The user's latest instruction authorizes completing these gaps using Wukna's
patterns. No claim of complete Canva pixel equivalence is made.

Implemented design decisions:

- Reuse the authenticated AppShell, history routing, theme preferences, shared
  Button, IconButton, Field, native Dialog, and LoadingSkeleton. Existing React,
  TypeScript, semantic CSS/Tailwind foundations remain in place; shadcn/ui is not
  installed, so no duplicate UI package was added.
- Keep Wukna's Inter typography, spacing/radius tokens, light/dark colors, and
  existing 768px navigation breakpoint. Expanded desktop Library navigation
  occupies the app sidebar and remains mounted across workspace pages. Collapsed
  navigation can reopen this same menu; mobile uses a Library sections disclosure. Container queries adapt
  content to the available space.
- Use category counts, recent files, populated favorites and collections,
  folder tiles, document list/grid, and media/detail layout. The dashboard has a
  single capture action area and a single initial empty state. Storage is
  a separate workspace utility below Notifications, following the latest user
  instruction, with a full Storage Management view.
  Mobile recent files use compact rows; pictures use two columns. The file list
  omits secondary columns in narrow containers and remains keyboard scrollable.
- Code is a read-only document preview, not a separate navigation destination.
  It supports line numbers, syntax colors, wrapping, and copying the complete
  source. Shiki grammars load only when needed. HTML and Markdown are displayed
  as escaped text; uploaded code is never executed.
- New accounts start empty; development and production use real authenticated
  metadata and originals. PDFs use the browser's native viewer; Office files offer download with
  an explicit preview fallback. No new PDF/editor dependency is required.
- Library follows Boards. Notifications remains the last primary destination
  and the last mobile More primary entry. Storage sits directly below it across
  workspace pages, with an icon action in collapsed navigation. Root AGENTS.md
  preserves these standing rules.

## Available flows

Eight destinations are implemented: Dashboard, Pictures, Documents (including code),
Videos, Collections, Favorites, Trash, and Storage Management. Library-wide search
and all recent items are integrated into Dashboard.

The shared file browser supports nested folders, category/type filters, name/tag/
code search, sorting, grid/list modes, pagination, selection, and bulk organization
and Trash actions. Item menus expose rename, tags/description/personal notes,
favorite, move/add to collection, restore, and confirmed permanent deletion.
Collections support create/edit/delete and adding/removing mixed media; removing
a membership or collection preserves the original. Folder deletion requires an
empty folder, including items in Trash and pending upload sessions. Trash retains
quota; permanent deletion releases file capacity only after confirmed cleanup.

Real file uploads and downloads are visibly unavailable while the server reports
`storageAvailable=false`. There is no local-file success notification or completed
placeholder in the HTTP adapter. With storage enabled, the HTTP adapter reserves
capacity, uploads original bytes, and acknowledges confirmed publication. The
queue reports real checking/transferring/confirmation stages, supports durable
retry and requests server cancellation. Limits are 20 MB per file and 256 KB for
code/text; the server validates actual content and scans originals and picture
derivatives before publication. The account ceiling is 1,000,000,000 bytes.
The former development preview queue has been removed.
The Add files dialog closes immediately after every selected file has been
confirmed saved, including after a successful retry. The Library keeps the
success notice visible. A partial failure or cancellation keeps the dialog open
with its remaining files and retry controls.
Queued and failed files have an accessible × action to remove them from the
queue before uploading or retrying. Queue edits are disabled during an active
batch, and completed files retain their saved status. Removing the last pending
file disables Upload files and returns focus to the file chooser.
Dashboard Upload accepts both supported pictures and documents in one chooser,
including JPG/JPEG and PNG. Each file is validated and saved to the root of
Pictures or Documents according to its format. Category-specific uploads retain
their folder selection and filters. Picture filters include MIME types and both
lowercase and uppercase extensions for native file choosers.
Dashboard category panels and category sections also accept dropped device files
or video links and start the same save flow automatically. Open folders retain
the drop destination. YouTube sharing uses the desktop extension or installed
Android app share target; setup and boundaries are documented in
[Library capture](LIBRARY_CAPTURE.md).

Video links support canonical YouTube/Vimeo URLs and other HTTPS providers.
Only validated YouTube/Vimeo IDs can create an embedded player, and only after
the user chooses to load it. Other providers open the original link. Video
files are not uploaded. Picture previews provide zoom, fit, fullscreen when
available, and keyboard previous/next. Actual local documents/pictures support
download through authenticated Blob requests when storage is enabled. Real file
controls remain disabled while storage is unavailable.

## Authenticated adapter and state

`LibraryApi` is a typed read/write boundary. `createHttpLibraryApi` implements the
approved `/api/library` routes using the existing `apiFetch` client and session
lifecycle. Development and production use this adapter. The former
`VITE_LIBRARY_PREVIEW` flag, sample selectors, mock adapter, `/dev/library` and
`/dev/pictures` routes have been removed. The unrelated Journal preview remains.
API fixtures exist only inside test files and cannot seed the application.

The adapter covers summary/capabilities, paginated item/folder/collection reads,
details, rename/metadata/favorites/bulk updates, lifecycle commands, folder and
collection writes, memberships, video saves, and durable upload-session
create/status/cancel/finalize/content methods. Session methods reflect server
state, cancellation requests, errors and purged-result tombstones. The Phase 5
file-transfer pipeline reuses these operations and retains operation identity
after an ambiguous failure; only a confirmed terminal failure permits a new
attempt. Account changes and aborts cannot retry into another owner's session.
JSON commands preserve omitted values, explicit null and false. Query encoding
uses `root` for a null folder/parent and omits an absent cursor.

`LibraryAppShell` supplies one account-specific adapter and TanStack Query cache
across Library and other workspace pages, including the storage utility. An
account change remounts the provider, cancels reads and mutations, clears cached
private state, and disposes the old adapter. An optional expected-account guard
in the shared session client rejects a different refreshed identity before
retrying a Library request. Tokens stay in memory and out of URLs/browser storage;
refresh cookies remain HttpOnly. Existing callers retain their session behavior.

Writes wait for server confirmation. Successful writes cancel reads, restart
paginated item/folder/collection lists, and invalidate details, summary/storage,
capabilities and original-file Blob queries. Immutable thumbnail queries are reused;
confirmed Trash/purge commands evict that item's disk and memory previews. Failed writes show recoverable errors and preserve
the current display; there are no speculative optimistic changes to roll back.
Retry on a paginated list starts from its first page so expired cursors cannot
trap the UI. Returning focus/visibility refreshes metadata and restarts pages.
StrictMode replay and account changes retain the existing safe provider teardown.
No SignalR protocol or cross-tab broadcast was added for personal Library data.

Errors distinguish expired cursors, unavailable/missing/private resources,
validation, folder name/nonempty conflicts, duplicate videos, quota exhaustion,
upload identity/expiry, unavailable processing/storage and rate limits (including
Retry-After). Unauthorized requests use the existing refresh/login flow. Dialogs
stay open after failures; success notifications follow confirmed writes only.

DTOs include nullable asset content types/checksums, processing states, complete
server folder breadcrumbs, and provider metadata/failure fields. Pending document
source is withheld by the server and displays an unavailable preview. Code stays
inside Documents in the read-only viewer.

## Private previews and storage limitations

Private thumbnails and file content are fetched through fixed item-ID API paths
with authentication, never by inserting an API URL into an image/object/link.
Thumbnail responses must be PNG. Picture thumbnails use an account-bound IndexedDB
cache with a 32 MiB / 128-entry limit, a seven-day expiry, and eviction of the least
recently viewed entries as new previews arrive. Only verified PNG preview responses
up to the server's 1 MB thumbnail budget are stored. Keys include account, item, and
reference. No tokens, cookies, original files, private HTML or API responses enter
the service-worker cache. An authenticated session is checked before and after
every local preview read. Sign-out/session expiry clear disk previews and fence late
writes; activating another account removes previous-account entries.

Pictures renders one page of up to 24 items, including picture folders and picture
search results. Previous/Next uses the server's opaque cursors; later pages are
requested only on Next. Filters/sort start at page one, page changes clear selection,
and the viewer navigates only the visible page. Cold previews load one at a time to
avoid saturating the server transfer gate, with two bounded retries for temporary
503 failures. Each successful cache transaction completes before its Blob reaches
the image. Cached previews bypass thumbnail API requests on later visits/reloads.
Old picture Blob queries leave memory when their last observer unmounts; disk
previews remain reusable until expired, removed or evicted. IndexedDB failures fall
back to authenticated fetches. Metadata/session restoration still require the API;
this is a preview cache rather than a fully offline Library. Original-file downloads
remain authenticated. When an original picture is unavailable, its cached thumbnail
can still appear in the viewer.

`useLibraryBlob` creates component-owned temporary URLs; replacement, account changes,
and unmount revoke them and cancel pending fetches. Video-thumbnail failure falls
back to its icon. Provider players load only on explicit request, and validated
provider IDs determine the iframe URL. Complete folder paths use server
breadcrumbs rather than the first folder page.

Storage usage comes from the server ledger, including Trash, reservations and
pending file deletion. UI explanations do not promise that deleting metadata
immediately frees capacity. The authenticated `/api/subscriptions/storage-plans`
catalog supplies Free (1 GB), Plus (100 GB) and Pro (1 TB) labels. All checkout
controls remain disabled; no checkout route, entitlement grant or payment exists.
Authenticated binary storage is implemented through the opt-in SeaweedFS setup.
Apply the reviewed Library migrations before running the integrated frontend;
API failures show retryable errors and cannot fall back to demo data.

## Final verification

The picture-cache change passed typecheck, all 334 frontend tests, and production
build. The opt-in `tests/browser-picture-cache.mjs` check used real scanned JPG/PNG
uploads: five cold thumbnails loaded with concurrency one; a reload with simulated
storage failures made zero thumbnail API calls. It also checked original-picture
failure fallback, desktop/mobile layout, Trash eviction, sign-out cleanup, actual
IndexedDB persistence, account isolation, seven-day expiry and entry/byte limits.
`tests/picture-cache.test.mjs` covers storage-disabled fallback and cancellation,
while HTTP DOM tests cover paging, filter reset, metadata refresh reuse and cursor
failure recovery. Reports/screenshots are in ignored `artifacts/picture-cache/`.
Run the opt-in browser check with a localhost Vite/API/storage stack:

```bash
WUKNA_LIBRARY_HTTP_ORIGIN=http://127.0.0.1:5181 \
WUKNA_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
WUKNA_CHROMIUM_PATH=/absolute/path/to/chrome \
node tests/browser-picture-cache.mjs
```

The script purges only its own test files; its output records the disposable
account identity for subsequent local test-account cleanup.

The earlier Library integration passed typecheck, all 298 tests and production build. The
retired mock-only tests were removed; HTTP route, server plan catalog and disabled
checkout assertions were added. Both opt-in real API browser flows passed on
desktop and mobile with storage enabled. They confirm an empty new account,
1 GB usage, API-restart persistence, scanned code/picture uploads, private Blob
downloads, ownership, malware rejection and confirmed cleanup, plus PDF/Office/
Markdown original downloads and native preview/fallback handling, as well as the
metadata/organization workflows below. Fourteen successful screenshots and both
reports are retained in ignored `artifacts/library-final/`.

The older checkpoint records below describe their dates, including mock previews
that were subsequently retired; they do not describe the current application.

## Phase 4 verification — authenticated API (October 11)

The integrated frontend passed `npm run typecheck`, all 302 tests in `npm test`,
and `npm run build`. The build retains only the existing SignalR annotation
warnings. Sixteen HTTP adapter tests cover authenticated requests, account
changes, renewal, cancellation, wire contracts, domain errors, private Blob
responses and unavailable uploads. Six DOM integration tests cover the default
HTTP adapter, confirmed mutations, failure feedback, cursor recovery, private
thumbnail cleanup, and processing file details. These are included in the 302
tests; the earlier sample-adapter tests remain explicit preview tests.

The opt-in `tests/browser-library-http.mjs` flow passed against the real API and
a migrated, disposable PostgreSQL 17 database with two disposable accounts.
It exercised login, folder creation and deletion while inside that folder,
video creation and editing, notes, favorites, complete folder paths, collection
membership and deletion, search, Trash/restore/purge, and persistence after
reload. Another owner's reads and writes returned 404. Seven desktop/mobile
checkpoints passed checks for horizontal overflow and named controls, with no
browser exceptions. The flow made 228 browser Library requests using the
unchanged server rate limits. Desktop dashboard/detail and mobile More
screenshots were also visually inspected. Library follows Boards, Notifications
remains last, and the separate storage utility stays available on Home and in
mobile More.

Run the opt-in flow only with an isolated local database, the reviewed migrations,
a local API, a Vite proxy targeting that API, `VITE_LIBRARY_PREVIEW=false`, and a
disposable Opera profile listening on CDP port 9226. It creates test accounts and
mutates their Library data. Use an available Playwright runtime through
`WUKNA_PLAYWRIGHT_MODULE` when it is not installed in the current runtime; no
dependency was added for this audit. From `frontend`:

```bash
WUKNA_LIBRARY_HTTP_ORIGIN=http://localhost:5178 \
WUKNA_OPERA_CDP=http://127.0.0.1:9226 \
node tests/browser-library-http.mjs
```

The browser report, screenshots, and verification logs are saved locally in
ignored `artifacts/library-http-phase4`. The temporary API, frontend server,
Opera profile process, and test database were stopped after verification. No
production database or deployment was changed.

Binary transfer, malware scanning, file cleanup against real storage, and
SeaweedFS restart persistence remain pending Phase 5. Private Blob handling was
tested with controlled HTTP fixtures; live video-provider metadata/thumbnail
availability was not established by this browser flow. The real UI accurately
keeps file uploads/downloads and checkout unavailable.

## Historical preview verification (before Phase 4)

Run `npm run typecheck`, `npm test`, and `npm run build` in `frontend`.
The Opera audit uses `tests/browser-library.mjs` and the repository's synthetic
auth/API fixtures in a disposable profile; it does not test real account data,
backend persistence, or third-party video availability. Its checks cover all
routes in both themes at 375, 390, 768, 1024, and 1440 widths, labelled controls,
contrast, page overflow, navigation order, loading/empty/error states, and the
main mutation/preview/sign-in-return flows. Screenshots use Canva viewport
sizes where supplied, including 390×1285/1414 and the individual 1440px frames.
Local screenshots and JSON evidence are ignored under `artifacts/library-complete`.
The current Canva inspection evidence is under `artifacts/canva-library`.

Results at the earlier October 11 visual-refinement checkpoint: typecheck, all 280 frontend
tests, and the production build pass. Opera passed 158 Library scans across
375, 390, 768, 1024, and 1440 widths in both themes, including upload/retry,
metadata, folders, favorites, collections, Trash, native picture/PDF/Markdown/code
previews, and authentication return. New checks cover Library disclosure via
mouse/keyboard, preservation of the current view/selection, mobile More storage,
storage continuity across workspace navigation, and reset on reload. Two
production checks at that checkpoint confirmed the earlier coming-soon gate.
Phase 4 replaces that gate with authenticated Library metadata; the development
sample-data gate remains separate.
The build emits only the two existing SignalR annotation warnings.

Before and after snapshots cover the same 72 route/theme/viewport combinations:
all nine Library views plus native Home, Boards, and Tasks, at 390/768/1440 × 1024
in both themes. Both baseline and refined scans reported no horizontal overflow,
unnamed controls, outlying controls, unexpected API requests, console exceptions,
or failures in the audited control contrast checks. These automated checks do
not constitute a full WCAG certification. Evidence is ignored under
`artifacts/library-refinement/{before,after,verification,production}`.

PDF upload and its native object/Blob handoff were verified. The headless Opera
screenshot does not establish native PDF page rendering, which depends on the
browser's PDF support. The UI always explains the Download fallback. Markdown
and code previews were verified as escaped text; picture decoding, dimensions,
and downloading an uploaded PNG were exercised in Opera.


## October 11 visual audit and refinement

Canva MCP was inspected again, including page 2's 192 × 908 sidebar frame. Its
editable text positions confirm separate workspace links, a labeled Library
group with counts, Favorites, collection shortcuts, and storage at the bottom.
The inspection draft was cancelled without edits. Sidebar geometry is recorded
in `artifacts/library-refinement/canva-sidebar.json`. The supplied screenshots
and current Wukna controls fill the remaining visual gaps; no exact reproduction
of unavailable Canva typography or image content is claimed.

The baseline implementation stacked a private label/title, disclosure,
breadcrumbs, and preview settings above the actual content. It added an 11rem
Library rail beside the existing global sidebar, used larger Library navigation
rows, repeated the storage summary, and duplicated document titles and Search
forms. These structural choices caused the disconnected hierarchy and cramped
recent cards. The standard-theme Opera baseline did not reproduce the supplied
screenshots' photo backdrop/transparency; the Library now explicitly uses the
same semantic page/header surfaces as native Home and Boards.

Focused corrections:

- Mount feature-owned navigation in the app shell's sidebar slot using a React
  portal, preserving the feature's query/context boundary. Reuse native global
  navigation classes, icon size, typography, selected colors, and radii. Keep
  Dashboard and Storage Management names; code stays in Documents. The later
  search consolidation removes Global Search from navigation and merges results
  into Dashboard.
- Clicking the active Library button toggles the section list, with a disclosure
  arrow, `aria-expanded`, and `aria-controls`. Hiding the list retains its slot,
  current route, and file selection; it does not recreate a second feature rail.
- Add direct collection shortcuts. Dashboard collection cards and sidebar links
  select the collection rather than merely opening its index.
- Keep Notifications as the last primary destination, followed by a separate,
  fixed storage utility outside the Library group. Board lists and account
  controls remain separate. Mobile More includes storage beneath Notifications;
  collapsed navigation keeps a named storage icon action. Storage Management
  remains reachable there rather than duplicating its link in Library navigation.
- Consolidate header chrome into the native surface header and a compact preview
  strip. Keep the disclosure explicit and preview scenarios accessible. Global
  Search has one query form. Mobile Library sections use a disclosure with Escape
  support and focus restoration rather than a long horizontal destination strip.
- Use existing gutter/spacing tokens, narrower filter fields, uniform tile
  padding, responsive grid density, bounded filenames with full accessible names,
  and concise document previews. Remove the duplicate dashboard storage card.

At 1440 × 1024, the shared sidebar releases about 196px of file-content width,
and the dashboard's recent files start about 79px higher (475px → 396px). Pictures
use four desktop columns instead of three at this width. Existing dialogs,
uploads, API adapter operations, themes, and authentication remain intact.
No new dependency, payment, sharing, or production backend was introduced.

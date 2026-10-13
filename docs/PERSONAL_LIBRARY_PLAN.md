# Personal Library: inspection and frontend checkpoint proposal

Status: the Library frontend, authenticated metadata APIs, private storage and
disabled subscription boundary are implemented under the user's later approvals.
The latest instruction sets every account's ceiling to 1 GB (1,000,000,000 bytes).
Library mock adapters, sample media and development preview routes were removed.
See [final acceptance](PERSONAL_LIBRARY_ACCEPTANCE.md) for current verification
and operational prerequisites. The initial 5 GB proposal below is superseded.
See [the current implementation and verification record](PERSONAL_LIBRARY_FRONTEND.md).
Inspection and implementation date: October 10, 2026. The initial inspection,
proposals, and F1 acceptance notes below are historical records, not the current
frontend scope or a requirement for further frontend checkpoint approvals.
See `PERSONAL_LIBRARY_BACKEND.md` and `PERSONAL_LIBRARY_STORAGE.md` for current
backend contracts and real storage verification.

## Current repository state

Initial inspection found `.agents/AGENTS.md` with no root guide. A root
`AGENTS.md` now records the user's standing navigation/code-document rules and
points to the detailed guide. Relevant documentation includes `README.md`,
`DEVELOPMENT_NOTES.md`, `docs/UI_UX_DESIGN_SYSTEM.md`,
`docs/UI_UX_REFACTOR_AUDIT.md`, `docs/BOARD_CHAT.md`, and production references.

| Area | Verified implementation | Library implication |
| --- | --- | --- |
| Frontend | React 19, TypeScript 5.7.3, Vite 6.4.3, Tailwind 3.4.17, Lucide | Use the installed stack; there is no installed shadcn library. |
| Routing | `app/App.tsx` owns pathname state, History navigation, session restoration, and authenticated rendering | Add a lazy Library feature boundary here; retain the existing authentication lifecycle. |
| Existing Library | `/library` and `/library/pictures` render `SoonPage` | Library is not a functioning authenticated feature yet. |
| Development previews | `main.tsx` enables `/dev/library`, `/dev/pictures`, and `/dev/journal` only in development | Current Library/Pictures components are fixture previews, not production data adapters. |
| Navigation | `Sidebar.tsx` and `MobileNav.tsx`; mobile uses Home, Week, Calendar, More | Add a Library entry to desktop navigation and mobile More at the appropriate frontend checkpoint. |
| UI | Shared Button, IconButton, Field, Dialog, Notice, LoadingSkeleton, Avatar; feature-owned menus | Compose existing primitives. Do not assume shadcn dropdowns, toasts, or tooltips exist. |
| Theme | Semantic CSS tokens, paired light/dark palettes, Color Studio; `theme.ts` owns preferences | Inherit existing tokens and theme handling; avoid an independent Library palette. |
| Requests | `auth.ts` exposes `apiFetch`; `api.ts` and `features/chat/chatApi.ts` implement typed clients | A future HTTP adapter must use this transport and existing error conventions. |
| State | Local React state/effects and some feature-specific external stores; no shared query package | Keep view state local; evaluate a Library-scoped query cache. |
| Tests | Node test runner, jsdom, React DOM tests; separate browser audit scripts | Extend these patterns rather than adding another unit-test runner. |
| Backend | .NET 10 Minimal APIs, Identity Guid users, EF Core 10, Npgsql, assembly-scanned configurations | A later `Features/Library` vertical slice can use the existing database. |
| Database | PostgreSQL snake_case; explicit relationships, indexes, constraints, owner-scoped personal queries | No Library entities or migrations currently exist. |
| Binary storage | Profile images are local WebP files served through public static-file middleware | Profile storage/public URLs are unsuitable for private Library content. |
| Private storage precedent | Chat has private local/OCI adapters, quarantine, ClamAV, bounded jobs, authenticated downloads | Reuse proven infrastructure ideas; do not reuse board membership or create chat attachments for Library items. |
| Production | ARM64 Docker, PostgreSQL volume, profile-image volume, Nginx API proxy; optional OCI/ClamAV override | Inspect deployment requirements separately before enabling private uploads. |

The design-system document describes Boards, Tasks, and Calendar as primary
destinations; actual navigation also includes Home, Quick tasks, Templates, and
Notifications. Follow the actual shell and update documentation deliberately
when Library becomes a meaningful workflow.

`apiFetch` restricts authenticated requests to the app's `/api/` origin, obtains
the in-memory JWT, handles refresh, and retries CSRF rejection. Library must not
create another token store or send this JWT to an external video provider.

## Design inspection: unresolved access

The requested Figma file is `kZmDvD5c1bXBThhLrYf1BF`. The first connection rejected
dashboard node `2013:296087` because the Starter-plan MCP tool allowance was
exhausted. The second connection reported that the dashboard node was not found;
its subsequent metadata call also hit the Starter-plan limit. Both connection
identities were checked with Figma `whoami` as required for diagnosis.

The user's refreshed page link still points to the same file and node `0:1`.
A subsequent read-only `use_figma` request to inspect page structure and all 17
specified frame IDs was also rejected by the same tool-allowance limit. No
Figma nodes were modified.

No high-fidelity design context, node screenshot, assets, component mappings,
responsive specifications, or interaction specifications were obtained. The
brief's 17 Library screen IDs remain unverified. A desktop screenshot showed
the file open in Opera with existing Wukna product/design-system frames, but did
not establish that the specified Library frames exist.

Do not infer Figma colors, dimensions, spacing, typography, imagery, or states
from the prompt or the legacy fixture previews. Recover the design context and
screenshots before implementing the dashboard or claiming visual fidelity.
The repository's established tokens can inform a preliminary shell only if the
user approves that explicitly.

## Opera inspection: connector unavailable, isolated testing available

The user requested Opera for current-app inspection. The Opera connector's
`list_tabs` call returned "Browser not connected." The visible Browser Connector
panel also reported "Update required." Desktop screenshots were available, but
AT-SPI supplied no Opera nodes and targeted keyboard/click input failed because
`ydotool` was missing. Opening the confirmed local Vite URL with Opera's launcher
did not produce a verified Wukna page capture.

The user reported that the connector update button did not respond. Verification
therefore used a separate disposable Opera profile with CDP, confirmed by its
`OPR/137.0.0.0` user agent. The checkpoint's browser audit uses the repository's
synthetic authentication/API fixtures; it does not inspect the user's existing
signed-in tab or establish backend persistence/security. No existing browser
session store or credentials were accessed, and the connector update remains
unresolved.

The existing unflagged dev app at `http://localhost:5173/library` was also opened
without API interception in this isolated profile. It redirected to `/login`,
rendered the existing sign-in screen, and emitted no page errors. Authenticated
current-app inspection remains limited by the unavailable existing session.

## Frontend architectural decisions

### Feature integration

Options:

1. Extend the existing preview components directly. This is initially small but
   carries `PreviewUI`, obsolete content categories, and scattered fixture reads
   into the actual feature.
2. Introduce a feature root and shared Library shell under `features/library`,
   leaving the current development previews intact until replacement is ready.
   This creates a clean data boundary without touching unrelated features.
3. Build a separate application/router. This duplicates the shell and session
   lifecycle and has unnecessary integration cost.

Recommendation: option 2. Use one personal domain with picture, document,
and external-video experiences. Code files are Documents with a specialized
viewer, following the user's updated requirement. Folders are category-scoped and nested;
collections reference items across categories. There are no sharing controls.

### Server state and adapter boundary

Options:

1. Follow existing React effects and feature hooks. No added dependency, but
   request deduplication, cache lifetime, invalidation, cursor pagination, and
   stale-request prevention would need Library-specific code.
2. Use TanStack Query inside the Library feature. It adds a dependency but covers
   those repeated data-lifecycle requirements across the planned views.

Recommendation: option 2, with a client lifecycle scoped to the authenticated
account and query keys containing the account ID. Cancel and discard old data on
logout/account change. Do not refactor Boards, Tasks, or Chat to use this cache.
Keep selection, dialogs, density, sorting preferences, and editor drafts separate
from cached server state. Begin with confirmed mutations and invalidation;
introduce optimistic behavior only where rollback/reconciliation is proven.

Official [installation guidance](https://tanstack.com/query/latest/docs/framework/react/installation)
supports React 18+, and the [TypeScript guidance](https://tanstack.com/query/latest/docs/framework/react/typescript)
currently supports TypeScript 5.6+, which includes this repository's versions.
Registry inspection returned `@tanstack/react-query` 5.104.1, React peer range
`^18 || ^19`, MIT. Pin the selected patch version and inspect the resulting lockfile
and bundle when adding it; no dependency was installed during inspection.

### Development versus production

The mock adapter owns all fixture data in memory, implements the same typed
contract as the eventual HTTP adapter, and resets by account/session. Use an
explicit development-only preview flag for authenticated `/library` integration
until backend integration is approved. The production route must not silently
return samples or fall back to a mock after an API error. Keep existing preview
URLs working during migration. Persist only appropriate view preferences locally.

## Proposed component structure

Create files when their checkpoint needs them, rather than scaffolding every
future view at once:

```text
frontend/src/features/library/
  LibraryRoot.tsx                  # lazy authenticated feature entry
  LibraryProvider.tsx              # account-scoped adapter/query lifecycle
  libraryRoutes.ts                 # explicit route parsing and destinations
  types.ts                        # discriminated item types and domain DTOs
  contracts.ts                    # queries, writes, pagination, adapter contract
  library.css                     # feature layout using existing semantic tokens
  api/
    LibraryApi.ts                 # typed feature interface
    httpLibraryApi.ts             # phase-three apiFetch adapter, not yet implemented
  mocks/
    fixtures.ts                   # only source of realistic development samples
    createMockLibraryApi.ts       # replaceable account-scoped development adapter
  hooks/
    useLibraryDashboard.ts
    useLibraryItems.ts
    useLibraryMutations.ts
  components/
    LibraryShell.tsx
    LibraryNavigation.tsx
    LibraryBreadcrumbs.tsx
    LibrarySearch.tsx
    StorageMeter.tsx
    LibraryItemCard.tsx
    LibraryItemActions.tsx
    LibrarySelectionBar.tsx
    LibraryEmptyState.tsx
  views/
    DashboardView.tsx
    PicturesView.tsx
    DocumentsView.tsx
    VideosView.tsx
    CollectionsView.tsx
    FavoritesView.tsx
    TrashView.tsx
    SearchView.tsx
    StorageView.tsx
  pictures/PictureViewer.tsx
  documents/DocumentViewer.tsx
  documents/CodeDocumentViewer.tsx
  videos/VideoViewer.tsx
  uploads/UploadQueue.tsx
```

The existing `LibraryPage.tsx` and `pictures/PicturesPage.tsx` remain legacy
development previews until the corresponding views replace them deliberately.
Shared UI imports stay in `components/ui`; avoid creating another Button/Dialog.

## Proposed domain and API contract shape

Use a `LibraryCategory` union: picture, document, video. Every item has
common identity, name, folder ID, favorite flag, created/updated timestamps,
deleted timestamp, and processing state. Category-specific fields form a
discriminated union; list DTOs do not contain full code source or binary data.
Document details distinguish PDF, text, code, and unavailable preview formats.
Code document details carry language and bounded source; all documents retain
file/asset metadata and use the same Documents folders and upload lifecycle.
Details also add safe video metadata or asset metadata.
Thumbnail references and original content access are separate contracts.

Folders have ID, name, category, parent ID, and timestamps. Collections have ID,
name, description, timestamps, and paginated item membership. Public write
requests never carry an owner ID. Mock account scoping is for development
isolation; backend authorization remains the real security boundary.

List queries accept category, folder, collection, favorite/trash state, search,
allowlisted sorting, cursor, and bounded page size. A page returns `items` and
`nextCursor`; exact counts are separate where needed. Sorts have a stable ID
tiebreaker, and opaque cursor formats are owned by the eventual backend.

Proposed routes beneath `/api/library`:

| Resource | Proposed contract |
| --- | --- |
| Dashboard | `GET /dashboard`, bounded category counts/recent/favorites/folders/collections |
| Items | `GET /items`, `GET /items/{id}`, `PATCH /items/{id}`, `DELETE /items/{id}` to Trash |
| Lifecycle | `POST /items/{id}/restore`, `DELETE /trash/{id}` permanently |
| Folders | `GET /folders`, `POST /folders`, `PATCH /folders/{id}`, `DELETE /folders/{id}` |
| Collections | CRUD `/collections`, paginated `/collections/{id}/items`, add/remove membership |
| Videos | `POST /videos`, `PUT /videos/{id}`; validated external bookmarks only |
| Search/favorites | Query filters on `/items`; `/search` if a distinct mixed result model is needed |
| Uploads | `POST /uploads`, transfer contract, `POST /uploads/{id}/finalize`, `DELETE /uploads/{id}` |
| Content | Authenticated `GET /items/{id}/thumbnail`, `/preview`, `/download` |
| Storage/plans | `GET /storage`, `GET /plans`; display-only paid plans |

These are proposals, not implemented endpoints or a commitment to a transfer
protocol. Upload DTOs must express reservation/session expiry, processing status,
idempotency, cancellation, and terminal failure before implementing the upload UI.
Storage summary exposes quota/used/reserved/available bytes. Recommend explicitly
defining 5 GB as 5,000,000,000 bytes; confirm the unit policy in the backend review.

## Dependency decisions for later frontend checkpoints

| Candidate | Evaluation | Proposed timing |
| --- | --- | --- |
| Shiki | Bounded read-only code document previews use the core, JavaScript engine, and language packages at 4.5.0 (MIT, Node >=20). Grammar loading is deferred until code is opened; React renders escaped token text. | Added for the user's Documents code-viewer correction. |
| Monaco | Rich editing benefits code operations but adds workers and bundle cost; its official README says mobile browsers are unsupported. Provide a mobile textarea fallback. Registry: 0.57.0, MIT. | Lazy-load only when opening the editor; verify Vite worker setup before selecting. |
| PDF.js | Supports PDF rendering, not arbitrary Office document previews. Worker and asset packaging require version-matched configuration. Registry: pdfjs-dist 6.4.299, Apache-2.0, Node >=22.13 or >=24; local Node 22.22.2 meets this. | Evaluate browser compatibility and security at the document checkpoint; no unsupported-format preview claims. |

References: [Shiki installation](https://shiki.style/guide/install),
[Monaco repository](https://github.com/microsoft/monaco-editor), and
[PDF.js getting started](https://mozilla.github.io/pdf.js/getting_started/).
Monaco and PDF.js remain uninstalled. A full editor is not required for uploaded
code previewing; future document editing would be a separate reviewed capability.

## Proposed frontend checkpoints and acceptance gates

### F1 — contracts, development adapter, and Library shell (approved)

The user approved this narrow checkpoint with unresolved Figma access: contracts,
an isolated mock adapter, and a preliminary shell using the verified Wukna design
system. Figma fidelity remains unverified.

- Define domain/DTO types, a typed adapter, routes, and account-scoped fixtures.
- Provide Library navigation for all required destinations and route-aware
  titles, breadcrumbs, private-library context, and a storage summary.
- Connect a lazy feature root through existing authenticated routing under an
  explicit development flag. Use desktop Library and mobile More entries.
- Mark unfinished destination content clearly; do not imply completed workflows.
- Test route parsing, account reset, cancellation/stale-response behavior,
  desktop/mobile navigation, and error/retry states; run `npm test` and build.
- Inspect light/dark and keyboard behavior in an isolated Opera profile. Stop
  with a concrete diff before the dashboard checkpoint.

### F2 — dashboard and storage-plan display

Recover Figma design context/screenshots first. Implement category summaries,
bounded recent/favorite items, recent folders/collections, storage utilization,
search entry, and upload/create entry points. Plan tiers are display-only; no
checkout, successful subscription simulation, or client quota increases.

### F3 onward — focused content and interaction checkpoints

Deliver Pictures/viewer, Documents/viewers (including code), Videos/player, then
collections/search/favorites/trash and shared folder/upload/bulk interactions as
separate coherent checkpoints. Verify their supplied desktop/mobile/dark and
companion states when accessible. Mock uploads are explicitly simulated and do
not establish secure persistent storage. Large-list pagination and virtualization
must be demonstrated before the complete frontend approval gate.

Only after the whole frontend checkpoint is approved begin backend behavior.
Only after backend approval replace the mock adapter with actual requests.
Final verification covers security, quota races, failures, lifecycle, existing
features, and production assumptions; frontend prototypes alone cannot pass it.

## Backend observations reserved for phase two

The private OCI/ClamAV chat implementation is useful precedent, but Library
authorization must be owner-based. Its image-only limits and board quotas cannot
serve as general Library policies. Never expose the profile static-file root or
permanent public object URLs for Library content.

Nginx currently limits `/api/` request bodies to 6 MiB. Large document uploads
therefore require a reviewed transfer design and explicit infrastructure changes
in the backend phase. The optional chat production override provisions OCI and
ClamAV; the base production stack alone does not establish a Library scanner or
storage configuration. Durable quota reservations, scan-before-release,
derivative accounting, Trash accounting, abandoned-upload cleanup, provider
timeouts, and storage backup/recovery must be designed and tested later.

No production credentials, OCI IAM policies, bucket durability settings, or
backup execution were verified in this inspection. No database, deployment,
authentication, chat attachment behavior, or billing implementation changed.

## Baseline verification completed

- `npm test`: 257 passed, 0 failed, 0 skipped.
- `npm run build`: TypeScript build and Vite production bundle passed.
- Build emitted existing SignalR PURE-annotation warnings; they were not changed.
- Repository working tree was clean before inspection.
- Browser interaction/Figma fidelity remain unverified as described above.
- Backend tests were not run; no backend code or schema was changed.

## F1 implementation and review

Implemented in `frontend/src/features/library/`: typed summary/detail, folder,
collection, storage, and proposed write/upload contracts; a replaceable read
adapter; account-scoped fixtures; bounded sample pagination; abortable reads;
and a Library-scoped TanStack Query cache. Query clients and adapters are
replaced on account or sample-state changes. Cleanup handles React StrictMode
effect replay without cancelling live queries. No file content is persisted.

The authenticated shell exposes nine destinations, private/sample context,
breadcrumbs, storage metadata, and desktop/mobile navigation. Sample search
exercises filtering and pagination; it is not the designed global-search screen.
Documents now includes a focused code-viewer preview; other unfinished
destinations explicitly mark content as such. Paid checkout is
disabled; no entitlement can be changed by this frontend.

Run the preview from `frontend/`:

```bash
VITE_LIBRARY_PREVIEW=true npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Sign in through the existing Wukna session and visit `/library`. The default dev
server retains the placeholder unless explicitly flagged. For review on the
usual `http://localhost:5173` server, local development now has
`VITE_LIBRARY_PREVIEW=true` in ignored `frontend/.env.development.local`; Vite
reloads that configuration automatically. The flag is local to this checkout.
`import.meta.env.DEV`
also guards the flag, so setting it during a production build cannot enable the
new mock feature. Initial unauthenticated requests remember only an exact local
Library destination for return after sign-in; no new token storage was added.

Dependency: pinned `@tanstack/react-query@5.104.1` and its query-core dependency.
The existing application had no shared request cache; the approved feature-scoped
choice handles deduplication, cancellation, query-key separation and pagination.
The install audit reports eight existing Tailwind dependency-tree advisories;
none target the added Query packages. No unrelated dependency upgrades were made.

Verification on October 10, 2026:

- `npm test`: 268 passed, zero failed/skipped (257 baseline plus 11 Library tests).
- Production build with `VITE_LIBRARY_PREVIEW=true`: passed, with existing
  SignalR annotation warnings. The new Library root/mock module is absent from
  the emitted bundle, and Opera confirms the placeholder and hidden navigation.
- Adapter tests cover filtered/bounded pages, cursor isolation, summary/detail
  separation, immutable responses, empty state, Trash storage accounting,
  cancellation, disposal and typed failures.
- DOM tests cover route controls, cache replacement across accounts, late/stale
  responses, shared reads, retry recovery and development StrictMode replay.
- Opera checked light/dark layouts at 375/768/1024/1440 pixels, all ten routes,
  route titles and focus, mobile More and Escape, keyboard search, load-more
  results, empty/loading/error states, recovery and disabled paid checkout.
  Automated scans found no horizontal overflow, unnamed controls, control
  contrast failures, page errors or unexpected API requests in those states.
- Opera confirms unauthenticated Library access redirects to sign-in and returns
  to the requested destination after a synthetic sign-in. Real login credentials
  and the user's current signed-in session were not used.
- Browser audit: `frontend/tests/browser-library.mjs`, sharing the existing
  `browser-ui-audit.mjs` setup. Run with `WUKNA_OPERA_CDP` pointing to a disposable
  Opera profile and `WUKNA_PLAYWRIGHT_MODULE` pointing to Playwright when it is
  supplied outside this project's dependencies. `WUKNA_LIBRARY_ORIGIN` selects
  the server; `WUKNA_LIBRARY_GATED=true` checks the production/default gate.
  `WUKNA_LIBRARY_AUTH_ONLY=true` isolates the sign-in return check.
  Screenshots and JSON evidence are local artifacts in `/tmp/wukna-library-f1`.

The user supplied desktop screenshots for the remaining frontend checkpoints.
MCP design reads remain blocked by quota, but those screenshots provide visual
references for the dashboard and viewers. Backend application behavior, schemas, migrations, storage,
infrastructure and billing remain untouched. This checkpoint does not establish
production authorization, quota enforcement, scanning, upload durability or
cross-user security. No files have been staged, committed or deployed.

The plan is included in the diff through a specific `.gitignore` exception to
the repository's broad new-Markdown ignore rule.

## User corrections and supplied design references

The user removed Code Snippets as a Library category/destination. Uploaded code
files belong to Documents and should render like an editor when viewed. There
is no independent snippets endpoint, folder hierarchy, storage counter or editor
creation workflow. Current Documents preview lists sample code files alongside
other documents and can open a supported local UTF-8 file without uploading it.
The read-only viewer provides highlighting, line numbers, language/encoding
context, wrapping and copy. Display is bounded to 400 lines/30,000 characters;
local file reading is bounded to 256 KB and rejects binary/non-UTF8 data. The
original bounded file text remains available for copying. Local previews reset
when the feature/account is unmounted and never enter storage or search counts.
Persistent upload behavior is still reserved for backend/integration checkpoints.

Navigation rule: Library directly follows Boards; Notifications is last in the
sidebar's primary destinations and mobile More. This is recorded in root
`AGENTS.md`, referenced by `.agents/AGENTS.md`, and maintained in
`docs/UI_UX_DESIGN_SYSTEM.md`.

Both MCP connections authenticate, but design-context and screenshot reads still
return the Starter-plan tool-call limit with the refreshed `s9uteffKOIyukyrQ` link.
The user supplied 18 image captures (including three duplicates), preserved in
ignored `artifacts/library-design-references/` with descriptive filenames. These
cover dashboard light/dark, documents list/grid/viewer, code viewer light/dark,
pictures/gallery/viewer, videos/player, collection, search, storage, and shared
interaction states. They are design references, not app image assets. No mobile
frames, original media assets or exact Figma variable/component metadata were
obtained. Preserve Wukna's actual tokens and shared shell while translating them.

The screenshots contain a separate code destination, video uploads and sharing
language. The user's updated instructions take precedence: code is Documents;
videos remain external bookmarks; this release remains entirely private with
disabled checkout and no board attachment capability. The code viewer's file
header, language chip, numbered source and status footer inform the focused
Documents preview; the complete screenshot layouts are future frontend work.

Correction verification:

- `npm test`: 273 passed, zero failed/skipped. Added checks for document
  classification, removed code route/category, real highlighting for eleven
  languages plus plain text, safe text rendering, UTF-8/binary/size handling,
  and preview bounds that preserve the original copy text.
- `npm run typecheck` and production build with the preview flag set: passed.
  No code viewer/highlighter module is emitted in the production feature bundle.
  The audit still reports only the same eight existing Tailwind-tree advisories.
- Opera passed the nine-route shell/search/state checks and code document
  rendering at 375/768/1024/1440 pixels in light/dark. Sidebar and mobile More
  ordering are asserted. Local-file selection, code copy (using a synthetic
  clipboard, leaving the real clipboard untouched), wrapping, binary rejection,
  and forgetting the local file after reload also passed.
- Current preview remains available on the normal `http://localhost:5173` app.
  Browser evidence is in `/tmp/wukna-code-documents`.

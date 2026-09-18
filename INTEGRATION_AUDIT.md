# Frontend/backend integration audit (2026-09-17)

This records the contracts found in the repository before the integration pass. All `/api/boards` routes require a bearer JWT. Board membership is checked on reads; owner or an editable guest is required for mutations. The browser refresh credential is an HttpOnly cookie.

| Visible feature | Backend route and method | Request / response | CSRF | Existing frontend | Work |
| --- | --- | --- | --- | --- | --- |
| Register | `POST /api/auth/register` | `{email,password}` / `AuthResponseDto` | Yes | Called, then opened demo | Keep issued session, show backend validation |
| Login | `POST /api/auth/login` | `{email,password}` / `AuthResponseDto` | Yes | Called, then opened demo | Use real session and errors |
| Google login | `GET /api/auth/external/google`, `POST /api/auth/external/exchange` | one-time code / `AuthResponseDto` | No | Auth helpers existed, callback unused | Wire callback and clean URL |
| Session restore | `GET /api/auth/csrf`, `POST /api/auth/refresh` | token / `AuthResponseDto` | Refresh yes | Helper existed, startup unused | Restore before route rendering |
| Logout / everywhere | `POST /api/auth/logout`, `POST /api/auth/logout-everywhere` | no body / 204 | Logout yes; everywhere bearer | Helpers only | Wire account controls |
| Google link / unlink | `POST /api/auth/external/google/link-intent`, `GET /api/auth/external/google/link`, `DELETE /api/auth/external/google/link` | no body / 204 | No; bearer or protected link cookie | Helpers only | Wire account controls; backend does not expose linked status |
| Board list/detail | `GET /api/boards`, `GET /api/boards/{id}` | none / `BoardSummaryDto {id,title,createdAt,role,canEdit}` | No | Hardcoded boards | Fetch, handle direct URLs and permissions |
| Create board | `POST /api/boards` | `{title}` / `BoardSummaryDto` | No | Opened fake board | Submit and use server ID |
| Share / change access | `PUT /api/boards/{id}/guests` | `{email,canEdit}` / 204 | No; owner | Fake members, Share opened chat | Add owner-only form and member read route |
| Remove guest | `DELETE /api/boards/{id}/guests/{guestId}` | none / 204 | No; owner | Absent | Add owner-only control |
| Notes/list/checklist read | `GET /api/boards/{id}/notes`, `GET /api/boards/{id}/notes/{noteId}` | none / `NoteDto` including kind, parent, position, color, completion, version | No | Hardcoded notes/tasks | Use board-scoped data |
| Create note/list/item | `POST /api/boards/{id}/notes` | `CreateNoteRequest` / `NoteDto` | No; edit membership | Fake local note; task tool idle | Persist all three kinds |
| Edit/move/toggle/delete | `PATCH`, `DELETE /api/boards/{id}/notes/{noteId}` | `PatchNoteRequest`; `If-Match: "<version>"` / updated `NoteDto` or 204 | No; edit membership | Local task toggle; other controls idle | Use versions, drag-end persistence, conflict recovery |
| Connections | No endpoint; `NoteConnection` EF model supports related/prerequisite | No DTO yet | No | Static SVG edges | Add board-scoped endpoints and persisted edges |
| Chat | No endpoint, persistence model, or SignalR hub | None | N/A | Fake local chat | Disable visibly; separate backend slice required |
| Cosmetic actions | No server contract for recent activity, notifications, favorites, undo/redo, pan | None | N/A | Clickable but idle | Remove or label unavailable; retain only working UI controls |

`NoteKind`: standalone 0, list 1, checklist item 2. `BoardRole`: guest 0, owner 1. Note updates and deletes require the latest numeric PostgreSQL `xmin` version inside a quoted `If-Match` header. A stale version returns `409 note_version_conflict`; a list must have no child items before deletion. The backend has no frontend route handler; Vite serves direct paths in development and Nginx has an SPA fallback. Vite's proxy uses `changeOrigin: false` for the registered Google callback origin. Production Nginx currently serves the static bundle only and needs a same-origin API reverse proxy before deployment.

## Implementation and verification status

The integration pass replaced mock boards, notes, tasks, members, and connections with server requests. It added `GET /api/boards/{id}/members` and board-scoped connection list/create/delete routes. Chat is visibly unavailable because the backend has no persistent chat slice. All other previously visible idle controls were removed. No migration was needed: `note_connections` is present in the first migration.

Verified on the local development stack: `dotnet build --no-restore` passes with zero warnings; `npm ci` and `npm run build` pass; `dotnet test --no-build` exits successfully, although the repository has no test project. Vite on the registered port 5173 proxies `/api` to Kestrel. Login, registration, board, and OAuth error callback paths render directly. An unauthenticated board reload makes one CSRF request and one refresh request, then shows login. Clean browser loads show no JavaScript errors or Vite overlay. Unauthenticated board, member, note, and connection routes return 401.

Disposable local accounts exercised the actual browser and API flows: registration, login, session restore, logout, logout everywhere, board creation and direct reload, note creation/editing/moving/property changes/deletion, checklist creation/editing/completion/deletion, related and prerequisite connection creation/persistence/deletion, board sharing and permission changes, and owner removal of a guest. A read-only guest could load the board but received 403 for note and connection mutations; an unrelated user and a removed guest could not load it. A stale note edit returned 409, showed the conflict UI, and succeeded after loading the latest version. The Tasks panel and canvas reflected the same checklist state. The chat panel displayed an unavailable notice without a fake composer. Duplicate registration and invalid login showed specific errors. The browser ran against local PostgreSQL, and all disposable accounts and boards were removed afterward; counts returned to the baseline of two users and zero boards, notes, connections, and memberships.

The Google challenge on port 5173 redirected to the registered `http://localhost:5173/api/auth/external/google/provider-callback` with state and PKCE S256. The current integration pass did not complete a live provider round trip, returning Google login, or account linking/unlinking through the provider. Persistent board chat and the production same-origin API reverse proxy remain future work. The older local Nginx frontend container was removed to free port 5173 for Vite; the checked-in production Nginx configuration remains in the repository.

## Stabilization follow-up (2026-09-18)

The account menu now queries `GET /api/auth/account` for Identity's linked-provider names and password availability; it refreshes after unlink and on reopening after a link callback. The local test used an Identity login row on a disposable account to check linked, unlinked, and Google-only menu states. This did not exercise another live Google provider round trip. Note drag/resize preview locally and save on release; color previews optimistically; per-note versioned mutation queues serialize rapid edits. Connections require an explicit source-handle drag and render attached arrow paths. Task-list titles and checklist child items use separate inline editors. Browser verification covered these interactions, reload persistence, a failed color save rollback, and a two-tab stale-version conflict. Disposable data was removed after verification.

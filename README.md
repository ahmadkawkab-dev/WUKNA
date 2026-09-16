# LAPIS

LAPIS is a collaborative visual planning application that combines a colored sticky-note
canvas with shared to-do lists and graph-style dependencies.

A user can own or join multiple boards. Each board contains spatial notes, checklist items,
and typed connections between notes. A prerequisite connection can represent work that must
be completed before another note becomes available. Board membership controls visibility and
editing; there are no application-wide owner or guest roles.

## Project status

LAPIS is under active development. The backend currently provides:

- ASP.NET Core Identity users without global role tables.
- Local email/password registration and login.
- Short-lived JWT access tokens and rotating HttpOnly refresh cookies.
- CSRF protection for cookie-backed authentication operations.
- Refresh-token revocation, logout, and logout-everywhere.
- Owner and guest board memberships with per-guest edit permission.
- Membership-filtered board creation, listing, detail, and guest-management endpoints.
- Self-referencing notes for top-level notes, lists, and checklist items.
- Typed note connections for related and prerequisite relationships.
- PostgreSQL `xmin` optimistic concurrency for collaborative note editing.
- Global `snake_case` PostgreSQL naming.

Google OAuth login, one-time exchange, explicit account linking, safe unlinking, and the React
callback are implemented. The development database contains the second migration. Disposable
HTTP tests cover the application session lifecycle and link/unlink safeguards; a real Google
round trip remains to be verified with a configured Google client secret.

The React application has local and Google sign-in screens. The board canvas and product UI
have not been built yet.

## Architecture

The backend follows vertical slice architecture. Feature code lives with the use case that owns
it instead of being divided into controller, service, and repository layers.

```text
Features/
├── AuthN/              Local sessions and Google authentication
├── Board/              Boards, memberships, and board endpoints
├── Notes/              Notes, lists, and checklist items
├── NoteConnections/    Graph edges between notes
└── Users/              Identity user extensions

Shared/Data/             EF Core DbContext and design-time factory
frontend/                React, TypeScript, Vite, and Tailwind application
postman/                 Native Git Postman collection and local environment template
Migrations/              EF Core migrations and model snapshot
```

Shared code is kept deliberately small. For example, `SessionIssuer` is shared by local and
external authentication because every successful identity flow must create the same application
JWT and refresh-token session.

## Data model

- `User` extends `IdentityUser<Guid>`.
- `BoardMembership` uses `(BoardId, UserId)` as its primary key and stores `Owner` or `Guest`.
- `Board` has many memberships and notes.
- `Note` uses `ParentNoteId` for checklist items; top-level notes and lists have canvas positions.
- `NoteConnection` links two notes on the same board and stores its connection type.
- `RefreshToken` stores only a SHA-256 token hash, never the plaintext refresh credential.
- Identity's `asp_net_user_logins` table stores external provider identities such as Google.
- `ExternalLoginGrant` stores a hashed one-time code and browser binding for OAuth handoff.

## Technology

- .NET 10 and ASP.NET Core Minimal APIs
- ASP.NET Core Identity
- Entity Framework Core 10
- PostgreSQL through Npgsql
- JWT bearer authentication
- Google OAuth
- React 19, TypeScript, Vite, and Tailwind CSS
- Nginx for the eventual production frontend image

## Prerequisites

- .NET SDK 10
- PostgreSQL
- Node.js 22 or newer
- npm
- A Google OAuth web client when working on Google sign-in

## Backend setup

Restore the application and local EF tool:

```sh
dotnet restore
dotnet tool restore
```

The development connection string in `appsettings.json` targets a local `lapis` database. Prefer
overriding credentials with User Secrets:

```sh
dotnet user-secrets set "ConnectionStrings:Postgres" "Host=localhost;Port=5432;Database=lapis;Username=postgres;Password=<password>"
```

Configure JWT settings. The signing key must contain at least 32 bytes:

```sh
dotnet user-secrets set "Jwt:Issuer" "Lapis"
dotnet user-secrets set "Jwt:Audience" "Lapis.Api"
dotnet user-secrets set "Jwt:SigningKey" "<at-least-32-byte-random-secret>"
dotnet user-secrets set "Jwt:AccessTokenMinutes" "15"
dotnet user-secrets set "Jwt:RefreshTokenDays" "7"
```

Google authentication is enabled at startup, so local development also requires credentials from
a Google OAuth **Web application**:

```sh
dotnet user-secrets set "Authentication:Google:ClientId" "<google-client-id>"
dotnet user-secrets set "Authentication:Google:ClientSecret" "<google-client-secret>"
```

Register this development redirect URI in Google Cloud Console:

```text
http://localhost:5173/api/auth/external/google/provider-callback
```

Start Google sign-in from the React app at `http://localhost:5173`, so Vite's `/api` proxy keeps
the provider callback on this registered origin. Calling the API directly on port 8080 generates
a different callback URI.

Apply the checked-in migrations and start the API:

```sh
dotnet ef database update
dotnet run
```

The API listens on `http://localhost:8080`. Its health endpoint is:

```text
GET http://localhost:8080/health
```

Never commit JWT signing keys, Google credentials, production connection strings, or exported
Postman Vault data.

## Frontend setup

```sh
cd frontend
npm ci
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to the backend at
`http://localhost:8080`. The frontend stores access tokens only in memory; refresh credentials
remain in an HttpOnly cookie.

The current Nginx configuration serves the compiled frontend only. API reverse proxying and the
production deployment topology still need to be added.

## Authentication lifecycle

Local registration and login return a JWT access token in JSON and set `lapis.refresh` as an
HttpOnly cookie. The browser obtains a CSRF token from `GET /api/auth/csrf` before calling
cookie-backed authentication endpoints.

Access tokens are sent as:

```text
Authorization: Bearer <access-token>
```

Refresh rotates the previous refresh credential and returns a new access token. Logout revokes
the current refresh token. Logout-everywhere revokes every active refresh token belonging to the
user; already-issued access tokens remain valid only until their short expiration.

Google establishes identity only. The backend redirects React with a three-minute one-time code
and sets a separate HttpOnly browser-binding cookie. React immediately removes the code from
history, exchanges it for a normal LAPIS session, and then uses the same refresh and logout flow
as local sign-in. Existing-email collisions require an authenticated, explicit Google link.
An AuthN background worker removes expired exchange grants in bounded hourly batches.

## Implemented API routes

```text
GET    /health

GET    /api/auth/csrf
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/external/google
GET    /api/auth/external/google/callback
POST   /api/auth/external/google/link-intent
GET    /api/auth/external/google/link
GET    /api/auth/external/google/link/callback
DELETE /api/auth/external/google/link
POST   /api/auth/external/exchange
POST   /api/auth/refresh
POST   /api/auth/logout
POST   /api/auth/logout-everywhere

GET    /api/boards
GET    /api/boards/{boardId}
POST   /api/boards
PUT    /api/boards/{boardId}/guests
DELETE /api/boards/{boardId}/guests/{guestId}
```

All board routes require a JWT. Listing and detail queries begin from `BoardMembership`, so users
cannot see boards they haven't joined.

## Database and migrations

Both checked-in migrations are applied to the development database. The reviewed
`FinalizeModelsAndExternalLogin` migration contains the normalized-email unique index, note
constraints, and Google OAuth grant table. Do not rewrite an applied migration.

EF uses the same `snake_case` convention at runtime and design time. Identity tables are named:

```text
asp_net_users
asp_net_user_claims
asp_net_user_logins
asp_net_user_tokens
```

## Postman

The `postman/` and `.postman/` directories are intentionally tracked. Select the **Lapis Local**
environment and store test passwords, CSRF tokens, and access tokens in Postman Local Vault.
Repository YAML files contain request definitions and non-secret local defaults only.

## Google OAuth test matrix

Use the React app at `http://localhost:5173` with the API running. Keep Google credentials in
User Secrets. The callback should briefly receive only an opaque `code`; React removes it from
the address bar before exchanging it.

| Case | Action | Expected result |
| --- | --- | --- |
| New Google user | Choose **Continue with Google** using an email absent from LAPIS. | One passwordless `asp_net_users` row, one `asp_net_user_logins` row, and a normal LAPIS session. |
| Returning Google user | Sign out, then use the same Google account. | The same LAPIS user ID is returned; no duplicate user is created. |
| Local-email collision | Register locally, sign out, then use Google with that email. | `account_link_required`; no automatic Google link. |
| Explicit link | Sign in locally, choose **Link Google**, and approve Google. | Google links to the signed-in LAPIS user; the callback returns `linked=google`. |
| Provider already owned | Try linking a Google identity already linked to another user. | `external_login_already_linked`; ownership does not move. |
| Google-only unlink | Sign in to an account created through Google and choose **Remove Google login**. | `cannot_remove_only_login`; the provider link remains. |
| Password-account unlink | Link Google to a password account, then remove it. | Link is removed and password login still works. |
| Cancellation | Cancel at Google's consent screen. | `oauth_cancelled`; no session or grant is issued. |
| Refresh and logout | After Google login, refresh, sign out, and attempt refresh again. | Refresh rotates; logout revokes the refresh cookie; the later refresh fails. |
| Logout everywhere | Open two sessions, choose **Sign out everywhere** in one, then refresh the other. | The other session's refresh fails. Existing JWTs last only until their short expiry. |

For database inspection, check `asp_net_users.password_hash`, `asp_net_user_logins`,
`external_login_grants`, and `refresh_tokens`. Grant rows should contain only hashes, and
`consumed_at` should be set after exchange. A replayed or malformed exchange request returns
`external_login_code_invalid`; an unconsumed grant past `expires_at` returns
`external_login_code_expired`. The one-time grant and refresh behaviors have also been checked
with disposable local fixtures.

## Roadmap

- Verify Google login and linking with a real Google OAuth client.
- Add note and connection endpoints with membership-based authorization.
- Build the React board canvas.
- Add real-time collaborative editing and board chat.
- Add containerization, Nginx API proxying, deployment, and operational documentation. Multiple
  API replicas must share the ASP.NET Core Data Protection key ring for OAuth state, external
  cookies, and link intents.

## License

See [LICENSE](LICENSE).

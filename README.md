# LAPIS

ASP.NET Core and React scaffold for shared boards, notes, and checklist items.

## Prerequisites

- .NET SDK 10.0.302
- Docker Engine 27.5 with Docker Compose v2
- Node.js 22.14.0

## Start

```sh
cp .env.example .env
docker compose up
```

Open `http://localhost:${APP_PORT:-8080}`. Infrastructure health is exposed at `/health`; the controller probe is `/healthz`.

## Environment

- `APP_PORT`: host port for the MVC app
- `POSTGRES_DB`: database name
- `POSTGRES_USER`: database user
- `POSTGRES_PASSWORD`: local database password; change the example value
- `FRONTEND_PORT`: host port for the optional React frontend


Dependencies are declared in `Lapis.csproj`; install/restore them manually with `dotnet restore` when working outside Docker. Frontend dependencies are declared in `frontend/package.json`; install them manually with `npm install`.

Board, note, connection, and authentication models are in place. The initial EF migration is intentionally left for the project owner to create and review.

## Authentication

Set `Jwt__SigningKey` to a secret of at least 32 bytes before starting the API. Keep it outside source control. The configured access token lifetime is five minutes; refresh credentials last 30 days and are stored only as hashes in PostgreSQL.

For local development, `dotnet run` uses `Properties/launchSettings.json` to select the `Development` environment. ASP.NET Core then loads the project's User Secrets automatically. Store the local signing key as `Jwt:SigningKey`; environment-based deployments use the equivalent `Jwt__SigningKey` name.

The browser calls `GET /api/auth/csrf` with credentials enabled, then sends the returned token in `X-CSRF-TOKEN` for `POST /api/auth/register`, `/login`, `/refresh`, and `/logout`. Register and login return a JWT access token in JSON and set an HttpOnly refresh cookie. Keep the access token in memory and send it as `Authorization: Bearer <token>` on protected API calls. Refresh rotates the cookie and returns a new access token. The React helper in `frontend/src/auth.ts` implements this flow.

`POST /api/auth/logout-everywhere` requires a bearer access token and revokes every active refresh credential for that user. Existing access tokens remain usable until their five-minute expiry. Board roles are deliberately absent from JWTs; board endpoints must check current membership in the database.

The board API does that check: `GET /api/boards` lists only memberships for the caller, `GET /api/boards/{id}` returns 404 for a nonmember, and `POST /api/boards` creates the owner membership with the board. Owners can add or update a registered guest through `PUT /api/boards/{id}/guests` with `{ "email": "...", "canEdit": true }`, or remove one with `DELETE /api/boards/{id}/guests/{guestId}`. Note editing endpoints have not been added yet; they must check the same membership and `CanEdit` rule.

Vite proxies `/api` to `http://localhost:8080` during local development. A production reverse proxy must route `/api` to the ASP.NET Core service on the same origin as the React app. The current Nginx file only serves static assets.

EF tooling can create the DbContext without a JWT signing key through the design-time factory. No migration is created by this repo change.

## Database naming

EF maps C# PascalCase names to lowercase `snake_case` in PostgreSQL for both runtime queries and migrations. For example, `BoardMemberships.BoardId` maps to `board_memberships.board_id`. Identity's four explicitly named tables are mapped to `asp_net_users`, `asp_net_user_claims`, `asp_net_user_logins`, and `asp_net_user_tokens`. Handwritten SQL and constraint expressions use those database names directly.

## Development

- ``:

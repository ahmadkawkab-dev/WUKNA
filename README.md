# Wukna

Wukna is a visual workspace for organizing notes and checklists on shared boards. People can arrange ideas on a canvas, connect related notes, and collaborate with board members in real time.

## Features

- Create, search, rename, and delete boards; invite members with view or edit access.
- Arrange colored notes and task lists on a canvas, edit checklist items, and connect notes with related or prerequisite links.
- See board presence, live cursors, editing indicators, and in-progress drag or resize previews through SignalR. Persisted changes remain backed by PostgreSQL.
- Register with email and password, sign in with Google, link or unlink a Google account, and manage sessions.
- Edit a profile display name, username, and avatar; choose an interface theme.

Library, Journal, Pictures, and standalone Tasks are planned. Their signed-in routes show coming-soon screens; development builds also include sample-content design previews. Board chat is not implemented.

## Tech stack

| Area | Technology |
| --- | --- |
| Backend | .NET 10, ASP.NET Core Minimal APIs, Identity, SignalR |
| Frontend | React 19, TypeScript 5.7, Vite 6, Tailwind CSS 3 |
| Database | PostgreSQL, Entity Framework Core 10, Npgsql |
| Authentication | JWT access tokens, rotating HttpOnly refresh cookies, CSRF protection for cookie-backed operations, Google OAuth |
| Tests | xUnit v3 integration tests with PostgreSQL Testcontainers; Node.js frontend tests |

The repository includes an Nginx configuration for serving built frontend assets. It does not include a Dockerfile, Compose stack, or a configured production API reverse proxy. Docker is needed to run the backend integration tests.

## Project structure

```text
Features/                    Backend feature endpoints, domain code, and realtime services
Shared/Data/                 EF Core context and design-time factory
Migrations/                  EF Core migrations
frontend/src/                React application
frontend/tests/              Frontend tests
tests/Lapis.IntegrationTests/ Backend integration tests
frontend/nginx.conf          Static frontend server configuration
```

The product is named Wukna; some source identifiers still use `Lapis`.

## Prerequisites

- .NET SDK 10
- PostgreSQL with a database and user you can use for local development
- Node.js and npm (the repository does not pin a Node.js version)
- A Google OAuth web application client for running the API
- Docker with a running daemon for backend integration tests

## Getting started

Run commands from the repository root unless a step says otherwise.

### 1. Clone and restore tools

```sh
git clone <repository-url>
cd <repository-directory>
dotnet restore
dotnet tool restore
```

### 2. Configure local secrets

Set a PostgreSQL connection string in your shell. Keep this variable set when applying migrations and running the API; EF's design-time factory reads environment variables, but does not load User Secrets.

```sh
export ConnectionStrings__Postgres='Host=localhost;Port=5432;Database=<database>;Username=<user>;Password=<password>'
```

Set the required JWT signing key and Google OAuth credentials with .NET User Secrets. The signing key must be at least 32 bytes. `appsettings.json` supplies the development JWT issuer, audience, lifetimes, and frontend origin; override them through configuration if your setup differs.

```sh
dotnet user-secrets set 'Jwt:SigningKey' '<at-least-32-byte-random-secret>'
dotnet user-secrets set 'Authentication:Google:ClientId' '<google-client-id>'
dotnet user-secrets set 'Authentication:Google:ClientSecret' '<google-client-secret>'
```

Register `http://localhost:5173/api/auth/external/google/provider-callback` as an authorized redirect URI for the Google OAuth client. Start sign-in through the frontend origin so Vite can proxy the callback to the API.

### 3. Start PostgreSQL and apply migrations

Start your local PostgreSQL service and create the database named in the connection string. Then run:

```sh
dotnet ef database update
```

### 4. Run the API

```sh
dotnet run --launch-profile http
```

The development API listens on `http://localhost:8080`; `GET /health` checks whether the process is responding. Profile images are stored under `App_Data/profile-images` by default, so the API process needs write access there.

### 5. Run the frontend

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/hubs` to the API at `http://localhost:8080`.

## Configuration

ASP.NET Core loads `appsettings.json`, environment variables, and User Secrets in Development. The required settings are `ConnectionStrings:Postgres`, `Jwt:SigningKey`, `Authentication:Google:ClientId`, and `Authentication:Google:ClientSecret`. `Authentication:Google:FrontendBaseUrl` defaults to the local Vite origin. `ProfileImages:Directory` can override the profile image storage path.

The included `.env.example` is a template; neither the API nor Vite automatically loads it as an application configuration file. The Vite proxy target is currently fixed in `frontend/vite.config.ts`. For deployment, the frontend, `/api`, and `/hubs` need a shared origin with API and WebSocket proxying; the included Nginx file serves static assets only.

## Database migrations

Migrations live in `Migrations/`. After changing the EF Core model, create a migration from the repository root with `dotnet ef migrations add <MigrationName>`, review it, and apply it with `dotnet ef database update`. The design-time factory uses the same PostgreSQL `snake_case` naming convention as the API. Set `ConnectionStrings__Postgres` for both commands.

## Testing and builds

The backend tests start an isolated PostgreSQL 17 container and apply migrations there. They require a working Docker daemon.

```sh
dotnet test --project tests/Lapis.IntegrationTests/Lapis.IntegrationTests.csproj
```

The frontend has Node.js tests, a TypeScript check, and a production build:

```sh
cd frontend
npm ci
npm test
npm run typecheck
npm run build
```

## Security and project status

Keep database credentials, JWT signing keys, OAuth credentials, and exported session data out of Git. Use User Secrets or environment variables locally and a secret manager in deployment. The current realtime registry runs in process; a multi-instance deployment needs additional shared coordination and a shared ASP.NET Core Data Protection key ring. Production containerization and deployment configuration are not provided here.

Wukna is under active development. The features listed above exist in the current source tree, while the planned areas are UI previews or coming-soon screens without persistent backend features.

## License

MIT. See [LICENSE](LICENSE).

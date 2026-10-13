# KidsGuard

KidsGuard is a web-first parental-control platform. This repository currently contains **Stages 1–2: project foundation and parent authentication**. It includes a React/Vite/Tailwind web app, an Express API, MongoDB-backed parent accounts and sessions, and an honest API health check. Family and child management, rules, browser blocking, Android pairing/enforcement, and deployment are not implemented yet.

## Requirements

- Node.js 24 LTS with npm 11.
- MongoDB Atlas access for database connectivity. The health check and web shell can also run without a database URI; the API will report MongoDB as disconnected.

Install Node.js from the [official Node.js download page](https://nodejs.org/en/download). `.nvmrc` selects Node 24 for version managers.

## Local setup

From the repository root in PowerShell:

```powershell
npm install
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
```

Edit `apps/api/.env` on your machine and set `MONGODB_URI` to the rotated, least-privilege Atlas credential. Configure TLS and Atlas network access for the backend. Keep this value out of frontend variables and Git.

`AUTH_SESSION_TTL_HOURS` defaults to 168 (seven days) and can be set between 1 and 720 hours. No session-signing secret is needed because session cookies carry random opaque tokens whose hashes are stored in MongoDB.

Start the backend in one terminal:

```powershell
npm run dev:api
```

Start the frontend in another terminal:

```powershell
npm run dev:web
```

Open `http://localhost:5173` to register or sign in. The API health endpoint is `http://localhost:5000/api/v1/health`; it reports whether the database is connected and never returns the connection string. Authentication requires MongoDB; without it, the API returns a safe service-unavailable response for auth operations.

## Tests and production build

```powershell
npm test
npm run build
```

The API tests use Node's built-in test runner and Supertest. The web tests use Vitest and React Testing Library.

## Current project map

- `apps/web` — React, React Router, Vite, Tailwind CSS, and shared Fetch service.
- `apps/api` — Express, Mongoose, validation/configuration, middleware, and API tests.
- `docs` — architecture, API, database, security, Android limitations, and deployment status.

See [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Database](docs/DATABASE.md), [Security](docs/SECURITY.md), [Android limitations](docs/ANDROID_LIMITATIONS.md), and [Deployment](docs/DEPLOYMENT.md).

See [Implementation status](docs/IMPLEMENTATION_STATUS.md) for the staged progress checklist and verification blockers.

The Chrome extension, Android Studio project, production services, and remaining parental-control features will be added in later stages. Live MongoDB Atlas registration/session persistence has not been verified. No enforcement capability is claimed by this foundation.

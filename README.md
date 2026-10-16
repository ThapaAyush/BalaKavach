# KidsGuard

KidsGuard is a web-first parental-control project. This repository currently contains **Stages 1–5: project foundation, parent authentication, child profiles, a backend device-pairing foundation, and a local Chrome website-filter foundation**. It includes a React/Vite/Tailwind web app, an Express API, MongoDB-backed parent accounts and sessions, parent-scoped family/child records, one-time pairing codes, device registration, and a Chrome Manifest V3 extension with a locally configured domain blocklist. The extension is not connected to accounts or paired devices and does not provide remote policy synchronization, tamper resistance, or complete parental controls.

## Requirements

- Node.js 24 LTS with npm 11.
- MongoDB Atlas access for database connectivity. The health check and web shell can also run without a database URI; the API will report MongoDB as disconnected.

Install Node.js from the [official Node.js download page](https://nodejs.org/en/download). `.nvmrc` selects Node 24 for version managers.

## Local setup

From the repository root in PowerShell:

```powershell
npm install
if (-not (Test-Path apps/backend/.env)) { Copy-Item apps/backend/.env.example apps/backend/.env }
```

Edit `apps/backend/.env` on your machine and set `MONGODB_URI` to the rotated, least-privilege Atlas credential. Configure TLS and Atlas network access for the backend. Keep this value out of frontend variables and Git.

`AUTH_SESSION_TTL_HOURS` defaults to 168 (seven days) and can be set between 1 and 720 hours. No session-signing secret is needed because session cookies carry random opaque tokens whose hashes are stored in MongoDB.

Start the backend in one terminal (alias: `npm run dev:api`):

```powershell
npm run dev:backend
```

Start the frontend in another terminal (alias: `npm run dev:web`):

```powershell
npm run dev:frontend
```

Open `http://localhost:5173` to register or sign in and manage child profiles. Device pairing is currently a backend API foundation with no device-monitoring UI. The local Chrome extension is a separate manual install; see [Extension setup](apps/extension/README.md). The API health endpoint is `http://localhost:5000/api/v1/health`; it reports whether the database is connected and never returns the connection string. Authentication, child-profile, pairing, and device operations require MongoDB; without it, the API returns a safe service-unavailable response.

## Tests and production build

```powershell
npm test
npm run build
```

The API tests use Node's built-in test runner and Supertest. The frontend tests use Vitest and React Testing Library. The extension workspace uses Node's built-in test runner for pure domain/rule logic; those tests do not verify actual browser enforcement.

## Current project map

- `apps/frontend` — React, React Router, Vite, Tailwind CSS, and shared Fetch service.
- `apps/backend` — Express, Mongoose, validation/configuration, middleware, and API tests.
- `apps/extension` — Chrome MV3 local blocklist interface and `declarativeNetRequest` rules; no backend connection.
- `docs` — architecture, API, database, security, Android limitations, and deployment status.

See [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Database](docs/DATABASE.md), [Security](docs/SECURITY.md), [Android limitations](docs/ANDROID_LIMITATIONS.md), and [Deployment](docs/DEPLOYMENT.md).

See [Implementation status](docs/IMPLEMENTATION_STATUS.md) for the staged progress checklist and verification blockers.

The Android Studio project, production services, and remaining parental-control features will be added in later stages. Live MongoDB Atlas registration, session persistence, family ownership, child-profile persistence, pairing, and device registration have not been integration-tested. Paired status does not mean a device is online or enforcing controls; no backend enforcement capability is claimed. The extension applies only its local Chrome-profile navigation rules; basic navigation blocking and rule removal were manually verified in an unpacked Chrome profile.

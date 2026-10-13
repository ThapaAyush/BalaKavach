# Local setup and deployment status

## Requirements

- Node.js 24 LTS and npm 11.
- A MongoDB Atlas URI only when database connectivity is needed.

Node 24 is pinned by `.nvmrc` and the workspace engine range. The current development environment reports Node `v24.20.0` and npm `11.19.0`.

## Install and run

From the repository root:

```powershell
npm install
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
```

Edit `apps/api/.env` locally and replace the MongoDB URI placeholders. Do not paste credentials into chat or commit `.env`.

`AUTH_SESSION_TTL_HOURS` defaults to 168. Production must serve the app over HTTPS so the `Secure` session cookie is accepted. The frontend and API should share a site because sessions use `SameSite=Strict`; set `CLIENT_ORIGIN` to the exact frontend origin.

In one terminal, start the API:

```powershell
npm run dev:api
```

In a second terminal, start the web app:

```powershell
npm run dev:web
```

The API listens on port 5000 and the web app on `http://localhost:5173`. Check `http://localhost:5000/api/v1/health` for the API and database connection state. To point the web app to another API URL, set `VITE_API_BASE_URL` in `apps/web/.env`.

## Checks

```powershell
npm test
npm run build
```

## Not deployed

No hosting provider or production environment has been selected or configured. HTTPS, production CORS, secret handling, health probes, logs, backups, and restore procedures must be configured before deployment. Live Atlas account creation and session persistence have not been verified. Chrome extension loading and Android Studio build instructions will be added when those applications exist.

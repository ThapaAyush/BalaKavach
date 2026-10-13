# KidsGuard architecture

## Stage 2 implementation

KidsGuard is a JavaScript monorepo managed with npm workspaces:

- `apps/web` is a React and Vite browser app. Tailwind CSS is integrated through the Vite plugin. The parent page supports registration, login, session restoration, and logout through the shared API service.
- `apps/api` is an Express REST API. The implemented endpoints are `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, and `POST /auth/logout` under `/api/v1`.
- MongoDB access is configured through Mongoose and the backend-only `MONGODB_URI` environment variable. Parent records store normalized email and Argon2id password hashes. Parent sessions store hashes of cryptographically random session tokens and have explicit expiration.
- Authentication uses MongoDB-backed sessions in production. API tests inject an isolated in-memory repository and do not connect to MongoDB.

The API has separate config, controller, middleware, model, route, service, validator, and utility directories. Child profiles, pairing, browser-extension, and native Android features are not part of this stage.

## Request path

The browser uses `apps/web/src/lib/api.js` to send credentialed requests to `VITE_API_BASE_URL`. The API applies security headers, a single credentialed CORS origin, request IDs, safe request logging, JSON size limits, and API/authentication rate limits. Authentication mutations also require the configured `Origin`. Errors do not expose stack traces, password hashes, session tokens, or environment values.

## Next stages

Family isolation, child profiles, pairing, policy synchronization, browser enforcement, Android capabilities, and deployment remain unimplemented. Architecture decisions for those features must preserve server-side authorization, least data collection, and honest enforcement reporting.

# KidsGuard architecture

## Stage 1 implementation

KidsGuard is a JavaScript monorepo managed with npm workspaces:

- `apps/web` is a React and Vite browser app. Tailwind CSS is integrated through the Vite plugin. The initial page calls the shared API service and displays the real API and MongoDB connection state.
- `apps/api` is an Express REST API. The API prefix is `/api/v1`; the only implemented route is `GET /health`.
- MongoDB access is configured through Mongoose and the backend-only `MONGODB_URI` environment variable. No collections or application schemas exist yet.

The API has separate config, controller, middleware, model, route, service, validator, and utility directories. Future browser-extension and native Android clients are not part of this stage.

## Request path

The browser uses `apps/web/src/lib/api.js` to send requests to `VITE_API_BASE_URL`. The API applies security headers, a single configured CORS origin, a request ID, safe request logging, JSON size limits, and an API rate limit before routing. Errors return a generic message and request ID; stack traces and environment values are not sent to clients.

## Next stages

Authentication, family isolation, child profiles, MongoDB models, pairing, policy synchronization, browser enforcement, Android capabilities, and deployment remain unimplemented. Architecture decisions for those features must preserve server-side authorization, least data collection, and honest enforcement reporting.

# KidsGuard architecture

## Stage 3 implementation

KidsGuard is a JavaScript monorepo managed with npm workspaces:

- `apps/web` is a React and Vite browser app. Tailwind CSS is integrated through the Vite plugin. The parent page supports registration, login, session restoration, logout, and real child-profile listing/creation through the shared API service.
- `apps/api` is an Express REST API. It implements `GET /health`, parent authentication under `/auth`, and parent-authorized child-profile CRUD under `/children`, all beneath `/api/v1`.
- MongoDB access is configured through Mongoose and the backend-only `MONGODB_URI` environment variable. Parent records store normalized email and Argon2id password hashes; parent sessions store hashes of cryptographically random tokens with explicit expiration. A unique Family record belongs to one parent, and ChildProfile records are scoped to that family.
- Authentication and family/child persistence use MongoDB in the server. API tests inject isolated in-memory repositories and do not connect to MongoDB.

The API has separate config, controller, middleware, model, route, service, validator, and utility directories. Pairing codes, device registration, browser extension, and native Android features are not part of this stage.

## Request path

The browser uses `apps/web/src/lib/api.js` to send credentialed requests to `VITE_API_BASE_URL`. The API applies security headers, a single credentialed CORS origin, request IDs, safe request logging, JSON size limits, and API/authentication rate limits. Authentication and child-profile mutations require the configured `Origin`. Child lookups derive the family from the authenticated parent and include that family ID in every child query; errors do not reveal whether an inaccessible child exists.

## Next stages

Multiple caregivers, pairing, policy synchronization, browser enforcement, Android capabilities, and deployment remain unimplemented. Architecture decisions for those features must preserve server-side authorization, least data collection, and honest enforcement reporting.

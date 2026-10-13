# KidsGuard architecture

## Stage 4 implementation

KidsGuard is a JavaScript monorepo managed with npm workspaces:

- `apps/web` is a React and Vite browser app. Tailwind CSS is integrated through the Vite plugin. The parent page supports registration, login, session restoration, logout, and real child-profile listing/creation through the shared API service.
- `apps/api` is an Express REST API. It implements health, parent authentication, parent-scoped child-profile CRUD, pairing-code issue/revocation/redemption, and parent-scoped device listing/revocation beneath `/api/v1`.
- MongoDB access is configured through Mongoose and the backend-only `MONGODB_URI` environment variable. Parent records store normalized email and Argon2id password hashes; parent sessions store hashes of cryptographically random tokens with explicit expiration. A unique Family belongs to one parent, ChildProfile records are scoped to that family, and device registrations retain the same family and child scope.
- Pairing codes contain 128 bits of random material; only SHA-256 hashes are stored. A conditional atomic update claims a code once when it is unexpired and not revoked. Device credentials contain 256 random bits; only their hashes are stored, and the raw credential is returned once in the successful enrollment response.
- API tests inject isolated in-memory repositories and do not connect to MongoDB. The earlier Atlas setup ensured the Stage 2/3 auth, family, and child indexes, but did not exercise CRUD persistence. Stage 4 index creation and MongoDB's actual atomic-redemption race still need integration testing; the single-document atomic update does not require a multi-document transaction.

The API has separate config, controller, middleware, model, route, service, validator, and utility directories. Device registration is only an enrollment record: there is no heartbeat, activity collection, website/app blocking, browser extension, or Android monitoring in this stage.

## Request path

The browser uses `apps/web/src/lib/api.js` to send credentialed requests to `VITE_API_BASE_URL`. The API applies security headers, a single credentialed CORS origin, request IDs, safe request logging, JSON size limits, and API/authentication/pairing rate limits. Parent mutations require the configured `Origin`. Child lookups and device operations derive the family from the authenticated parent and include that family ID in repository filters; cross-family misses do not disclose whether a record exists.

## Next stages

Multiple caregivers, device authentication/heartbeats, policy synchronization, browser enforcement, Android capabilities, and deployment remain unimplemented. Architecture decisions for those features must preserve server-side authorization, least data collection, and honest enforcement reporting.

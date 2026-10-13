# Implementation status

## Stage 1 — project foundation

- [x] Establish the `feature/stage-1-foundation` branch and npm workspace layout.
- [x] Add the web and API foundation, backend-only MongoDB configuration, and health route.
- [x] Add API and frontend foundation tests and setup documentation.
- [x] Run the Stage 1 standalone API tests (5 passed) and full test suite (7 passed).
- [x] Build the Stage 1 frontend and run `npm audit` (0 vulnerabilities reported at that time).

## Stage 2 — parent authentication

- [x] Add normalized parent registration and login with Argon2id password hashing.
- [x] Add MongoDB parent/session models, unique indexes, session expiry, and fail-closed database checks.
- [x] Add protected current-parent API, HttpOnly session cookies, origin checks, rate limits, and logout revocation.
- [x] Add parent registration/login/logout UI and automated auth/API tests.
- [x] Remove registration account enumeration: new and duplicate addresses receive the same generic response.
- [x] Reject missing, opaque, malformed, and untrusted Origins on authentication mutations; fail closed on database outages.
- [x] Run `npm test --workspace @kidsguard/api` (21 passed).
- [x] Run `npm test` (24 passed: 21 API and 3 web tests).
- [x] Run `npm run build` (Vite production build passed).
- [x] Run `npm audit` after the security review (0 vulnerabilities reported).
- [ ] Verify registration, index creation, session persistence, and expiry against a live MongoDB Atlas database; no live connection was attempted.
- [ ] Verify production cookie behavior in a deployed HTTPS browser environment.

## Stage 3 — family and child profiles

- [x] Add one unique family owner per authenticated parent and immutable family ownership on child profiles.
- [x] Add validated child-profile create, list, retrieve, update, and delete APIs scoped to the authenticated parent's family.
- [x] Return the same not-found response for absent and other-family children; reject client-supplied parent/family ownership fields.
- [x] Require exact Origin validation for child mutations and use no-store responses; fail closed when database/index storage is unavailable.
- [x] Update the web app to load and create real child profiles without showing fabricated device or pairing state.
- [x] Add API tests for full child CRUD, cross-parent read/update/delete isolation, input validation, origin checks, database-unavailable behavior, concurrent first-child requests, and owner-index-specific family-upsert recovery; cover child-profile loading, empty, validation-error, and API-failure states in the web tests.
- [x] Run `npm test --workspace @kidsguard/api` (35 passed).
- [x] Run `npm test` (40 passed: 35 API and 5 web tests).
- [x] Run `npm run build` (Vite production build passed).
- [x] Run `npm audit` (0 vulnerabilities reported).
- [ ] Verify Family/ChildProfile index creation, CRUD persistence, and isolation against a live MongoDB Atlas database; no live connection was attempted.
- [ ] Verify production session-cookie behavior in a deployed HTTPS browser environment.

The family/child API tests use an isolated in-memory repository and do not use local `.env` credentials. They verify schema/index declarations, duplicate-key recovery behavior, concurrent service requests, and fail-closed behavior without MongoDB, but actual MongoDB query execution, index creation, connection recovery, and Atlas persistence remain unverified. Production HTTPS cookie behavior also remains unverified. Child profiles currently support one parent owner per family; multiple caregivers and child consent/retention controls are not implemented.

## Later stages

- [ ] Stage 4 — rules, devices, and pairing.
- [ ] Stage 5 — Chrome extension.
- [ ] Stage 6 — Android pairing.
- [ ] Stage 7 — Android enforcement.
- [ ] Stage 8 — quality and security review.
- [ ] Stage 9 — deployment.

The Stage 2 API tests use an isolated in-memory auth repository; they do not load local `.env` credentials or connect to MongoDB. MongoDB schema/index declarations, direct session-expiry checks, fail-closed behavior, and simulated mid-operation network error mapping are covered, but real MongoDB writes, reconnect behavior, index creation, and Atlas persistence remain unverified. API tests require ephemeral loopback access, and Vitest needs permission to rename worker files in the sandbox temp directory; the checks passed with the required local permissions.

Email verification, password recovery, multi-factor authentication, shared rate-limit storage for multi-instance deployments, multiple caregivers, child consent/retention controls, pairing/device management, and production HTTPS deployment remain future work. No Stage 4 implementation has started.

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
- [ ] Verify registration/session persistence and expiry against live MongoDB Atlas. The auth indexes were ensured during the later database setup, but CRUD persistence was not exercised.
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
- [x] Ensure Family/ChildProfile indexes in the supplied Atlas database during setup.
- [ ] Verify family/child CRUD persistence and cross-family isolation against live MongoDB Atlas; no records were created or read during setup.
- [ ] Verify production session-cookie behavior in a deployed HTTPS browser environment.

The family/child API tests use an isolated in-memory repository and do not read local `.env` credentials. They verify schema/index declarations, duplicate-key recovery behavior, concurrent service requests, and fail-closed behavior. Auth/family/child indexes were ensured in Atlas during setup; actual registration/session writes, family/child query execution and persistence, connection recovery, and cross-family isolation remain unverified. Production HTTPS cookie behavior also remains unverified. Child profiles currently support one parent owner per family; multiple caregivers and child consent/retention controls are not implemented.

## Stage 4 — secure child-device pairing

- [x] Add expiring, revocable, single-use pairing codes with 128-bit cryptographic randomness and hash-only storage.
- [x] Add server-generated device registrations with family/child scope, hash-only 256-bit credentials, paired/last-seen/revoked fields, and no enforcement claims.
- [x] Add parent-authorized code issue/revocation and device list/revocation endpoints, plus rate-limited code redemption.
- [x] Atomically claim a code only when its hash matches and it is unexpired, unused, and unrevoked; register a device only after the claim succeeds.
- [x] Add tests for entropy/hash behavior, expiry, reuse, revocation, concurrent redemption, cross-family access, strict inputs, rate limits, database outages, uncertain enrollment outcomes, and honest device status.
- [x] Run `npm test --workspace @kidsguard/api` (48 passed).
- [x] Run `npm test` (53 passed: 48 API and 5 web tests).
- [x] Run `npm run build` (Vite production build passed).
- [x] Run `npm audit` (0 vulnerabilities reported).
- [x] Run `git diff --check`.
- [ ] Integration-test Stage 4 indexes, TTL cleanup, true concurrent redemption, and database failure recovery against MongoDB; no Atlas connection was made for Stage 4.
- [ ] Verify credential handoff over production HTTPS and storage by a real device client; device authentication/heartbeat and enforcement are not implemented.

The Stage 4 API tests use in-memory repositories and do not connect to MongoDB. Single-use behavior and uncertain insert outcomes are simulated in memory; the production repository uses MongoDB's atomic conditional `findOneAndUpdate`, which still needs live database race testing. If device insertion fails after code claim, the code remains consumed. If a committed insert's response is lost, the parent must revoke the listed registration and issue a new pairing code. Code claim and insert are not a multi-document transaction.

## Stage 5 — Chrome extension foundation

- [x] Add an unpacked Chrome Manifest V3 extension with a local blocklist and popup interface.
- [x] Use `declarativeNetRequest` dynamic rules for top-level navigations; reserve a dedicated rule ID range and cap the extension list at 100 domains.
- [x] Normalize and validate bare domains/HTTP(S) origins, including IDN-to-punycode conversion; reject credentials, ports, paths, query/fragment values, IP addresses, malformed domains, and unsupported schemes.
- [x] Persist only the local domain configuration in `chrome.storage.local`; request no host permissions or page-content access.
- [x] Add pure Node tests for normalization, URL matching, rule generation, rule application/removal, update errors, and preservation of unrelated rules. Allowlist precedence is not supported.
- [x] Run `npm test --workspace @kidsguard/extension` (12 passed).
- [x] Run `npm test --workspace @kidsguard/api` (48 passed).
- [x] Run `npm test` (65 passed: 48 API, 5 web, and 12 extension tests).
- [x] Run `npm run build` (frontend production build passed).
- [x] Run `npm audit` (0 vulnerabilities reported).
- [x] Run `git diff --check`.
- [x] Load the unpacked extension and verify blocking/removal and error reporting in a real Chrome browser.

The extension is local-only. It has no backend authentication, pairing, device credentials, remote synchronization, tamper resistance, subresource filtering, or Android enforcement. Its Node tests use injected Chrome API fakes and do not exercise Chrome's actual rule engine. See [extension setup](../apps/extension/README.md) for manual steps.

## Later stages

- [ ] Stage 6 — Android pairing.
- [ ] Stage 7 — Android enforcement.
- [ ] Stage 8 — quality and security review.
- [ ] Stage 9 — deployment.

The Stage 2 API tests use an isolated in-memory auth repository; they do not load local `.env` credentials or connect to MongoDB. MongoDB schema/index declarations, direct session-expiry checks, fail-closed behavior, and simulated mid-operation network error mapping are covered, but real MongoDB writes, reconnect behavior, index creation, and Atlas persistence remain unverified. API tests require ephemeral loopback access, and Vitest needs permission to rename worker files in the sandbox temp directory; the checks passed with the required local permissions.

Email verification, password recovery, multi-factor authentication, shared rate-limit storage and trusted-proxy configuration for deployment, multiple caregivers, child consent/retention controls, device authentication/heartbeats, enforcement, and production HTTPS deployment remain future work. Chrome browser enforcement for the local blocklist was manually verified for domain and subdomain navigation blocking and unblocking in an unpacked developer-mode profile.

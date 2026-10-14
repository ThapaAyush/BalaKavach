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

## Stage 6 — device authentication and secure pairing integration

- [x] Add device bearer authentication middleware (`requireDeviceAuth`) validating 43-character base64url credentials, header length limits (<= 256 bytes), SHA-256 hash lookup, and revocation checks.
- [x] Add device heartbeat endpoint (`POST /api/v1/devices/heartbeat`) with conditional atomic updates (`{ _id: deviceId, revokedAt: null }`), strict empty-body validation (`deviceHeartbeatSchema`), and `no-store` headers.
- [x] Prevent heartbeat/revocation race conditions: heartbeats racing with or arriving after revocation are rejected with 401 without updating `lastSeenAt`.
- [x] Add configurable rate limiting on device heartbeat routes (default 60 requests / 15 minutes per IP in memory) with support for shared production stores.
- [x] Integrate parent web UI for ephemeral in-memory pairing code generation, clear countdown expiry display, and unredeemed code cancellation.
- [x] Protect UI lifecycle with `AbortController` and active-child tracking to prevent late-arriving responses from displaying stale pairing codes after sign-out, child context switching, or component unmount.
- [x] List family-scoped paired devices in the parent UI with child, platform, paired timestamp, last seen, and status badge; allow parent device revocation and list refresh.
- [x] Keep `enforcementStatus` honestly declared as `not_implemented` across API responses, models, and UI displays.
- [x] Add automated unit and integration tests across API (68 tests) and web (14 tests) covering device authentication, heartbeat, revocation races, rate limits, in-memory UI storage, lifecycle aborts, and error handling.
- [ ] Integration-test Stage 6 conditional atomic updates and reconnection races against real MongoDB Atlas; automated tests use isolated in-memory repositories.
- [ ] Verify production multi-instance rate limiting with a shared storage backend (e.g. Redis).
- [ ] Verify production HTTPS deployment and client device storage of bearer credentials.

The Stage 6 tests use in-memory repositories and simulate atomic operations and timing-safe secret comparisons. Live MongoDB Atlas multi-process parallel writes, reconnection races, index performance, and shared rate-limiting stores remain unverified. `enforcementStatus` is strictly `not_implemented` across all models and UI displays; no website blocking or device monitoring is enforced on child devices in this stage.

## Stage 7 — Chrome extension device integration

- [x] Integrate Chrome Manifest V3 extension with the device-authentication and heartbeat API (`@kidsguard/api`).
- [x] Add extension device client (`apps/extension/src/device-client.js`) with configurable API base URL, local HTTP tolerance, and strict HTTPS requirement for non-local hosts.
- [x] Strictly validate 22-character base64url pairing codes and 43-character base64url device credentials before storage; reject malformed server payloads safely.
- [x] Securely encapsulate the 256-bit device credential inside the service worker boundary in `chrome.storage.local`; never expose raw credentials to the popup UI.
- [x] Add minimum required `alarms` permission and narrowly scoped local development `host_permissions` (`http://localhost:5000/*` and `http://127.0.0.1:5000/*`); reject broad wildcards (`<all_urls>`, `*://*/*`).
- [x] Schedule 15-minute background heartbeat alarm (`kidsguard_heartbeat`) using `chrome.alarms`; reconcile and recover idempotently on service worker boot, `onInstalled`, and `onStartup` without timer resets or duplicate alarms.
- [x] Handle network offline states gracefully with retry tolerance; represent HTTP 401 neutrally as `invalid_session` without claiming parent revocation and halt heartbeat network requests until explicit re-pairing or reset.
- [x] Isolate declarativeNetRequest rules and local domain filtering from backend availability, pairing errors, and heartbeat failures.
- [x] Authorize internal runtime message senders (`sender.id === runtime.id`, rejecting web tabs and external origins) and strictly validate domain, pairing code, device name, and platform inputs.
- [x] Integrate popup UI (`popup.html`, `popup.css`, `popup.js`) with pairing-code input, device name input, in-flight duplicate submission prevention, sanitized status badges (`Unpaired`, `Paired`, `Re-auth required`), heartbeat display with offline notice, and unpair action with confirmation.
- [x] Disclose clearly in the popup that remote policy synchronization is not implemented yet; website filtering rules remain local to this Chrome profile.
- [x] Add automated unit tests across device client (14 tests), manifest (1 test), service worker (11 tests), and popup UI (11 tests), totaling 48 passing extension tests.
- [x] Run full test suite across API (68), web (14), and extension (48), totaling 130 passing tests.
- [x] Run production build (`npm run build`) and security audit (`npm audit` with 0 vulnerabilities).
- [ ] Verify live unpacked Chrome extension pairing, heartbeat alarm execution, and popup status against a running API backend in a physical Chrome browser.
- [ ] Configure production HTTPS host permissions in `manifest.json` for deployed environments.

The Stage 7 tests use isolated mocks for Chrome APIs (`chrome.alarms`, `chrome.storage.local`, `chrome.runtime`, `chrome.declarativeNetRequest`) and simulate DOM interaction in pure Node.js. Live unpacked Chrome extension pairing, alarm firing across browser sleep cycles, and physical UI interactions remain unverified in automated CI. `enforcementStatus` remains strictly `not_implemented` across the monorepo; device pairing registers and tracks presence only and does not distribute or enforce blocklist policies from the parent dashboard. Local website filtering rules remain profile-local.

## Later stages

- [ ] Stage 8 — Android enforcement and cross-platform policy integration.
- [ ] Stage 9 — quality and security review.
- [ ] Stage 10 — deployment hardening.

The Stage 2 API tests use an isolated in-memory auth repository; they do not load local `.env` credentials or connect to MongoDB. MongoDB schema/index declarations, direct session-expiry checks, fail-closed behavior, and simulated mid-operation network error mapping are covered, but real MongoDB writes, reconnect behavior, index creation, and Atlas persistence remain unverified. API tests require ephemeral loopback access, and Vitest needs permission to rename worker files in the sandbox temp directory; the checks passed with the required local permissions.

Email verification, password recovery, multi-factor authentication, shared rate-limit storage and trusted-proxy configuration for deployment, multiple caregivers, child consent/retention controls, Android enforcement, and production HTTPS deployment remain future work. Chrome browser enforcement for the local blocklist was manually verified for domain and subdomain navigation blocking and unblocking in an unpacked developer-mode profile.

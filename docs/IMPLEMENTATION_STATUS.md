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
- [x] Run `npm test --workspace @kidsguard/backend` (21 passed).
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
- [x] Run `npm test --workspace @kidsguard/backend` (35 passed).
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
- [x] Run `npm test --workspace @kidsguard/backend` (48 passed).
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
- [x] Run `npm test --workspace @kidsguard/backend` (48 passed).
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

- [x] Integrate Chrome Manifest V3 extension with the device-authentication and heartbeat API (`@kidsguard/backend`).
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
- [x] Run full test suite across backend (68), frontend (14), and extension (48), totaling 130 passing tests.
- [x] Run production build (`npm run build`) and security audit (`npm audit` with 0 vulnerabilities).
- [ ] Verify live unpacked Chrome extension pairing, heartbeat alarm execution, and popup status against a running API backend in a physical Chrome browser.
- [ ] Configure production HTTPS host permissions in `manifest.json` for deployed environments.

The Stage 7 tests use isolated mocks for Chrome APIs (`chrome.alarms`, `chrome.storage.local`, `chrome.runtime`, `chrome.declarativeNetRequest`) and simulate DOM interaction in pure Node.js. Live unpacked Chrome extension pairing, alarm firing across browser sleep cycles, and physical UI interactions remain unverified in automated CI. `enforcementStatus` remains strictly `not_implemented` across the monorepo; device pairing registers and tracks presence only and does not distribute or enforce blocklist policies from the parent dashboard. Local website filtering rules remain profile-local.

## Stage 8 — Android child application foundation & policy integration

- [x] Create Kotlin Android child application structure (`apps/android`) targeting API 34 (Android 14) with minimum API 26 (Android 8.0 Oreo), Gradle 8.7 wrapper, and Jetpack architecture components.
- [x] Integrate with existing KidsGuard backend pairing endpoint (`POST /api/v1/device-pairing/redeem`) with strict 22-character base64url pairing code and device name validation.
- [x] Implement secure credential storage using Android Keystore AES-256-GCM encryption (`androidx.security:security-crypto`); zero secrets in plain storage, logs, or error messages.
- [x] Integrate with device heartbeat endpoint (`POST /api/v1/devices/heartbeat`) using Bearer token authentication and strict empty body validation; handle network offline conditions gracefully and transition HTTP 401 responses neutrally to `invalid_session` without claiming parent revocation.
- [x] Implement background heartbeat execution via Android Jetpack `WorkManager` with `NetworkType.CONNECTED` constraint and 15-minute minimum periodic intervals.
- [x] Implement domain normalization and URL matching engine in Kotlin (`DomainNormalizer`, `DomainRuleEngine`), faithfully reproducing Chrome extension semantics (bare domains/origins, lowercase, trailing dot removal, punycode IDN, label regex, max 100 limit, subdomain matching).
- [x] Implement transparent local VPN filtering foundation (`KidsGuardVpnService`) using Android's supported `VpnService` API with foreground notification, explicit user consent, and honest documentation of limitations (no HTTPS decryption, private DNS / DoH bypass, single-VPN constraint).
- [x] Create beginner-friendly Material UI with tabbed navigation: Device Pairing & Status, Local Domain Rules, VPN Filter, Server Settings (emulator 10.0.2.2 vs LAN/HTTPS guide), and Privacy & Permissions disclosures.
- [x] Implement explicit unpairing flow with user confirmation dialog, clearing local credentials and WorkManager tasks while preserving local domain rules.
- [x] Add automated unit tests in Kotlin (JUnit 4) covering domain normalization, matching rules, API client URL/payload validation, repository pairing/heartbeat/session flows, credential storage, and local policy storage.
- [x] Add automated contract test suite (`apps/android/test/*.contract.test.js`) executed with Node.js test runner (9 passed).
- [x] Run full project test suite across backend (68), frontend (14), extension (48), and android contract tests (9), totaling 139 passing tests.
- [x] Run production build (`npm run build`) successfully.
- [ ] Verify live Android app build and execution in Android Studio / Gradle on a workstation equipped with JDK 17 and Android SDK.
- [ ] Verify live emulator / physical device pairing against running KidsGuard backend server.

The Stage 8 Android implementation uses pure Kotlin and Android Jetpack standards. Gradle wrapper scripts and unit tests are configured; local workstation environment lacks installed JDK/Android SDK, so compilation and Gradle build commands could not execute directly in this shell. Contract tests verified domain normalization, URL parsing, credential bounds, and state machine transitions in Node.js. Remote policy synchronization is not implemented in the backend, so domain filtering is strictly local to the Android device.

## Stage E — Chrome extension parent-managed policy synchronization (Approved / Complete)

**Status:** Approved / Complete (Formally approved by project owner based on reported Stage E verification results).
**Purpose:** Parent-managed Chrome website restrictions synchronized to the child device extension.

### Delivered capabilities
- [x] Connect Chrome extension to parent-managed policy backend endpoints (`GET /api/v1/devices/policy` and `POST /api/v1/devices/policy/ack`).
- [x] Parent dashboard and backend serve as the single source of truth for website restrictions.
- [x] Remove child-side domain editing (add/remove inputs and buttons), policy cancellation, and unpairing controls from popup UI and service worker runtime message handlers.
- [x] Securely fetch the authenticated parent's policy using the device's 256-bit Bearer credential; synchronize supported domains into Chrome Declarative Net Request (DNR) dynamic rules across all standard resource types with anchored domain matching (`||domain^`, rule ID range 1000..1099).
- [x] Clear Declarative Net Request rules when website restrictions are disabled by the parent.
- [x] Acknowledge policy versions to the backend and reflect `acknowledgedPolicyVersion` and `lastPolicyAckAt` in the parent device list.
- [x] Periodically synchronize policy during the 15-minute background heartbeat alarm cycle and support on-demand manual sync button in the popup.
- [x] Offline behavior preserves previously applied local rules during network failures or transient server errors; honestly report offline and sync status in the popup.
- [x] Handle HTTP 401 neutrally as `invalid_session` without claiming parent revocation and pause heartbeat/sync requests until re-pairing.
- [x] Enforce family/device ownership, preventing unauthorized policy retrieval or cross-family access.
- [x] Add automated end-to-end integration test (`apps/extension/test/extension-policy.integration.test.js`) verifying live HTTP pairing, policy sync, rule activation, policy update, rule clearing, child-side mutation rejection, and device revocation.
- [x] Automated test suite: 165 total passing tests across backend (81), frontend (17), extension (53), and Android contracts (14).
- [x] Run frontend production build (`npm run build`).

### Reported verification results and boundaries
- **Reported Manual Verification in Chrome**:
  - Chrome extension was paired with the child profile.
  - Parent-managed website policies synchronized to the extension.
  - Website blocking was manually verified in Chrome for `youtube.com`, `www.youtube.com`, and `m.youtube.com`.
  - Allowed website `wikipedia.org` continued to load without interruption.
  - Removing the test restriction restored access in Chrome.
  - Previously applied local rules remained active during the reported offline test.
- **Documented Boundaries and Limitations**:
  - The Chrome extension enforces supported website-blocking behavior strictly within the Google Chrome installation/profile where it is loaded.
  - Does not implement universal device-wide blocking, OS-level network interception, or filtering for other browsers or applications installed on the computer.
  - Stage E introduces no changes or enforcement to the Android application (which maintains independent local VPN filtering architecture from Stage 8).
  - Browser tamper resistance and process-level extension removal prevention remain out of scope.

## Stage F — Website integration, security review, and release verification (Complete)

**Status:** Complete
**Purpose:** End-to-end integration of parent website controls, backend security verification, monorepo workspace test unification, and release readiness.

### Delivered capabilities
- [x] Unified npm monorepo workspaces: configured `apps/android` as an npm workspace alongside `apps/backend`, `apps/frontend`, and `apps/extension`, enabling unified root-level `npm test` across all four applications.
- [x] Complete parent website integration:
  - Wired `PolicyManager.jsx` with version update callbacks (`onPolicyVersionChange`, `onPolicySaved`) to instantly update state and trigger device list refreshes upon saving a policy.
  - Connected `WelcomePage.jsx` to pass real child policy versions (`childPolicyVersions[selectedChild.id]`) to `DeviceStatusView.jsx`. This fixes an integration issue where devices defaulted to version 1 and falsely reported in-sync status when a newer parent policy was saved.
  - Wired tab navigation to reload device status upon opening the "Devices & Sync" tab.
  - Added acknowledged policy version tags (`• Policy: vX`) to the global device list.
  - Preserved exact device filtering disclaimer text required by regression tests.
  - Added automated integration regression test in `DashboardStageC.test.jsx` verifying live pending sync status transitions (`Sync Pending (v1 / v2)`).
- [x] Comprehensive security review:
  - Verified parent session cookies: `HttpOnly`, `SameSite=Strict`, `Path=/`, and production `Secure` with `__Host-` prefix.
  - Verified CSRF/Origin enforcement: mutating cookie-authenticated endpoints require strict match with `CLIENT_ORIGIN`.
  - Verified family and child ownership boundaries: all child, device, policy, and screen-time routes enforce parent family scoping, returning safe 404 responses for cross-family queries without disclosing record existence.
  - Verified rate limiting: auth (10/15m), pairing redeem (10/15m), device heartbeat (60/15m), screen-time ingestion (60/15m).
  - Verified device credential handling: 256-bit bearer tokens stored as SHA-256 hashes only; never returned in parent device lists or logs.
  - Verified error handling: database connection strings, credentials, and stack traces are withheld from API responses.
- [x] Multi-platform policy synchronization & boundaries:
  - Chrome Extension: full parent-managed synchronization with DNR dynamic rules covering all 13 standard resource types, rule ID range 1000..1099, anchored pattern `||domain^`, offline rule preservation, and neutral 401 handling.
  - Android Companion: Keystore-encrypted credentials, WorkManager heartbeats, contract tests for normalization and state transitions. Android limitations honestly documented (universal blocking requires MDM or local VPN; no remote policy sync is applied to Android companion yet).
  - Domain normalization differences documented: Backend and Chrome Extension strip `www.` for domains with > 2 labels (allowing `||domain^` to match `www.` and other subdomains); Android companion normalizes without `www.` stripping.
- [x] Monorepo verification results:
  - Root `npm test`: 166 passing tests across 4 workspaces (Backend: 81, Frontend: 18, Extension: 53, Android contracts: 14).
  - Production build: `npm run build` completed successfully (1.12s, 0 errors).
  - Security audit: `npm audit` reported 0 vulnerabilities.
  - Code hygiene: `git diff --check` passed cleanly.

## Later stages

- [ ] Stage 9 — quality and security review.
- [ ] Stage 10 — deployment hardening.

The Stage 2 API tests use an isolated in-memory auth repository; they do not load local `.env` credentials or connect to MongoDB. MongoDB schema/index declarations, direct session-expiry checks, fail-closed behavior, and simulated mid-operation network error mapping are covered, but real MongoDB writes, reconnect behavior, index creation, and Atlas persistence remain unverified. API tests require ephemeral loopback access, and Vitest needs permission to rename worker files in the sandbox temp directory; the checks passed with the required local permissions.

Email verification, password recovery, multi-factor authentication, shared rate-limit storage and trusted-proxy configuration for deployment, multiple caregivers, child consent/retention controls, cross-device remote policy distribution for Android, and production HTTPS deployment remain future work. Chrome browser enforcement for the local blocklist was manually verified for domain and subdomain navigation blocking and unblocking in an unpacked developer-mode profile.

# KidsGuard architecture

## Current implementation (Stages 1–F)

KidsGuard is a JavaScript and Kotlin monorepo managed with npm workspaces:

- `apps/frontend` is a React and Vite browser app with Tailwind CSS styling.
  - **Parent Control Center**: Supports registration, login, session persistence via HttpOnly cookie, logout, and child-profile CRUD.
  - **Pairing Management**: Generates ephemeral in-memory pairing codes with a 10-minute countdown timer, duplicate submission guards, and cancellation capabilities. Pairing codes are held exclusively in React state and never stored in `localStorage`, `sessionStorage`, cookies, or logs. Lifecycle guards and `AbortController` prevent late-arriving responses from displaying stale codes.
  - **Policy Management (`PolicyManager.jsx`)**: Parent-only interface to manage website domain restrictions (up to 100 domains), daily screen-time limits (in minutes), and quiet hours with day-of-week scheduling. Saves and increments policy versions on the backend.
  - **Device Synchronization & Presence (`DeviceStatusView.jsx`)**: Real-time listing of enrolled family devices displaying platform, paired timestamp, last seen timestamp, acknowledged policy version, and live sync status badge (`In Sync (vX)` vs `Sync Pending (vY / vZ)`). Allows parent device revocation.
  - **Screen-Time Reports**: Honest reporting of device screen-time usage and app breakdown without fabricating data when device permissions are not granted.
- `apps/backend` is an Express REST API with Mongoose and MongoDB.
  - Implements health, parent authentication with Argon2id password hashing, opaque session cookies (`HttpOnly`, `SameSite=Strict`, `Path=/`, and production `Secure`), family-scoped child CRUD, pairing code issuance/redemption/revocation, device listing/revocation, device bearer authentication, heartbeat presence, policy versioning, and screen-time ingestion beneath `/api/v1`.
  - Enforces parent-family scoping across all child, device, policy, and screen-time routes; cross-family queries fail closed with generic 404 responses without disclosing record existence.
  - Employs atomic single-document conditional updates for pairing code redemption (`findOneAndUpdate` on hash, expiration, and null redemption/revocation) and device heartbeats (`{ _id: deviceId, revokedAt: null }`).
- `apps/extension` is a Chrome Manifest V3 extension featuring parent-managed policy synchronization:
  - **Single Source of Truth**: The parent web dashboard is the sole authority for policy; child-side domain editing (inputs/buttons) and unpairing controls are eliminated from the extension popup.
  - **DNR Dynamic Rules**: Converts parent-configured blocked domains into Chrome `declarativeNetRequest` dynamic rules across all 13 standard resource types (`main_frame`, `sub_frame`, `stylesheet`, `script`, `image`, `font`, `object`, `xmlhttprequest`, `ping`, `media`, `websocket`, `webtransport`, `other`). Uses the anchored domain pattern `||domain^` within reserved rule ID range 1000..1099. Clears rules when restrictions are disabled by the parent.
  - **Automated Synchronization & Acknowledgment**: Fetches the active child policy using the device's 256-bit Bearer credential (`GET /devices/policy`) during the periodic 15-minute `kidsguard_heartbeat` background alarm cycle or via manual on-demand sync in the popup. Acknowledges applied versions (`POST /devices/policy/ack`), updating the device's `acknowledgedPolicyVersion` and `lastPolicyAckAt` for parent dashboard visibility.
  - **Offline Resilience & Failure Handling**: Previously applied DNR rules remain active during network dropouts or backend outages. HTTP 401 responses are handled neutrally as `invalid_session` without claiming parent revocation, pausing heartbeat and sync network calls until re-pairing.
- `apps/android` is a standalone Android Jetpack companion application written in Kotlin, with contract tests verified in Node.js within the root monorepo workspace.
  - **Hardware-Backed Credential Security**: Encrypts and securely stores the 256-bit bearer device credential returned from `POST /api/v1/device-pairing/redeem` using Android Keystore AES-256-GCM (`androidx.security:security-crypto`). Raw credentials are never logged or exposed in UI state. System backups exclude credentials via `data_extraction_rules.xml`.
  - **Presence Heartbeat Scheduling**: Uses Jetpack `WorkManager` with `NetworkType.CONNECTED` constraint to run periodic heartbeats (`POST /api/v1/devices/heartbeat`) at the Android minimum periodic interval of 15 minutes. Treats HTTP 401 neutrally as `invalid_session` without claiming parent revocation, halting periodic tasks until explicit re-pairing or unpairing. Network errors trigger standard WorkManager backoff retries without wiping credentials.
  - **Screen-Time Measurement & Zero-Fabrication**: Uses Android's official `UsageStatsManager` with `PACKAGE_USAGE_STATS` permission to aggregate foreground device usage without double-counting active applications. When permission is denied, reported screen time is strictly `null` (zero synthetic fabrication).
  - **Absence of VPN & Network Interception**: Conforms strictly to contract specifications: no `VpnService`, no traffic redirection, and no packet inspection. Operates purely as a companion application.
  - **User Interface**: Clean Material Components UI with read-only tabbed views for Device Status, Screen Time, Rules & Schedules, and Server Settings (supporting emulator `10.0.2.2` vs LAN IP / HTTPS).
- In-memory mock repositories are used during automated backend and integration tests to verify atomic operations and timing-safe secret comparisons without requiring external MongoDB Atlas instances.

## Request path and security boundaries

1. **Parent browser requests**: `apps/frontend/src/lib/api.js` sends credentialed requests (`credentials: 'include'`) to `VITE_API_BASE_URL`.
   - Security headers, CORS restricted to `CLIENT_ORIGIN`, request IDs, and rate limits are applied.
   - Mutating parent endpoints require an exact `Origin` match with `CLIENT_ORIGIN` (CSRF defense).
   - Identity is established strictly via the opaque session cookie; client-supplied parent or family IDs are rejected.
2. **Device requests**: Enrolled clients (`apps/extension` and `apps/android`) send requests using `Authorization: Bearer <deviceCredential>`.
   - `requireDeviceAuth` verifies token length (<= 256 bytes), 43-character base64url format, computes SHA-256 hash, and verifies the device registration is active and not revoked.
   - Raw credentials and hashes are never exposed in logs or parent API responses.
3. **Synchronization data flow**:
   - Parent edits and saves policy on frontend -> `PUT /api/v1/children/:childId/policy` -> Backend validates and increments `version` -> Extension fetches via `GET /api/v1/devices/policy` -> Extension updates DNR rules and acknowledges via `POST /api/v1/devices/policy/ack` -> Parent frontend queries `GET /api/v1/devices` and displays synchronized status.

## Domain normalization and platform boundaries

- **Backend and Chrome Extension**: Domains are trimmed, converted to lowercase Punycode, validated against DNS label specifications, and stripped of leading `www.` when total labels exceed 2 (e.g. `www.youtube.com` -> `youtube.com`). This ensures the extension's DNR rule `||youtube.com^` matches `youtube.com`, `www.youtube.com`, and `m.youtube.com`.
- **Android Companion**: Normalizes to lowercase Punycode without stripping `www.`.
- **Android platform limitations**: Ordinary Android apps cannot intercept traffic across third-party browsers without device-owner/MDM enrollment. Universal website blocking across arbitrary apps is not supported by standard Android permissions. Deliberately omits VPN interception.

## Next stages and out-of-scope work

Multiple caregivers, automated remote policy push for Android (which maintains independent local filtering), browser tamper resistance (extension uninstallation prevention in consumer Chrome), child consent/retention controls, and multi-process Atlas stress testing remain future work.

# KidsGuard

KidsGuard is a web-first parental-control monorepo. The repository contains a complete parent management web application, an Express/MongoDB backend API, an enrolled Chrome Manifest V3 extension with parent-managed Declarative Net Request (DNR) website filtering, and an Android companion application foundation with secure credential storage and contract verification.

## Repository structure

- `apps/frontend` — Parent web application built with React, Vite, React Router, and Tailwind CSS. Provides parent authentication, child profile CRUD, pairing code generation, device presence and synchronization monitoring, website blocking policy management, and screen-time reports.
- `apps/backend` — Express REST API with Mongoose, Argon2id password hashing, opaque session cookies, family ownership authorization, pairing code management, device authentication, policy versioning, and screen-time ingestion.
- `apps/extension` — Chrome Manifest V3 extension featuring parent-managed website blocking via Chrome `declarativeNetRequest` dynamic rules, 15-minute background heartbeat presence, offline rule persistence, and neutral session error handling.
- `apps/android` — Kotlin Android companion application targeting API 34 (Android 14) with Android Keystore AES-256-GCM credential encryption, WorkManager periodic heartbeat scheduling, and contract tests in Node.js.
- `docs` — Comprehensive documentation covering architecture, API endpoints, database schemas, security posture, Android platform limitations, and implementation status.

## Requirements

- Node.js 24 LTS with npm 11 (`.nvmrc` selects Node 24).
- MongoDB Atlas access for backend database persistence (or in-memory mock repositories used during automated test suites).
- (Optional for Android development) Android Studio with JDK 17 and Android SDK 34.

## Local setup

From the repository root in PowerShell:

```powershell
npm install
if (-not (Test-Path apps/backend/.env)) { Copy-Item apps/backend/.env.example apps/backend/.env }
```

1. Edit `apps/backend/.env` and configure `MONGODB_URI` with your MongoDB connection string.
2. Verify `CLIENT_ORIGIN` matches your frontend origin (default: `http://localhost:5173`).
3. Set `AUTH_SESSION_TTL_HOURS` (default: `168` hours / 7 days).

### Running development servers

Start the backend API in one terminal:

```powershell
npm run dev:backend
```
*(Runs on `http://localhost:5000` with health check at `http://localhost:5000/api/v1/health`)*

Start the parent web frontend in another terminal:

```powershell
npm run dev:frontend
```
*(Runs on `http://localhost:5173`)*

### Installing the Chrome extension

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `apps/extension` directory.
4. Open the extension popup, enter a single-use pairing code generated from the parent web dashboard, and pair the device.

## Parent website capabilities

- **Parent authentication**: Secure registration and login with Argon2id password hashing, opaque session cookies (`HttpOnly`, `SameSite=Strict`, `Path=/`, and production `Secure`), and session persistence across page refreshes.
- **Child profile management**: Family-scoped child creation, editing, and deletion.
- **Device pairing**: Generation of single-use, 128-bit cryptographic pairing codes with 10-minute expiry and real-time countdown. Codes can be revoked before redemption.
- **Device synchronization status**: Real-time display of enrolled devices, showing child association, platform, paired timestamp, last seen timestamp, acknowledged policy version, and live sync status (`In Sync` vs `Sync Pending`).
- **Website & screen-time policy management**: Parent control center for configuring website domain blocking (up to 100 domains), daily screen-time limits (in minutes), and quiet hours with day-of-week scheduling. Bumps policy versions upon save.
- **Screen-time reporting**: Honest display of daily device screen-time metrics and app usage. Faithfully reports when device permissions or usage data are unavailable without fabricating estimates.

## Parent-managed policy synchronization flow

1. **Policy configuration**: A parent configures website domain blocking and screen-time rules on the web dashboard (`apps/frontend`).
2. **Backend persistence & versioning**: The backend (`apps/backend`) validates domains, increments the policy version integer, and persists the policy to MongoDB (`PUT /api/v1/children/:childId/policy`).
3. **Device policy retrieval**: The enrolled Chrome extension (`apps/extension`) periodically (every 15 minutes via `chrome.alarms`) or on-demand fetches the active policy using its 256-bit Bearer credential (`GET /api/v1/devices/policy`).
4. **Dynamic rule enforcement**: The extension converts blocked domains into Chrome `declarativeNetRequest` dynamic rules across all 13 standard resource types using the anchored pattern `||domain^` within rule ID range 1000..1099. If restrictions are disabled, rules are cleared.
5. **Policy acknowledgment**: The extension acknowledges the applied version (`POST /api/v1/devices/policy/ack`).
6. **Parent dashboard reflection**: The parent dashboard compares the child's latest policy version with each device's `acknowledgedPolicyVersion`, displaying `In Sync (vX)` or `Sync Pending (vY / vZ)`.
7. **Offline resilience**: Previously applied DNR rules remain active in the local browser profile if the backend is temporarily unreachable or offline.

## Domain normalization and platform differences

- **Backend & Chrome extension**: Normalize domains by trimming, converting to lowercase Punycode, validating DNS label syntax, rejecting IPv4 addresses and numeric TLDs, and stripping leading `www.` prefixes when total domain labels exceed 2 (e.g., `www.youtube.com` -> `youtube.com`). This ensures the extension's anchored DNR pattern `||youtube.com^` matches `youtube.com`, `www.youtube.com`, and `m.youtube.com`.
- **Android companion (`DomainNormalizer.kt`)**: Normalizes input to lowercase Punycode and validates DNS label syntax without stripping `www.`.
- Maximum domain limit: Capped at 100 domains across all platforms.

## Android platform limitations

- **No universal browser blocking**: Ordinary Android applications cannot intercept, inspect, or filter web traffic across third-party browsers (Chrome, Firefox, etc.) without device-owner/MDM enrollment.
- **No VPN or packet interception**: In accordance with project security principles, the Android companion contains no `VpnService`, traffic redirection, or network interception. It functions as a lightweight status, presence, and screen-time companion.
- **Tamper resistance**: Ordinary Android apps cannot prevent uninstallation without Device Administrator / Device Owner management capabilities.

## Automated tests and verification

The root workspace orchestrates tests across all 4 packages:

```powershell
# Run all workspace test suites (Backend, Frontend, Extension, Android contracts)
npm test

# Run frontend production build
npm run build

# Run security audit
npm audit
```

### Current verification status

- **Automated test suite**: **166 passing tests** across 4 packages:
  - `apps/backend`: 81 passing tests (auth, child profiles, pairing, device presence, policy versioning, screen-time ingestion, rate limiting).
  - `apps/frontend`: 18 passing tests (auth forms, child profiles, pairing code countdown, device sync status, policy manager, error handling).
  - `apps/extension`: 53 passing tests (manifest permissions, device client, service worker alarms, DNR rule generation, popup UI, live policy sync integration).
  - `apps/android`: 14 passing contract tests (Node.js runner verifying domain normalization, URL parsing, credential bounds, and state machine transitions).
- **Production build**: Vite production bundle built successfully with 0 errors.
- **Dependency audit**: `npm audit` reports 0 vulnerabilities.

## Known gaps and out-of-scope capabilities

- **MongoDB Atlas multi-process concurrency**: Tests use isolated in-memory repositories; multi-process race conditions under live Atlas clusters remain unverified.
- **Browser tamper resistance**: Extension uninstallation or disabling prevention in consumer Chrome profiles is restricted by Chrome MV3 security architecture and requires Enterprise management policies.
- **Multi-caregiver support**: Single parent owner per family; multiple caregivers are not yet implemented.
- **Android Gradle build in CI**: Android companion contract tests pass in Node.js; full Gradle APK compilation requires a workstation with Android SDK and JDK 17 installed.

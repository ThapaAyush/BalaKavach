# Security status

## Implemented in Stages 1–F

- **Security Headers & Server Identification**: Helmet security headers applied; Express identification header (`X-Powered-By`) disabled.
- **CORS & Origin Protections**: Credentialed CORS strictly restricted to configured `CLIENT_ORIGIN`; cookie-authenticated mutations require an exact matching `Origin` header.
- **Request Size & Rate Limiting**: 32 KB JSON request-body limit. Global `/api/v1` rate limit (120 req/min) plus dedicated rate limits for authentication (10 req/15m), pairing code redemption (10 req/15m), device heartbeats (60 req/15m), and screen-time ingestion (60 req/15m).
- **Request Tracing & Information Leakage Defense**: Generated request IDs, safe error handlers that withhold stack traces and internal details, and structured request logging that omits authorization headers, cookies, and bodies.
- **Parent Account Security**: Emails normalized (trimmed, lowercased, validated); unique index prevents duplicates while registration returns identical generic responses for new and existing addresses to eliminate account enumeration. Passwords validated (8–128 characters) and hashed using Argon2id; hashes are excluded from database queries and API responses.
- **Session Security**: Cryptographically random opaque tokens in `HttpOnly`, `SameSite=Strict`, `Path=/`, and production `Secure` cookies with `__Host-` prefix. Only SHA-256 token hashes are stored in MongoDB. Session expiration checked per request; logout revokes stored sessions immediately.
- **Family Multi-Tenancy & Authorization Boundaries**: Each Family has one unique, immutable parent owner; child profiles have an immutable family reference. Every child, device, policy, and screen-time operation derives family identity from the session and scopes all queries to it. Cross-family queries fail closed with generic 404 responses.
- **Pairing Code Security**: Single-use 128-bit random pairing codes, stored only as SHA-256 hashes, with 10-minute expiration and cancellation support. Conditional atomic update (`findOneAndUpdate`) claims a code once upon redemption.
- **Device Credential Security**: 256-bit random bearer tokens (43-character base64url); stored exclusively as SHA-256 hashes. Raw credentials are never logged, exposed in UI state, or returned in device lists. Device bearer auth (`requireDeviceAuth`) validates token length (<= 256 bytes) and format.
- **Concurrency & Anti-Race Guards**: Device heartbeats use conditional atomic updates (`{ _id: deviceId, revokedAt: null }`), preventing revoked devices from updating `lastSeenAt`.
- **Policy Management & Synchronization**: Parent dashboard and backend serve as the single source of truth (`GET /children/:childId/policy` and `PUT /children/:childId/policy`). Policy updates atomically bump an integer version. Enrolled devices securely fetch active policy via `GET /devices/policy` and acknowledge applied versions via `POST /devices/policy/ack`.
- **Declarative Net Request (DNR) Dynamic Rules**: Chrome extension translates parent-configured blocked domains into dynamic DNR rules across all 13 standard resource types using the anchored pattern `||domain^` within reserved ID range 1000..1099. Offline resilience preserves active rules during network outages.
- **Screen-Time Zero Fabrication**: Screen-time ingestion enforces that when `permissionGranted` is `false`, `totalScreenTimeSeconds` MUST be `null`. Non-null values are rejected with 400.
- **Child-Side Control Elimination**: All child-side domain editing, policy cancellation, and unpairing controls are absent from the extension popup and Android companion UI.
- **Android Companion Security**: Android Keystore AES-256-GCM encryption for credentials, WorkManager periodic heartbeats, and complete absence of VPN or traffic interception.

## Remaining security work

- **Multi-Instance Rate Limiting**: In-process memory store resets on process restart; multi-instance production environments require injecting a shared Redis store into `rateLimitConfig`.
- **Reverse Proxy Trust**: `trust proxy` is disabled by default; when deploying behind AWS ALB, Cloudflare, or Nginx, trust must be restricted to explicit proxy hops before using client IPs for rate limiting.
- **Consumer Browser Tamper Resistance**: In consumer Chrome profiles, extension uninstallation or disabling cannot be prevented without Enterprise management policies (`ExtensionInstallForcelist`).
- **Production HTTPS & Manifest**: Chrome extension manifest host permissions default to local development endpoints (`http://localhost:5000/*` and `http://127.0.0.1:5000/*`); deploying to production requires updating `manifest.json` with the production HTTPS origin.
- **Future Features**: Email verification, password recovery, multi-factor authentication, multiple caregivers, and live multi-process Atlas stress testing remain future work.

# API status

Base path: `/api/v1`

## Health

### `GET /health`

Returns API liveness and the current Mongoose connection state. A disconnected database is reported as `degraded` / `disconnected`. The response does not expose connection strings.

## Parent authentication

Authentication routes require the configured `Origin` on mutations. Browser requests use credentialed CORS restricted to `CLIENT_ORIGIN`. Auth attempts are rate limited to 10 requests per 15 minutes per process/IP.

### `POST /auth/register`

Request:

```json
{
  "email": "parent@example.com",
  "password": "at least twelve characters"
}
```

Email is trimmed, validated, and lowercased. Passwords must contain 8–128 characters and cannot be all whitespace. Registration returns the same generic `202` response for a new or already registered address, so this endpoint does not reveal whether an account exists. It does not return a parent ID or automatically sign in.

### `POST /auth/login`

Accepts a validated email and password. A successful login returns `200` with the parent's ID and email and sets an opaque session cookie. Unknown email and incorrect password both return the same generic `401` response. The token is never returned in JSON.

The cookie is `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` in production. Production uses the `__Host-` cookie prefix. Its lifetime defaults to 168 hours and is configurable with `AUTH_SESSION_TTL_HOURS` (1–720 hours).

### `GET /auth/me`

Requires a valid, unexpired session cookie and returns the current parent. Missing, invalid, revoked, or expired sessions return `401`. A client-supplied user ID is never used to establish identity.

### `POST /auth/logout`

Deletes the session record and clears the cookie. Success returns `204`. The token is a random 256-bit value; MongoDB stores only its SHA-256 hash. The session expiry is checked on every request, with a TTL index for eventual cleanup.

Auth operations return a generic `503` when MongoDB or the required auth indexes are unavailable. No local or live Atlas database is used by automated auth tests; tests inject an isolated in-memory repository.

## Child profiles

All child-profile routes require the authenticated parent session cookie. The family is resolved from that parent on the server; requests cannot select a `familyId`, `parentId`, or owner. The first successful child creation creates the parent's single Family record. Child responses contain `id`, `displayName`, `dateOfBirth`, `createdAt`, and `updatedAt`, without family or parent ownership fields. Responses use `Cache-Control: no-store`.

Child mutations require an exact `Origin` match with `CLIENT_ORIGIN`. Inputs are validated; display names are trimmed, non-empty, and limited to 60 characters. Optional dates of birth use `YYYY-MM-DD` and cannot be in the future. Update accepts only `displayName` and/or `dateOfBirth` (use `null` to clear the date). Unknown ownership fields are rejected.

### `GET /children`

Returns `200` with `{ "children": [...] }` for the signed-in parent's family. If the family has not been created yet, the list is empty.

### `POST /children`

Creates a child profile and the parent's family if needed. Request fields are `displayName` (required) and `dateOfBirth` (optional). Returns `201` with `{ "child": {...} }`.

### `GET /children/:childId`

Returns `200` with `{ "child": {...} }` for a child in the signed-in parent's family. Missing, malformed, or other-family IDs all return the same `404` message.

### `PATCH /children/:childId`

Updates the provided profile fields within the signed-in parent's family. Returns `200` with `{ "child": {...} }`. A missing or other-family child returns the same `404`.

### `DELETE /children/:childId`

Deletes a child profile in the signed-in parent's family and returns `204`. A missing or other-family child returns the same `404`.

Unauthenticated requests return `401`, invalid bodies return `400`, and unavailable MongoDB/index storage returns a generic `503`. Automated child API tests use an in-memory repository; live MongoDB persistence remains unverified. Child profiles do not create pairing codes or device records.

## Child-device pairing

### `POST /children/:childId/pairing-codes`

Requires the authenticated parent session and exact configured `Origin`. The parent family is resolved server-side and the child must be in that family. The optional body may be omitted or `{}`; all other fields are rejected. The endpoint is limited to 10 requests per 15 minutes per IP/process. It returns a 128-bit random, 22-character base64url pairing code and an expiry 10 minutes in the future. The raw code is shown only in this creation response; MongoDB stores only its SHA-256 hash. Responses use `Cache-Control: no-store`.

### `DELETE /children/:childId/pairing-codes/:pairingCodeId`

Requires the parent session and exact `Origin`. The pairing code is revoked only when both the child and code belong to the parent's family and the code has not already been redeemed or revoked. Out-of-family and missing records return the same generic `404`.

### `POST /device-pairing/redeem`

Device enrollment endpoint; it does not require a parent cookie because the unexpired pairing code is the bearer proof. The strict request body is `{ "code": "...", "name": "...", "platform": "android|ios|windows|macos|linux|unknown" }`. The route is limited to 10 requests per 15 minutes per IP/process. Invalid, expired, revoked, and already-used codes receive the same `400` response. Redemption conditionally updates one PairingCode document only when its hash matches, `expiresAt` is later than the server time, and `redeemedAt`/`revokedAt` are null. MongoDB's atomic single-document update allows only one concurrent request to claim the code. Device creation happens only after that claim.

A successful redemption returns a server-generated device ID and a 256-bit device credential once in this enrollment response. Only the credential hash is stored. The response is `no-store`; request/response bodies are excluded from API logs. Parent device-list responses never contain the credential or its hash. A device client must store the credential in platform secure storage. If device-record creation fails after the atomic code claim, the code remains consumed and the parent must issue a new code. If a timeout or connection loss leaves the insert outcome uncertain, a device may be listed even though the one-time credential response was lost; the parent can revoke that registration and issue a new code. No transaction spans the code claim and device insert, so enrollment is single-use but not delivery-recoverable.

### `GET /devices`

Requires the authenticated parent session and lists only registrations in that parent's family. A device includes `id`, `childProfileId`, `name`, `platform`, `pairingStatus` (`paired` or `revoked`), `pairedAt`, `lastSeenAt`, `enforcementStatus`, `acknowledgedPolicyVersion`, and `lastPolicyAckAt`. At registration, `lastSeenAt` is null and `enforcementStatus` is `not_implemented`.

### `DELETE /devices/:deviceId`

Requires the parent session and exact `Origin`; only a device in the parent's family can be revoked. Other-family and unknown device IDs return the same `404`. Revocation sets `revokedAt` and updates `pairingStatus` to `revoked`. Revoked devices are rejected by device authentication, and concurrent heartbeats are rejected atomically without updating `lastSeenAt`.

### `POST /devices/heartbeat`

Device liveness endpoint authenticated by bearer token via the `Authorization: Bearer <deviceCredential>` header.
- **Authentication**: `requireDeviceAuth` extracts the token, enforces a 256-byte header length guard, validates the 43-character base64url credential format, hashes it with SHA-256, and verifies the device is not revoked (`revokedAt: null`).
- **Body Validation**: Uses a dedicated strict empty body schema (`deviceHeartbeatSchema`). Request bodies with client-supplied fields or attributes are rejected with `400`.
- **Atomic Concurrency**: Updates `lastSeenAt` conditionally using `{ _id: deviceId, revokedAt: null }`. If revocation took effect concurrently between authentication and update, the update matches zero documents, `lastSeenAt` is preserved unmodified, and the endpoint fails with a generic `401`.
- **Error Responses**: Invalid, missing, malformed, revoked, or racing-revoked credentials all receive generic `401` responses (`{ "ok": false, "error": { "message": "Device authentication failed." } }`). No credentials or credential hashes are exposed.
- **Headers & Caching**: Responses use `Cache-Control: no-store` and return sanitized device fields (`id`, `childProfileId`, `name`, `platform`, `pairingStatus`, `enforcementStatus: "not_implemented"`, `pairedAt`, `lastSeenAt`).
- **Rate Limiting**: Configurable via `rateLimitConfig.heartbeat` (defaults to 60 requests per 15 minutes per IP in memory). In-process rate limiting stores counters in memory; multi-instance production environments require injecting a shared store (e.g. Redis).

MongoDB TTL cleanup removes expired pairing records eventually, but redemption checks expiry directly and does not rely on TTL timing. Rate limits use in-process IP storage: counters reset on restart and are independent per API process, so deployment needs a shared store. Express proxy trust is not enabled here; behind a reverse proxy, configure only the known trusted proxy hops before using originating client IPs for limits. API tests use in-memory repositories; real MongoDB Atlas multi-process parallel writes, reconnection races, and index performance remain unverified.

The Chrome extension (`@kidsguard/extension`) integrates with `POST /device-pairing/redeem`, `POST /devices/heartbeat`, `GET /devices/policy`, and `POST /devices/policy/ack`. The extension service worker validates pairing codes, stores device credentials in extension storage, schedules 15-minute heartbeats via `chrome.alarms`, handles offline network retries, and interprets HTTP 401 neutrally as `invalid_session` without claiming definitive parent revocation. The extension manifest declares host permissions restricted to local development endpoints (`http://localhost:5000/*` and `http://127.0.0.1:5000/*`); deploying to production requires updating `manifest.json` host permissions to match the deployed HTTPS API origin.

## Parent and device policy synchronization

### `GET /children/:childId/policy`

Requires authenticated parent session cookie. Scoped strictly to the parent's family. Returns `200` with:

```json
{
  "policy": {
    "version": 1,
    "webRestrictions": {
      "enabled": true,
      "blockedDomains": ["youtube.com"]
    },
    "screenTime": {
      "dailyLimitMinutes": 120,
      "quietHours": {
        "enabled": true,
        "start": "21:00",
        "end": "07:00",
        "days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
      }
    }
  }
}
```

If no policy document exists yet for the child, returns a default policy with `version: 1` and empty settings. Other-family and absent IDs return `404`.

### `PUT /children/:childId/policy`

Requires authenticated parent session cookie and exact `Origin` match with `CLIENT_ORIGIN`. Accepts an update payload conforming to `updatePolicySchema`. Validates domains (normalized, Punycode, no IPv4, max 100), daily screen time (1-1440 minutes or null), and quiet hours (HH:mm and day enum list). Atomically increments the policy version integer and updates policy settings. Returns `200` with `{ "policy": {...} }`.

### `GET /devices/policy`

Device endpoint authenticated by bearer token via `Authorization: Bearer <deviceCredential>`.
- Derives the child profile and family from the authenticated, unrevoked device registration.
- Returns `200` with `{ "policy": {...} }` containing the child's active policy and current version integer.
- Uses `Cache-Control: no-store`.

### `POST /devices/policy/ack`

Device endpoint authenticated by bearer token via `Authorization: Bearer <deviceCredential>`.
- Request body: `{ "acknowledgedVersion": 2 }` (positive integer).
- Updates the enrolled device's `acknowledgedPolicyVersion` and sets `lastPolicyAckAt` to the current timestamp.
- Returns `200` with `{ "ok": true }`.
- Revoked devices return `401`.

## Screen time reporting

### `POST /devices/screen-time`

Device endpoint authenticated by bearer token via `Authorization: Bearer <deviceCredential>`.
- Rate limited via `rateLimitConfig.screenTime` (default 60 requests per 15 minutes per IP).
- Request body:
  ```json
  {
    "date": "YYYY-MM-DD",
    "totalScreenTimeSeconds": 3600,
    "reportingPeriod": {
      "start": "2026-10-16T08:00:00.000Z",
      "end": "2026-10-16T17:00:00.000Z"
    },
    "permissionGranted": true,
    "source": "measured",
    "appUsage": [
      {
        "packageName": "org.wikipedia",
        "appName": "Wikipedia",
        "durationSeconds": 1200
      }
    ]
  }
  ```
- **Zero Fabrication Rule**: If `permissionGranted` is `false`, `totalScreenTimeSeconds` MUST be `null`. Non-null values when permission is denied are rejected with `400`.
- Upserts the daily usage record for the device and associated child profile. Returns `201` with `{ "screenTime": {...} }`.

### `GET /children/:childId/screen-time`

Requires authenticated parent session cookie. Query parameter: `?date=YYYY-MM-DD`. Scoped to the parent's family. Returns `200` with daily screen-time metrics and app usage records, or `{ "screenTime": null }` if no records exist for that date.

### `GET /children/:childId/screen-time/history`

Requires authenticated parent session cookie. Query parameters: `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`. Scoped to the parent's family. Returns `200` with `{ "history": [...] }` containing daily summaries.

## Other behavior

Responses include an `X-Request-Id` header. Unknown routes return a JSON 404. Unhandled server errors return a generic JSON 500 without leaking stack traces or internal implementation details.

## Planned, not implemented

Email verification, password recovery, multi-factor authentication, multiple caregivers, remote policy push for Android (which maintains independent local filtering in Stage 8), universal Android browser blocking without device-owner/MDM enrollment, and live multi-process Atlas stress testing remain future work. Website policy synchronization and DNR enforcement are fully implemented for Chrome extension clients. Do not treat this document as evidence that unsupported platform capabilities exist.

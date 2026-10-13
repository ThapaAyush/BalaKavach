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

Email is trimmed, validated, and lowercased. Passwords must contain 12–128 characters and cannot be all whitespace. Registration returns the same generic `202` response for a new or already registered address, so this endpoint does not reveal whether an account exists. It does not return a parent ID or automatically sign in.

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

## Other behavior

Responses include an `X-Request-Id` header. Unknown routes return a JSON 404. Unhandled server errors return a generic JSON 500.

## Planned, not implemented

Email verification, password recovery, multiple caregivers, devices, pairing codes, website and screen-time rules, usage, blocked events, and policy acknowledgements are deferred to later stages. Do not treat this document as evidence that those endpoints exist.

# API status

Base path: `/api/v1`

## Implemented

### `GET /health`

Returns an API liveness response and whether Mongoose is connected. A disconnected database is reported as `degraded` / `disconnected`; this endpoint does not expose credentials or connection strings.

Example:

```json
{
  "ok": true,
  "data": {
    "service": "kidsguard-api",
    "status": "degraded",
    "dependencies": { "mongodb": "disconnected" },
    "timestamp": "2026-10-13T00:00:00.000Z"
  }
}
```

Responses include an `X-Request-Id` header. Unknown routes return a JSON 404. Unhandled server errors return a generic JSON 500.

## Planned, not implemented

Authentication, family and child resources, devices, linking codes, website and screen-time rules, usage, blocked events, and policy acknowledgements are deferred to later stages. Do not treat this document as evidence that those endpoints exist.

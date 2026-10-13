# Security status

## Implemented in Stage 1

- Helmet security headers and disabled Express identification header.
- CORS restricted to the configured `CLIENT_ORIGIN`.
- A 32 KB JSON request-body limit and API rate limit.
- Generated request IDs, safe response errors, and request logging that omits headers and bodies.
- MongoDB configuration is backend-only; `.env` files are ignored by Git and examples use placeholders.

## Not implemented yet

There are no accounts, sessions, CSRF flows, child records, device credentials, or authorization rules in this foundation. Do not expose it as a production parental-control service until authentication, family-level authorization, validation, audit logging, privacy/retention controls, and security review are implemented.

KidsGuard is not intended to collect keystrokes, messages, passwords, screenshots, camera data, or microphone audio. Future activity collection must be necessary, disclosed, authorized, and documented.

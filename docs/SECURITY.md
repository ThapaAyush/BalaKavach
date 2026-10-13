# Security status

## Implemented in Stage 2

- Helmet security headers and disabled Express identification header.
- Credentialed CORS restricted to the configured `CLIENT_ORIGIN`; authentication mutations require an exact matching `Origin`.
- A 32 KB JSON request-body limit and API rate limit.
- Generated request IDs, safe response errors, and request logging that omits headers and bodies.
- Parent emails are trimmed, validated, and lowercased; database uniqueness is enforced by a unique index and registration returns the same response for new and duplicate addresses.
- Parent passwords are validated and hashed with Argon2id; password hashes are excluded from normal database reads and API responses.
- Login failures use the same response for unknown emails and incorrect passwords. Authentication attempts are rate limited.
- Sessions use random opaque tokens in HttpOnly, SameSite=Strict cookies. Only SHA-256 token hashes are stored in MongoDB; sessions expire and logout deletes the stored session immediately.
- Production session cookies use `Secure` and the `__Host-` prefix. The frontend never stores session tokens in browser storage.
- Authentication responses disable caching with `Cache-Control: no-store`.
- MongoDB configuration is backend-only; `.env` files are ignored by Git and examples contain placeholders only.

## Remaining security work

Email verification, password recovery, multi-factor authentication, family-level authorization, child records, device credentials, audit logging, privacy/retention controls, and production security review remain unimplemented. The live Atlas session and index behavior has not been verified. Do not expose this as a production parental-control service until these areas and deployment controls are complete.

KidsGuard is not intended to collect keystrokes, messages, passwords, screenshots, camera data, or microphone audio. Future activity collection must be necessary, disclosed, authorized, and documented.

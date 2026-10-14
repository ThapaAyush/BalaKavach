# Security status

## Implemented in Stages 1–5

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
- Each Family has one unique, immutable parent owner; child profiles have an immutable family reference. Child CRUD derives the family from the authenticated session and scopes every lookup and mutation to it. Cross-family and nonexistent child IDs share the same `404` response.
- Child-profile mutations require an exact configured `Origin`; profile bodies reject unrecognized ownership fields. Child responses omit parent/family IDs and disable caching.
- Family/child operations fail closed when MongoDB or the required indexes are unavailable. Expiry/TTL cleanup is not used for authorization decisions.
- Parent-issued pairing codes use 128 random bits, are stored only as SHA-256 hashes, expire after 10 minutes, and can be revoked before redemption. Redemption checks expiry and revocation directly and atomically sets `redeemedAt` so only one concurrent request can claim a code.
- Pairing-code issuance/revocation and device listing/revocation derive the family from the authenticated parent and constrain repository operations by family and child IDs. Redemption returns the same generic error for invalid, expired, revoked, or used codes.
- Device credentials use 256 random bits; only a SHA-256 hash is stored and the raw token is returned once in the successful pairing response, which uses `Cache-Control: no-store`. It is not returned by parent APIs or logged. Device authentication does not yet exist.
- Device records distinguish `pairedAt`, nullable `lastSeenAt`, revocation state, and `enforcementStatus: not_implemented`. Pairing does not claim monitoring or website/app blocking.
- Pairing code creation and redemption are rate limited to 10 requests per 15 minutes per IP in each API process. Counters reset on restart and are not shared across instances. The API does not enable Express proxy trust; deployments behind a reverse proxy must configure only trusted proxy hops before limits can use originating client IPs.
- MongoDB configuration is backend-only; `.env` files are ignored by Git and examples contain placeholders only.
- The Chrome MV3 extension uses `declarativeNetRequest` for blocking and `storage` for its local blocklist. It requests no site host permissions or page-content access. It has no backend URL, account/session access, pairing integration, or device credential handling.
- Domain input is normalized to lower-case ASCII (including IDN-to-punycode conversion) and rejects credentials, ports, paths, queries, fragments, IP addresses, wildcard entries, and unsupported schemes. The blocklist is capped at 100 unique domains and applies to `main_frame` HTTP(S) navigations for each domain and its subdomains. Allowlist precedence is not supported.
- Rule updates remove only the extension's reserved dynamic-rule ID range and use Chrome's atomic `updateDynamicRules` operation. A rejected update is reported as not applied and leaves the prior active rule set. Local Chrome enforcement was manually verified for domain and subdomain navigation blocking and unblocking in an unpacked developer-mode installation.

## Remaining security work

Email verification, password recovery, multi-factor authentication, multiple caregivers, device credential authentication/rotation, audit logging, privacy/retention controls, and production security review remain unimplemented. Device pairing credentials are only enrolled and stored hashed; no device API currently authenticates them or checks `revokedAt`. A lost enrollment response after a committed insert can leave a registration without a delivered credential; parents must revoke it and pair again. Stage 4 Atlas indexes and atomic redemption have not been verified. Earlier auth/family/child indexes were ensured in Atlas, but live persistence remains unverified. Production HTTPS behavior and client secure storage of the one-time credential remain unverified. Do not expose this as a production parental-control service until these areas and deployment controls are complete.

The extension's local rules are not protected from a user who can disable or remove the extension or change its settings. It does not authenticate devices, contact the API, receive server-authorized policy, or provide tamper resistance. Chrome profile behavior, the actual block-page experience, Chrome Web Store packaging/review, managed-browser policy, and enforcement in alternate browsers/apps have not been verified.

KidsGuard is not intended to collect keystrokes, messages, passwords, screenshots, camera data, or microphone audio. Future activity collection must be necessary, disclosed, authorized, and documented.

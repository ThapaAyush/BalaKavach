# Database status

The API uses Mongoose and reads the MongoDB connection string from `apps/api/.env` as `MONGODB_URI`. The example file contains placeholders only. Keep the real connection string on the backend and never put it in a `VITE_` variable.

The API stores parent accounts in the `parents` collection. Emails are trimmed, lowercased, and protected by a unique index. Passwords are stored only as Argon2id hashes. Parent sessions are stored in the `parentsessions` collection; only SHA-256 hashes of random session tokens are stored. Sessions have an expiry timestamp and a TTL index, while every request also checks expiry directly. Startup creates the required indexes before enabling authentication; if the database or indexes are unavailable, authentication fails closed with a service-unavailable response.

The API can still start without a connection string so the health endpoint and frontend shell can run locally. In that case health reports MongoDB as disconnected and authentication is unavailable. When a URI is configured, startup attempts a TLS-capable MongoDB connection. If it cannot connect, the API logs a generic warning and starts in degraded mode. Live Atlas persistence has not been verified as part of this Stage 2 work; automated auth tests use an in-memory repository.

Each parent has at most one `families` document, with a unique immutable `ownerParentId` reference to `parents._id`. The family document is created on the first child-profile creation. `childprofiles` documents reference that family through an immutable `familyId` and store a required `displayName` plus an optional date-only `dateOfBirth`. A unique owner index enforces one family per parent; a `{ familyId, createdAt, _id }` index supports scoped listing. No TTL cleanup is used for family or child authorization.

Child-profile queries always use the family found from the authenticated parent session. The API does not accept a family ID or parent ID as an ownership input. Child profiles and family documents are not returned with their ownership fields. Startup creates the required family/child indexes before enabling these operations; database outages or missing indexes fail closed with a generic `503`.

The family and child test suite uses an isolated in-memory repository and also checks fail-closed behavior without MongoDB. Live Atlas writes, index creation, and family/child persistence have not been verified. Existing Atlas data is not dropped or reset by this implementation. Device, rule, and activity collections have not been created.

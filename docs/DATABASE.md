# Database status

The API uses Mongoose and reads the MongoDB connection string from `apps/api/.env` as `MONGODB_URI`. The example file contains placeholders only. Keep the real connection string on the backend and never put it in a `VITE_` variable.

At Stage 1, the API can start without a connection string so the liveness endpoint and frontend foundation can run locally. In that case health reports MongoDB as disconnected, and database-backed features are unavailable. When a URI is configured, startup attempts a TLS-capable MongoDB connection. If it cannot connect, the API logs a generic warning and starts in degraded mode; the health endpoint reports the database as disconnected.

No models, collections, migrations, or indexes have been created. The planned collections and data-retention decisions belong to the authentication and database stages. Existing Atlas data will not be dropped or reset.

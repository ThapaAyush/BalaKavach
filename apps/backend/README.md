# KidsGuard Backend API

Express 5 REST API powering the KidsGuard parental control service. Supports parent authentication, family child profile management, child device pairing, dynamic domain filtering policy synchronization, and screen-time telemetry ingestion.

---

## 1. Local Development

### Prerequisites
- Node.js `>=24 <25` (pinned to 24 via `.nvmrc` and package engines)
- npm `>=11`

### Setup
```powershell
# From repository root
npm install
Copy-Item apps/backend/.env.example apps/backend/.env
```

### Running
```powershell
# Development with watch mode
npm run dev --workspace @kidsguard/backend
# Or from repo root
npm run dev:api

# Run test suite
npm run test --workspace @kidsguard/backend
```

The local API listens at `http://localhost:5000`. Check `http://localhost:5000/api/v1/health` for service liveness and database status.

---

## 2. Production Deployment on Render

### Render Web Service Settings
| Setting | Recommended Value | Notes |
| :--- | :--- | :--- |
| **Environment** | `Node` | Ensure Node 24 is used |
| **Root Directory** | `apps/backend` | Focuses build on the backend module |
| **Build Command** | `npm install` | Installs production dependencies |
| **Start Command** | `node src/server.js` | Binds to `0.0.0.0:$PORT` |
| **Health Check Path** | `/api/v1/health` | **Mandatory**: Render default `/` returns 404 |
| **Auto-Deploy** | Manual or on commit | Deploy upon approved changes |

### Environment Variables on Render
Configure these in the Render Dashboard (**Environment** tab):

| Variable Name | Required | Example / Guidance |
| :--- | :--- | :--- |
| `NODE_VERSION` | Yes | `24` (forces Render to use Node.js 24) |
| `NODE_ENV` | Yes | `production` (enforces HTTPS secure cookies and __Host- prefix) |
| `MONGODB_URI` | Yes | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority` |
| `CLIENT_ORIGIN` | Yes | `https://<your-frontend-domain>` (exact URL of deployed web dashboard, no trailing slash) |
| `AUTH_SESSION_TTL_HOURS` | Optional | `168` (defaults to 168 hours / 7 days) |
| `TRUST_PROXY` | Optional | `1` (defaults to 1 in production; accurately tracks client IPs behind Render's proxy) |
| `SESSION_COOKIE_SAME_SITE` | Optional | `strict` (default; keep `strict` with same-site custom domain hosting) |

> **Security Note:** Never commit actual `MONGODB_URI` or secret credentials to Git. Configure secrets directly in the Render dashboard or via secret manager.

---

## 3. MongoDB Atlas Configuration

1. **Cluster:** Create an M0 (Free Tier) or dedicated cluster.
2. **Database User:** Create a user with `readWrite` privileges on your target database.
3. **Network Access (IP Access List):**
   - Add `0.0.0.0/0` (**Allow access from anywhere**).
   - *Reason:* Render uses dynamic outbound IP pools for Web Services; static IPs are not available on standard tiers.
4. **Connection String:**
   - Use the standard SRV URI format.
   - Ensure special characters in username or password are URL-encoded.
   - Appending `?retryWrites=true&w=majority` is recommended.

---

## 4. Session Security & Hosting Architecture

KidsGuard enforces high session security for parent authentication:
- In production (`NODE_ENV=production`), session cookies use:
  - Cookie name: `__Host-kidsguard_session` (RFC 6265bis prefix: host-bound, path `/`, no sub-domain leakage)
  - Flags: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`
  - Token hashes: Stored as SHA-256 in MongoDB with automated TTL expiration

### Hosting Architecture Recommendation:
Because `SameSite=Strict` cookies are only sent on same-site requests:
- **Recommended:** Serve both the parent web dashboard and the API from the same site (e.g. `https://app.example.com` and `https://api.example.com`, which share the same registered domain `example.com`), or place both behind a reverse proxy routing `/api/*` to the backend.
- If deployed across distinct Public Suffix domains (e.g. `frontend.onrender.com` and `api.onrender.com`), cross-site cookies are blocked by modern browsers under `SameSite=Strict`. To support cross-site configurations, `SESSION_COOKIE_SAME_SITE=none` can be explicitly configured, but same-site custom domain hosting is strongly recommended to preserve the highest security posture.

---

## 5. Health Check Endpoint

- **Endpoint:** `GET /api/v1/health`
- **Behavior:**
  - Returns HTTP 200 with JSON:
    ```json
    {
      "ok": true,
      "data": {
        "service": "kidsguard-api",
        "status": "ready",
        "dependencies": {
          "mongodb": "connected"
        },
        "timestamp": "2026-10-16T15:30:00.000Z"
      }
    }
    ```
  - When MongoDB is disconnected or unconfigured, returns HTTP 200 with `status: "degraded"` and `dependencies.mongodb: "disconnected"`.
  - Unknown routes (e.g. root `/` or `/health`) return HTTP 404 (`Route not found`). Render's Health Check Path must point specifically to `/api/v1/health`.

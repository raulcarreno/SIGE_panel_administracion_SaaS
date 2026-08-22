# Architecture layers

| Layer | Role | Must not |
|-------|------|----------|
| `src/` | UI, fetch `/api/*` | Direct SQL, secrets in bundle |
| `server/routes/` | HTTP adapter | Heavy business logic |
| `api/_lib/` | Domain, repos, Control API client | Import React |
| `scripts/db/migrations/` | Panel registry schema | Connect to tenant DBs |

Flow: Browser → `httpServer.js` → `apiRouter.js` → handler → `api/_lib` → PostgreSQL (registry) + HTTP to tenant pods.

Tenant pods expose `/api/control/*` with `CONTROL_API_TOKEN`. The panel stores encrypted tokens and proxies operations.

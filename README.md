# SIGE Panel Administración SaaS

Panel central de superadmin para orquestar tenants del monolito SIGE vía Control API (`/api/control/*`).

## Stack

- Node 22 ESM + React 19 + Vite 8 + PostgreSQL
- Skills Cursor: `.cursor/skills/sige-superadmin-panel/`

## Quick start

```bash
cp .env.example .env
# Edit DATABASE_URL, PANEL_SECRETS_KEY, SUPERADMIN_JWT_SECRET, GOOGLE_CLIENT_ID, SUPERADMIN_ALLOWED_EMAILS

docker compose up -d postgres
npm install
npm run db:migrate
npm run dev:full
```

- UI: http://localhost:5173/superadmin
- API: http://localhost:3001

## Production

```bash
docker compose up --build
```

Panel serves built SPA + API on port 3001.

## Docs

- [Tenant lifecycle](docs/tenant-lifecycle.md)
- [Panel API OpenAPI](docs/panel-api.openapi.yaml)
- [Control API reference](docs/control-api.openapi.yaml)

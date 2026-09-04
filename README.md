# SIGE Panel Administración SaaS

Panel central de superadmin para orquestar tenants del monolito SIGE vía Control API (`/api/control/*`).

## Stack

- Node 22 ESM + React 19 + Vite 8 + PostgreSQL
- Skills Cursor: `.cursor/skills/sige-superadmin-panel/`

## Quick start

```bash
cp .env.example .env
# Edit DATABASE_URL, PANEL_SECRETS_KEY, SUPERADMIN_JWT_SECRET, SUPERADMIN_ALLOWED_EMAILS

docker compose up -d postgres
npm install
npm run db:migrate
npm run google:oauth:setup   # pega el Client ID Web de sige-saas
npm run dev:full
```

- UI: http://localhost:5173/superadmin
- API: http://localhost:3002

## Google OAuth

Mismo patrón que carpinteria:

1. En GCP proyecto **`sige-saas`**, crea un OAuth client tipo **Web application**.
2. Añade los Authorized JavaScript origins (localhost + dominios findspo).
3. `npm run google:oauth:setup` escribe `GOOGLE_CLIENT_ID` y `VITE_GOOGLE_CLIENT_ID` en `.env`.

## Production

```bash
docker compose up --build
```

Panel serves built SPA + API on port 3001.

## Docs

- [Tenant lifecycle](docs/tenant-lifecycle.md)
- [Panel API OpenAPI](docs/panel-api.openapi.yaml)
- [Control API reference](docs/control-api.openapi.yaml)

## Produccion

Runtime: Hetzner `sige-prod` (`RUNTIME_TARGET=hetzner`). Rollback GKE: `RUNTIME_TARGET=gke`.

Ver `SIGE_monolito/docs/hetzner-production.md`.

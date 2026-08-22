# Tech stack (normative)

- **Runtime**: Node 22 ESM, JavaScript (no TS runtime)
- **Front**: React 19, React Router 7, Vite 8, react-i18next, plain CSS, oxlint
- **HTTP**: `node:http` only (no Express)
- **DB**: PostgreSQL via `pg`, SQL migrations in `scripts/db/migrations/`
- **Auth**: Google OAuth idToken + JWT (`jose`, `google-auth-library`)
- **Deploy**: Docker + docker-compose
- **Tests**: `node --test` + assert
- **Forbidden**: Vercel, Turso/libsql, ORMs, SQLite in production

Bootstrap env only: `DATABASE_URL`, `PANEL_SECRETS_KEY`, `SUPERADMIN_JWT_SECRET`, `GOOGLE_CLIENT_ID`, `SUPERADMIN_ALLOWED_EMAILS`, `PORT`, `NODE_ENV`.

Tenant operational config lives in each pod via Control API (`/api/control/settings`).

New dependencies require ADR in `docs/specs/adr/`.

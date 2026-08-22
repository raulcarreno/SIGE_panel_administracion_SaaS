# Quality gates

Before merging or deploying:

1. `npm run lint` — oxlint, zero errors
2. `npm test` — all tests pass
3. `npm run build` — Vite build succeeds
4. `docker compose build` — image builds (optional local check)

Forbidden in this repo:
- Vercel, Turso/libsql, ORMs, SQLite in production
- Plain-text `CONTROL_API_TOKEN` in database or logs
- Direct SQL connections to tenant databases

Panel registry migrations: `npm run db:migrate`

Dev full stack: `npm run dev:full` (Vite + API server)

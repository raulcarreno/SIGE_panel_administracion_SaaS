# TDD workflow

1. **Red** — Write a failing test in `tests/unit/` or `tests/integration/`
2. **Green** — Minimal implementation in `api/_lib/` or `server/routes/`
3. **Refactor** — Keep handlers thin; domain in `api/_lib/`

Run: `npm test` (`node --test tests/**/*.test.js`)

Priority test targets:
- `controlApiClient.js` — HTTP mock, auth header, error mapping
- `secretsCrypto.js` — encrypt/decrypt round-trip
- `tenantsRepository.js` — CRUD registry
- `tenantSync.js` — snapshot update

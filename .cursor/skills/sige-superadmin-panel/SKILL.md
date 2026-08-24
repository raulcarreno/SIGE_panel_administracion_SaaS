---
name: sige-superadmin-panel
description: Guides development of the SIGE superadmin SaaS panel that orchestrates tenant pods via Control API, central PostgreSQL registry, SDD and TDD. Use when working on this repo, adding tenant operations, API routes, UI, migrations, or Docker.
---

# SIGE superadmin panel

Read before any code change:

1. [tech-stack.md](tech-stack.md) — allowed/prohibited stack
2. [folder-tree.md](folder-tree.md) — canonical directory layout
3. [sdd-workflow.md](sdd-workflow.md) — spec before code
4. [tdd-workflow.md](tdd-workflow.md) — tests before implementation

## Non-negotiable rules

- A **tenant** is the minimum SIGE block: **ERP (billing CRM)** + **Web CMS** (shared platform config). Registry fields: `base_url` + `web_base_url`
- SDD then TDD then minimal implementation
- Never store `CONTROL_API_TOKEN` in plain text — encrypt with `PANEL_SECRETS_KEY` (AES-GCM)
- All pod mutations go through `controlApiClient.js` against the monolith Control API
- The panel never connects SQL to tenant databases; only the pod Control API
- Business logic in `api/_lib/`, thin handlers in `server/routes/`
- Migrations run on panel startup via `scripts/db/migrate.mjs` (panel registry only)
- Variable/file names in English; UI strings via i18n (Spanish default)

## Workflow

1. Update spec (`docs/panel-api.openapi.yaml` or Control API contract reference)
2. Write failing test
3. Implement
4. `npm run lint && npm test && npm run build`
5. Update docs if contract changed

## Related

- [architecture-layers.md](architecture-layers.md)
- [tenant-operations.md](tenant-operations.md)
- [quality-gates.md](quality-gates.md)

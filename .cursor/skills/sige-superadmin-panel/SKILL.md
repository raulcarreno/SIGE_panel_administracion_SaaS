---
name: sige-superadmin-panel
description: Guides development of the SIGE superadmin SaaS panel that orchestrates tenant pods via Control API, central PostgreSQL registry, SDD and TDD. Local-first: no promote/deploy to production unless the user explicitly asks. Use when working on this repo, adding tenant operations, API routes, UI, migrations, or Docker.
---

# SIGE superadmin panel

Read before any code change:

1. [tech-stack.md](tech-stack.md) — allowed/prohibited stack
2. [folder-tree.md](folder-tree.md) — canonical directory layout
3. [sdd-workflow.md](sdd-workflow.md) — spec before code
4. [tdd-workflow.md](tdd-workflow.md) — tests before implementation

## Deployment policy (local-first)

**Default:** accumulate changes locally. Do **not** publish to production until the user explicitly requests deployment (e.g. "despliega", "deploy to production").

**Never without explicit user request:**

- `git push` to any remote or branch
- `node scripts/tenant-deploy.mjs promote|deploy`
- Superadmin versioning API: `POST /api/superadmin/tenants/:id/versioning/promote`, `POST .../versioning/deploy`
- Docker image build+push to Artifact Registry or any remote registry
- `kubectl apply`, GKE rollouts, Docker Compose production rollouts on `sige-prod`, or production cluster/VM manifest changes
- Control API mutations on **production** tenant pods via `controlApiClient.js` (migrations run, maintenance, config/settings PUT)

**Allowed locally (no deploy):** edit code/specs, `npm run lint && npm test && npm run build`, local `docker compose build|up`, read-only tenant status/sync, dry-runs.

When the user asks to deploy, follow [tenant-operations.md](tenant-operations.md) and `docs/tenant-versioning.md`; confirm tenant, component (`erp`/`web`/`both`), and image tag before executing.

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

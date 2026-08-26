# Tenant operations via Control API

**Local-first:** the table below describes production operations. Do not call promote/deploy endpoints, `tenant-deploy.mjs`, or mutating Control API routes on live tenants until the user explicitly asks to deploy.

A **tenant** is the minimum SIGE block: **ERP (billing CRM)** + **Web CMS**, sharing platform config.
The panel stores `base_url` (ERP, Control API target) and `web_base_url` (Web CMS of the same tenant).

All remote operations use `controlApiClient.js` with tenant `base_url` and decrypted token.
Mutations that change fields reflected in `/api/control/status` (config, settings, migrations, maintenance)
**must** call `syncTenantSnapshot` afterward so list/detail UI does not keep a stale snapshot.

| Panel action | Control API | Notes |
|--------------|-------------|-------|
| Sync status | `GET /api/control/status` | Updates `tenant_snapshots` |
| Get/update config | `GET/PUT /api/control/config` | Modules, validity, suspension, presets |
| Get/update settings | `GET/PUT /api/control/settings` | siteUrl, integrations, secrets |
| List migrations | `GET /api/control/migrations` | Applied/pending |
| Run migrations | `POST /api/control/migrations/run` | Confirm in UI |
| Maintenance toggle | `POST /api/control/maintenance` | `{ enabled: boolean }` |

Module presets from monolith: `starter_cms`, `full_cms_ai`, `billing_basic`, `billing_full`, `ai_cms`.

Non-togglable modules (always on): `admin_panel`, `public_site_shell`, `health`.

Validity logic mirrors monolith `isTenantActive()`: suspended, before validFrom, after validUntil.

Every mutation writes to `audit_log` with actor email and payload summary.

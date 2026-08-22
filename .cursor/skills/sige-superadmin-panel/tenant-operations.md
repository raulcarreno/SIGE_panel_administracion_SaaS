# Tenant operations via Control API

All remote operations use `controlApiClient.js` with tenant `base_url` and decrypted token.

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

# Tenant lifecycle (operator flow)

This panel orchestrates **tenants**, not isolated pods. A SIGE tenant is the minimum block:

1. **ERP / CRM de facturación** (`SIGE_monolito`) — Control API, clients, quotes, invoices
2. **Web CMS** (`SIGE_monolito_web`) — public site + content admin

Both pods share the platform config database (`CONFIG_DATABASE_URL` / `sige_config`). The panel registers **one** tenant row with:

| Field | Meaning |
|-------|---------|
| `baseUrl` | ERP pod URL (Control API target) |
| `webBaseUrl` | Web CMS pod URL (same tenant) |
| `controlToken` | ERP `CONTROL_API_TOKEN` |

## 1. Deploy tenant infrastructure (outside panel)

1. Create databases (`sige_<slug>_erp`, `sige_<slug>_content`, shared `sige_<slug>_config` or naming convention).
2. Deploy **both** pods + Ingress + DNS.
3. Set shared config URL and control token on both pods.

See `SIGE_monolito` / `SIGE_monolito_web` deploy docs and `docs/superadmin-integration.md`.

## 2. Register tenant in panel

1. Open `/superadmin/tenants/new`.
2. Fill identity + **bloque mínimo** (ERP URL + Web CMS URL + Control token).
3. Save — both URLs are required.

## 3. Bootstrap tenant via panel

From tenant detail:

1. **Composición** — open ERP admin / Web site / CMS admin.
2. **Migraciones** — run pending migrations on the ERP Control API.
3. **Módulos** — apply presets (billing + CMS modules live in shared config).
4. **Configuración** — `siteUrl`, integrations, secrets.
5. **Sincronizar** — pull status snapshot from the ERP pod.

## 4. Ongoing operations

- **Versionado** — ramas `main` / `<slug>`, promote desde main, deploy de imagen (`docs/tenant-versioning.md`).
- **Validez** — `validFrom`, `validUntil`, suspension (shared tenant config).
- **Mantenimiento** — toggle on the ERP Control API (affects shared config).
- **Sync all** — refresh dashboard metrics.

## 5. Client access

- ERP admin: `https://erp.<slug>.example.com/admin`
- Web public: `https://www.<slug>.example.com`
- CMS admin: `https://www.<slug>.example.com/admin`

## References

- Monolith Control API: `docs/control-api.openapi.yaml`
- Panel API: `docs/panel-api.openapi.yaml`

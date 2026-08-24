# Tenant lifecycle (operator flow)

This panel orchestrates **tenants**, not isolated pods. A SIGE tenant is the minimum block:

1. **ERP / CRM de facturación** (`SIGE_monolito`) — Control API, clients, quotes, invoices
2. **Web CMS** (`SIGE_monolito_web`) — public site + content admin

Both pods share the platform config database (`CONFIG_DATABASE_URL` / `sige_config`). The panel registers **one** tenant row with:

| Field | Meaning |
|-------|---------|
| `baseUrl` | ERP pod URL (Control API target); derived from `erp.<slug>.findspo.com` when provisioned |
| `webBaseUrl` | Web CMS pod URL (same tenant); derived from `www.<slug>.findspo.com` |
| `controlToken` | ERP `CONTROL_API_TOKEN` |
| `erpHost` / `webHost` | Canonical SaaS hostnames |
| `domainStatus` | `draft` → `provisioning` → `active` / `failed` |

## 1. Deploy shared platform (outside panel, once)

1. Create shared Postgres / platform pods (`sige-erp`, `sige-web`, `sige-panel`).
2. Apply platform Ingress + cert for panel host.

See `SIGE_monolito` / `SIGE_monolito_web` deploy docs and `docs/cutover-gke-platform.md`.

## 2. Register tenant + domains (Superadmin)

1. Open `/superadmin/tenants/new`.
2. Fill identity (`slug`, display name, Control token). Hosts preview as:
   - ERP: `erp.<slug>.findspo.com`
   - Web: `www.<slug>.findspo.com`
3. Optionally enable **Aplicar Ingress + certificado** (GKE).
4. Optionally add a custom web hostname (CNAME later).
5. Save — registry URLs are derived from SaaS hosts.

### Provision Ingress/cert (pestaña Dominios)

`POST /api/superadmin/tenants/:id/domains/provision` (or checkbox on create):

1. Applies per-tenant Ingress `sige-tenant-<slug>` + ManagedCertificate `sige-cert-<slug>`.
2. Sets `baseUrl` / `webBaseUrl` to the HTTPS SaaS URLs.
3. Returns **manual DNS instructions** (A records for IONOS). The panel does **not** write to IONOS.

### DNS manual (IONOS)

In zone `findspo.com`, create:

| Type | Name | Value |
|------|------|-------|
| A | `erp.<slug>` | Ingress IP |
| A | `www.<slug>` | Ingress IP |

Note: a zone wildcard `*.findspo.com` does **not** cover `erp.<slug>.findspo.com` (two labels).

### Custom domains

1. Add hostname in Dominios (`kind` erp|web).
2. Client creates **CNAME** `www.cliente.com` → `www.<slug>.findspo.com` (or A to Ingress IP).
3. **Verificar DNS** — panel checks DNS, then adds the host to Ingress + ManagedCertificate.

## 3. Bootstrap tenant via panel

From tenant detail:

1. **Composición** — open ERP admin / Web site / CMS admin.
2. **Migraciones** — run pending migrations on the ERP Control API.
3. **Módulos** — apply presets (billing + CMS modules live in shared config).
4. **Configuración** — `siteUrl`, integrations, secrets.
5. **Sincronizar** — pull status snapshot from the ERP pod.

## 4. Ongoing operations

- **Dominios** — re-apply Ingress/cert, copy A-record instructions, manage custom domains.
- **Versionado** — ramas `main` / `<slug>`, promote desde main, deploy de imagen (`docs/tenant-versioning.md`).
- **Validez** — `validFrom`, `validUntil`, suspension (shared tenant config).
- **Mantenimiento** — toggle on the ERP Control API (affects shared config).
- **Sync all** — refresh dashboard metrics.

## 5. Client access

- ERP admin: `https://erp.<slug>.findspo.com/admin`
- Web public: `https://www.<slug>.findspo.com`
- CMS admin: `https://www.<slug>.findspo.com/admin`
- Custom (after verify): `https://www.cliente.com`

## Env (panel)

| Variable | Purpose |
|----------|---------|
| `DNS_ZONE_NAME` | Zone label for instructions (default `findspo.com`) |
| `SAAS_BASE_DOMAIN` | Host suffix (default `findspo.com`) |
| `INGRESS_IP` | Optional override; else read from platform Ingress |
| `PLATFORM_ERP_SERVICE` / `PLATFORM_WEB_SERVICE` | Ingress backends (default `sige-erp` / `sige-web`) |

## References

- Monolith Control API: `docs/control-api.openapi.yaml`
- Panel API: `docs/panel-api.openapi.yaml`

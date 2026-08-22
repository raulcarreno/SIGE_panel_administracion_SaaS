# Tenant lifecycle (operator flow)

This panel orchestrates tenants that are already deployed as SIGE monolith pods. It does not provision Kubernetes, DNS, or tenant databases.

## 1. Deploy tenant infrastructure (outside panel)

1. Create PostgreSQL database `sige_<slug>` on shared Postgres.
2. Deploy pod + Ingress + DNS (`https://<slug>.example.com`).
3. Set pod env: `DATABASE_URL`, `CONTROL_API_TOKEN`, `SETTINGS_ENCRYPTION_KEY`, `TENANT_SLUG`.

See [SIGE_monolito deploy templates](https://github.com/raulcarreno/SIGE_monolito) and `docs/superadmin-integration.md`.

## 2. Register tenant in panel

1. Open `/superadmin/tenants/new`.
2. Enter slug, base URL, Control API token, optional database name.
3. Save.

## 3. Bootstrap tenant via panel

From tenant detail:

1. **Migraciones** — run pending migrations on the pod.
2. **Módulos** — apply preset or toggle modules.
3. **Configuración** — set `siteUrl`, integrations, secrets.
4. **Sincronizar** — pull status into panel snapshot.

## 4. Ongoing operations

- **Validez** — set `validFrom`, `validUntil`, suspension.
- **Mantenimiento** — toggle maintenance mode on the pod.
- **Sync all** — refresh dashboard metrics from all tenants.

## 5. Client access

Client admin: `https://<slug>.example.com/admin` (Google OAuth configured in pod settings).

## References

- Monolith Control API: `docs/control-api.openapi.yaml`
- Panel API: `docs/panel-api.openapi.yaml`

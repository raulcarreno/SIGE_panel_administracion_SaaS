# Cutover GKE: monolito unificado → ERP + Web + Panel

Runbook para `kbnt-prd-1` / `sige-saas-prod` / `sige-saas.findspo.com`.

## 0. Prerrequisitos

- `gcloud` autenticado en `findspo-core`
- Acceso al cluster: `gcloud container clusters get-credentials kbnt-prd-1 --region=europe-southwest1`
- Token GitHub (`repo` scope) para promote
- Workspace local con los tres repos

## 1. Backup del pod actual

```bash
NS=sige-saas-prod
POD=$(kubectl get pods -n "$NS" -l app=sige-app -o jsonpath='{.items[0].metadata.name}')
# Si el deployment ya se renombró, usar app=sige-erp

kubectl exec -n "$NS" deploy/postgres -- \
  pg_dumpall -U sige > "backup-sige-$(date +%Y%m%d).sql"
```

Guarda también `deploy/gcp-gke/.secrets.env` actual.

## 2. Ramas tenant

```bash
# ERP
cd SIGE_monolito
git fetch origin
git checkout main && git pull
git checkout -B sige-saas
git push -u origin sige-saas

# Web
cd ../SIGE_monolito_web
git fetch origin
git checkout main && git pull
git checkout -B sige-saas
git push -u origin sige-saas
```

## 3. Deploy plataforma (3 servicios)

```bash
export GITHUB_TOKEN=ghp_xxx
export APP_VERSION=0.2.0
cd SIGE_monolito
./deploy/gcp-gke/deploy-platform.sh
```

Esto crea/actualiza `sige-erp`, `sige-web`, `sige-panel`, Postgres multi-DB e Ingress multi-host.

## 4. DNS / TLS / OAuth

### Plataforma (panel + demo legacy)

A records (misma Ingress IP):

- `sige-saas.findspo.com` → ERP (legado / demo)
- `www.sige-saas.findspo.com` → Web
- `panel.sige-saas.findspo.com` → Panel

Espera certificado managed `sige-platform-cert` → Active.

OAuth: añade origins/redirects para los tres hosts (ERP admin, Web admin, Panel).

### Tenants nuevos (desde Superadmin)

Esquema canónico: `erp.<slug>.findspo.com` + `www.<slug>.findspo.com`.

La pestaña **Dominios** (o el checkbox al crear) aplica:

1. Ingress `sige-tenant-<slug>` + ManagedCertificate `sige-cert-<slug>`
2. Instrucciones de registros **A** para crear a mano en IONOS (misma IP Ingress)

Dominios custom: CNAME del cliente → host SaaS, luego **Verificar DNS** en el panel.

Ver `docs/tenant-lifecycle.md`.

## 5. Migraciones y bootstrap

```bash
source SIGE_monolito/deploy/gcp-gke/.secrets.env

# ERP migrations
curl -sS -X POST "https://sige-saas.findspo.com/api/control/migrations/run" \
  -H "Authorization: Bearer $CONTROL_API_TOKEN"

# Panel migrations corren al arrancar el pod (001–004)
```

## 6. Registrar tenant en el panel

1. Abre `https://panel.sige-saas.findspo.com`
2. Login superadmin
3. Nuevo tenant: slug + Control token; preview de `erp.<slug>.findspo.com` / `www.<slug>.findspo.com`
4. Activa aplicación de Ingress/cert (DNS A en IONOS sigue siendo manual; copia la tabla en Dominios)
5. En **Dominios**, confirma status `active`, crea los A en IONOS y añade custom domains si aplica
6. Sync + migraciones + módulos

Para el tenant demo legado `sige-saas`, puedes seguir registrando URLs absolutas legacy (`https://sige-saas.findspo.com`) pasando `baseUrl` / `webBaseUrl` en el POST, o provisionar el esquema `erp.` / `www.` canónico.

## 7. Probar versionado

En el tenant → **Versionado**:

1. Actualizar estado (debe verse rama `sige-saas`)
2. Promover main → ERP (dry/real)
3. Desplegar rama ERP (requiere `gcloud`/`kubectl` desde el entorno del panel o CLI)

CLI equivalente:

```bash
cd SIGE_panel_administracion_SaaS
node scripts/tenant-deploy.mjs promote <tenantUuid> erp
node scripts/tenant-deploy.mjs deploy <tenantUuid> erp
```

## 8. Smoke

```bash
curl -fsS https://sige-saas.findspo.com/api/health/ready
curl -fsS https://www.sige-saas.findspo.com/api/health/ready
curl -fsS https://panel.sige-saas.findspo.com/api/health
```

Login admin ERP, CMS y panel.

## 9. Retirar deployment legacy (opcional)

Cuando ERP/Web estén estables:

```bash
kubectl delete deployment sige-app -n sige-saas-prod --ignore-not-found
kubectl delete service sige-app -n sige-saas-prod --ignore-not-found
kubectl delete ingress sige-app -n sige-saas-prod --ignore-not-found
```

## Rollback

1. Re-aplicar imagen anterior: `kubectl set image deployment/sige-erp ...`
2. Restaurar SQL desde el dump del paso 1 si hace falta.

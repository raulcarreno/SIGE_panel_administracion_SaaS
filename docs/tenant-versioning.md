# Tenant versioning (Superadmin)

## Modelo

| Ref | Significado |
|-----|-------------|
| `main` | Código base del producto |
| `<tenantSlug>` | Puntero de deploy + (solo Web) presentación del cliente |

SemVer (`vX.Y.Z`) sigue siendo la release de producto en `main`. El deploy de un tenant usa imagen `<slug>-<shortsha>` (nunca `latest`).

### Ownership de código (ADR 001)

| Repo | Divergencia en git | Canal de variación visual |
|------|--------------------|---------------------------|
| **ERP** (`SIGE_monolito`) | Ninguna — `git diff main...HEAD` vacío | `style_templates` en config DB compartida |
| **Web** (`SIGE_monolito_web`) | Solo paths de presentación | CSS/componentes/páginas públicas + `style_templates` |

Regla: el backend define funcionalidad; el front solo cómo se muestra. Un tenant no añade endpoints ni cambia contratos API.

#### ERP — paths

Todo el árbol es de `main`. La rama `<slug>` no acepta commits de producto ni de estilos en git.

#### Web — paths compartidos (`main` only)

`server/**`, `api/**`, `scripts/**`, `tests/**`, `docs/**`, `deploy/**`, `Dockerfile`, `docker-compose.yml`, root build/config, `src/hooks/**`, `src/lib/**`, `src/context/**`, `src/admin/**`, `src/i18n/**`, `src/main.jsx`, `src/App.jsx`, `src/config/site.js`, `src/config/maintenance.js`, `src/config/siteStatic.js`.

#### Web — paths de presentación (permitidos en `<slug>`)

`src/styles/**`, `src/components/**`, `src/routes/**`, `public/**`, `src/config/stockImages.js`.

CI `tenant-path-guard` en cada monolito bloquea diffs fuera de esta política. Fuente de verdad Web: `SIGE_monolito_web/scripts/ci/tenant-presentation-allowlist.json`.

### Flujo promote sin conflictos

1. **ERP:** cambios solo en `main` → promote `main` → `<slug>` (fast-forward / sin diff de archivos) → deploy imagen tenant.
2. **Web:** cambios de producto/backend en `main` → promote; customización visual en commits sobre allowlist en `<slug>` → deploy.
3. Si el promote Web conflictúa, suele ser en archivos de presentación; resolver en GitHub y redeploy. El panel no fuerza merges conflictivos.

### Path guard en promote/deploy (sin GitHub Pro)

El worker del panel (`deployRunner`) llama a `assertTenantBranchPaths` **antes de cada deploy** y **después de cada promote**, comparando `main...<branch>` vía GitHub (lista de archivos, misma idea que `git diff --name-only`).

- ERP: falla si hay cualquier archivo distinto de `main`.
- Web: falla si algún archivo no está en la allowlist de presentación.
- CLI: `node scripts/tenant-deploy.mjs deploy|promote …` hereda el mismo guard.
- Check suelto: `node scripts/check-tenant-paths.mjs erp|web <branch>`
- Escape hatch de emergencia: `SKIP_TENANT_PATH_GUARD=1`

No hace falta branch protection de GitHub: el candado está en el pipeline de deploy de la VM/panel.

## API

- `GET /api/superadmin/tenants/:id/versioning`
- `POST /api/superadmin/tenants/:id/versioning/promote` `{ "component": "erp"|"web"|"both" }`
- `POST /api/superadmin/tenants/:id/versioning/deploy` `{ "component": "erp"|"web"|"both" }`
- `GET /api/superadmin/tenants/:id/versioning/jobs`

## Env del panel

```
GITHUB_TOKEN=
GITHUB_ERP_REPO=raulcarreno/SIGE_monolito
GITHUB_WEB_REPO=raulcarreno/SIGE_monolito_web
GCP_PROJECT_ID=findspo-core
GKE_CLUSTER=kbnt-prd-1
GKE_REGION=europe-southwest1
GKE_NAMESPACE=sige-saas-prod
ARTIFACT_REGISTRY=europe-southwest1-docker.pkg.dev/findspo-core/fraian-saas
SIGE_WORKSPACE_ROOT=/path/to/SIGE_workspace   # para build desde el worker
```

## CLI

```bash
node scripts/tenant-deploy.mjs promote <tenantId> erp
node scripts/tenant-deploy.mjs deploy <tenantId> both
```

## UI

Tenant detail → pestaña **Versionado**.

## Branch protection (GitHub)

Apply on both `raulcarreno/SIGE_monolito` and `raulcarreno/SIGE_monolito_web`.

**Availability:** classic branch protection and repository rulesets on **private** repos require GitHub Pro (or Team/Enterprise for orgs). Without that plan, the API returns HTTP 403. The workflow `.github/workflows/tenant-path-guard.yml` still **runs on every push** to tenant branches and fails the check in Actions; required-status enforcement must be enabled once the plan allows it.

### Checklist

#### `main`

- [ ] Require a pull request before merging
- [ ] Require at least 1 approving review
- [ ] Require CODEOWNERS review when applicable
- [ ] Disallow force pushes and branch deletion
- [ ] Require relevant CI (tests/lint) when those workflows exist

#### Tenant branches (`<slug>`)

- [ ] Require status check **`tenant-path-guard`** (name of the job in the workflow)
- [ ] Disallow force pushes
- [ ] Prefer limiting who can push; product work goes to `main`

### Apply with CLI script (local auth / VM)

Prefer the panel helper (uses your `gh auth login` session or `GH_TOKEN`):

```bash
cd SIGE_panel_administracion_SaaS

# Preview payloads
node scripts/apply-branch-protection.mjs --dry-run --erp-slugs imufusters --web-slugs imureformas

# Apply main + tenant branch protection
node scripts/apply-branch-protection.mjs --erp-slugs imufusters --web-slugs imureformas

# Only main
node scripts/apply-branch-protection.mjs --main-only
```

Repos opcionales: `GITHUB_ERP_REPO`, `GITHUB_WEB_REPO` (igual que el panel).

**Importante:** `gh` llama a la misma REST API. En repos **privados** sin GitHub Pro (personal) o Team/Enterprise (org) seguirás recibiendo HTTP 403 aunque la VM esté autenticada en local. El workflow `tenant-path-guard` sigue ejecutándose en cada push; lo que no podrás exigir es “required status check” hasta tener el plan.

After `tenant-path-guard` has run at least once on a tenant branch (so the check context exists), the script can require `contexts: ["tenant-path-guard"]` on `<slug>` branches.

Raw `gh api` equivalent (same endpoints the script wraps):

```bash
REPO=raulcarreno/SIGE_monolito   # or SIGE_monolito_web

# main
gh api -X PUT "repos/${REPO}/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": [] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

# tenant slug example (repeat per slug, or use a ruleset excluding main/development)
SLUG=imufusters
gh api -X PUT "repos/${REPO}/branches/${SLUG}/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<EOF
{
  "required_status_checks": { "strict": true, "contexts": ["tenant-path-guard"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

UI: **Settings → Rules → Rulesets** (preferred) or **Branches → Add rule**. Target `main` separately; for tenants, target all branches except `main` and `development` and require check `tenant-path-guard`.

See also each repo ADR `docs/specs/adr/001-tenant-code-ownership.md`.

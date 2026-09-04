export function getRuntimeTarget() {
  const value = (process.env.RUNTIME_TARGET || 'gke').trim().toLowerCase()
  if (value === 'hetzner') return 'hetzner'
  return 'gke'
}

export function isHetznerRuntime() {
  return getRuntimeTarget() === 'hetzner'
}

export function getComposeProjectDir() {
  return process.env.COMPOSE_PROJECT_DIR?.trim() || '/var/www/sige'
}

export function getComposeFile() {
  return process.env.COMPOSE_FILE?.trim() || 'docker-compose.prod.yml'
}

export function getComposeProject() {
  return process.env.COMPOSE_PROJECT?.trim() || 'sige'
}

export function artifactRegistryHost() {
  const registry =
    process.env.ARTIFACT_REGISTRY?.trim() ||
    'europe-southwest1-docker.pkg.dev/findspo-core/fraian-saas'
  return registry.split('/')[0]
}

export function serviceAccountKeyPath() {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || '/app/credentials/service-account.json'
}

export function imageEnvKey(kind, slug) {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
  const demo = (process.env.PLATFORM_DEMO_SLUG || 'sige-saas').trim().toLowerCase()
  if (!normalized || normalized === demo) {
    return kind === 'web' ? 'WEB_IMAGE' : 'ERP_IMAGE'
  }
  const suffix = normalized.replace(/-/g, '_').toUpperCase()
  return kind === 'web' ? `WEB_IMAGE_${suffix}` : `ERP_IMAGE_${suffix}`
}

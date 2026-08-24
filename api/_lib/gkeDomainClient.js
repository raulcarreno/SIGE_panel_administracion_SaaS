import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function runCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code })
      else {
        const error = new Error(stderr.trim() || stdout.trim() || `${command} exited ${code}`)
        error.code = 'COMMAND_FAILED'
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      }
    })
  })
}

export function getGkeConfig() {
  return {
    project: process.env.GCP_PROJECT_ID?.trim() || 'findspo-core',
    region: process.env.GKE_REGION?.trim() || 'europe-southwest1',
    cluster: process.env.GKE_CLUSTER?.trim() || 'kbnt-prd-1',
    namespace: process.env.GKE_NAMESPACE?.trim() || 'sige-saas-prod',
    erpService: process.env.PLATFORM_ERP_SERVICE?.trim() || 'sige-erp',
    webService: process.env.PLATFORM_WEB_SERVICE?.trim() || 'sige-web',
    platformIngress: process.env.PLATFORM_INGRESS_NAME?.trim() || 'sige-platform',
  }
}

export async function ensureGkeCredentials() {
  const { project, region, cluster } = getGkeConfig()
  await runCommand('gcloud', [
    'container',
    'clusters',
    'get-credentials',
    cluster,
    `--region=${region}`,
    `--project=${project}`,
  ])
}

export async function resolveIngressIp() {
  const configured = process.env.INGRESS_IP?.trim()
  if (configured) return configured

  await ensureGkeCredentials()
  const { namespace, platformIngress } = getGkeConfig()
  const candidates = [platformIngress, 'sige-app']

  for (const name of candidates) {
    try {
      const result = await runCommand('kubectl', [
        'get',
        'ingress',
        name,
        '-n',
        namespace,
        '-o',
        'jsonpath={.status.loadBalancer.ingress[0].ip}',
      ])
      const ip = result.stdout.trim()
      if (ip) return ip
    } catch {
      // try next candidate
    }
  }

  const error = new Error(
    'Could not resolve Ingress IP. Set INGRESS_IP or ensure the platform Ingress has a loadBalancer IP.',
  )
  error.statusCode = 503
  error.code = 'INGRESS_IP_MISSING'
  throw error
}

export async function applyDomainManifest(yaml) {
  await ensureGkeCredentials()
  const dir = await mkdtemp(join(tmpdir(), 'sige-domains-'))
  const filePath = join(dir, 'manifest.yaml')
  try {
    await writeFile(filePath, yaml, 'utf8')
    const result = await runCommand('kubectl', ['apply', '-f', filePath])
    return { stdout: result.stdout, stderr: result.stderr }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function deleteTenantDomainResources(slug) {
  await ensureGkeCredentials()
  const { namespace } = getGkeConfig()
  const normalized = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const names = [`sige-tenant-${normalized}`, `sige-cert-${normalized}`]

  for (const name of names) {
    const kind = name.startsWith('sige-cert-') ? 'managedcertificate' : 'ingress'
    try {
      await runCommand('kubectl', ['delete', kind, name, '-n', namespace, '--ignore-not-found'])
    } catch {
      // best-effort cleanup
    }
  }
}

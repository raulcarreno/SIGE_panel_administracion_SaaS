import { spawn } from 'node:child_process'
import { mkdir, writeFile, unlink, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { buildApacheVhost, vhostFileName } from './apacheVhost.js'
import {
  getComposeProjectDir,
  isHetznerRuntime,
} from './runtimeTarget.js'
import { tenantErpServiceName, tenantWebServiceName } from './tenantDomains.js'

const WELL_KNOWN_PORTS = {
  'sige-erp': 8080,
  'sige-web': 8081,
  'sige-panel': 3001,
  'sige-erp-reformasbcn': 8082,
  'sige-web-reformasbcn': 8083,
}

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

export function getHetznerConfig() {
  return {
    composeDir: getComposeProjectDir(),
    ingressIp: process.env.INGRESS_IP?.trim() || null,
  }
}

export async function resolveIngressIp() {
  const configured = process.env.INGRESS_IP?.trim()
  if (configured) return configured
  const error = new Error(
    'Could not resolve public IP. Set INGRESS_IP to the sige-prod IPv4.',
  )
  error.statusCode = 503
  error.code = 'INGRESS_IP_MISSING'
  throw error
}

export function loopbackPortForService(serviceName) {
  return WELL_KNOWN_PORTS[serviceName] || null
}

async function resolveLoopbackPort(serviceName) {
  const known = loopbackPortForService(serviceName)
  if (known) return known

  try {
    const { stdout } = await runCommand('docker', [
      'compose',
      '-p',
      process.env.COMPOSE_PROJECT?.trim() || 'sige',
      '-f',
      join(getComposeProjectDir(), process.env.COMPOSE_FILE?.trim() || 'docker-compose.prod.yml'),
      'port',
      serviceName,
      '8080',
    ], { cwd: getComposeProjectDir() })
    const match = stdout.trim().match(/:(\d+)$/)
    if (match) return Number(match[1])
  } catch {
    // fall through
  }

  const error = new Error(
    `No loopback port for ${serviceName}. Provision the tenant stack on Hetzner first.`,
  )
  error.statusCode = 503
  error.code = 'TENANT_STACK_MISSING'
  throw error
}

async function reloadApache() {
  await runCommand('docker', [
    'run',
    '--rm',
    '--privileged',
    '--pid=host',
    '--network',
    'host',
    'alpine:3.20',
    'nsenter',
    '-t',
    '1',
    '-m',
    '-u',
    '-i',
    '-n',
    '--',
    '/bin/bash',
    '-lc',
    'apache2ctl configtest && systemctl reload apache2',
  ])
}

async function writeVhost(hostname, port, aliases = [], { blockWwwAdmin = false } = {}) {
  const composeDir = getComposeProjectDir()
  const availableDir = join(composeDir, 'apache', 'sites-available')
  const enabledDir = join(composeDir, 'apache', 'sites-enabled')
  await mkdir(availableDir, { recursive: true })
  await mkdir(enabledDir, { recursive: true })
  const fileName = vhostFileName(hostname)
  const body = buildApacheVhost({ serverName: hostname, port, aliases, blockWwwAdmin })
  const availablePath = join(availableDir, fileName)
  const enabledPath = join(enabledDir, fileName)
  await writeFile(availablePath, body, 'utf8')
  try {
    await unlink(enabledPath)
  } catch {
    // missing is fine
  }
  await symlink(availablePath, enabledPath)
  return { fileName, availablePath }
}

export async function provisionTenantHosts({ slug, erpHost, webHost, customHosts = [] }) {
  const erpService = tenantErpServiceName(slug)
  const webService = tenantWebServiceName(slug)
  const erpPort = await resolveLoopbackPort(erpService)
  const webPort = await resolveLoopbackPort(webService)

  const erpAliases = customHosts.filter((item) => item.kind === 'erp').map((item) => item.hostname)
  const webAliases = customHosts.filter((item) => item.kind !== 'erp').map((item) => item.hostname)

  const erpFile = await writeVhost(erpHost, erpPort, erpAliases)
  // Public www must not expose /admin; CMS admin uses cms.* (or other non-www) aliases.
  const webFile = await writeVhost(webHost, webPort, webAliases, { blockWwwAdmin: true })
  await reloadApache()

  return {
    stdout: `apache vhosts ${erpFile.fileName} ${webFile.fileName}`,
    stderr: '',
    certName: 'letsencrypt-apache',
    ingressName: 'apache',
    domains: [erpHost, webHost, ...customHosts.map((item) => item.hostname)].filter(Boolean),
  }
}

export async function deleteTenantDomainResources(slug) {
  const composeDir = getComposeProjectDir()
  const erpHost = `erp.${slug}.findspo.com`
  const webHost = `www.${slug}.findspo.com`
  for (const host of [erpHost, webHost]) {
    const fileName = vhostFileName(host)
    for (const dir of ['sites-available', 'sites-enabled']) {
      try {
        await unlink(join(composeDir, 'apache', dir, fileName))
      } catch {
        // best-effort
      }
    }
  }
  try {
    await reloadApache()
  } catch {
    // best-effort
  }
}

export function isHetznerDomainRuntime() {
  return isHetznerRuntime()
}

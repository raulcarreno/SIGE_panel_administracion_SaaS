import { spawn } from 'node:child_process'
import { join } from 'node:path'
import {
  getComposeFile,
  getComposeProject,
  getComposeProjectDir,
} from './runtimeTarget.js'
import { MAX_LOG_BYTES, clampTailLines, truncateLogs } from './kubeApiClient.js'

function runCommand(command, args, { cwd, env, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        const missing = new Error('Docker CLI is not available.')
        missing.code = 'KUBE_UNAVAILABLE'
        missing.statusCode = 503
        reject(missing)
        return
      }
      reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
        return
      }
      const error = new Error(stderr.trim() || stdout.trim() || `${command} exited ${code}`)
      error.code = 'KUBE_UNAVAILABLE'
      error.statusCode = 503
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    })
    if (stdin) {
      child.stdin.end(stdin)
    }
  })
}

function composeArgs(extra) {
  return [
    'compose',
    '-p',
    getComposeProject(),
    '-f',
    getComposeFile(),
    ...extra,
  ]
}

function parseLabels(raw) {
  const labels = {}
  if (!raw) return labels
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  for (const part of String(raw).split(',')) {
    const [key, ...rest] = part.split('=')
    if (!key) continue
    labels[key.trim()] = rest.join('=').trim()
  }
  return labels
}

export function containerToPod(entry) {
  const labels = parseLabels(entry.Labels)
  const service = entry.Service || labels.app || ''
  const component = labels['sige.component'] || (service.includes('-web') ? 'web' : 'erp')
  const tenant = labels['sige.tenant'] || ''
  const state = String(entry.State || '').toLowerCase()
  const running = state === 'running'
  const health = String(entry.Health || '').toLowerCase()
  const ready = running && health !== 'unhealthy'
  const image = entry.Image || null
  const startedAt = entry.CreatedAt || null

  return {
    metadata: {
      name: entry.Name || service,
      creationTimestamp: startedAt,
      labels: {
        app: service,
        'sige.component': component,
        'sige.tenant': tenant,
        ...labels,
      },
    },
    spec: {
      nodeName: 'sige-prod',
      containers: [{ name: component, image }],
    },
    status: {
      phase: running ? 'Running' : state === 'exited' ? 'Succeeded' : 'Pending',
      startTime: startedAt,
      containerStatuses: [
        {
          name: component,
          ready,
          restartCount: 0,
          image,
          state: running
            ? { running: { startedAt } }
            : { waiting: { reason: entry.Status || state || 'Pending' } },
        },
      ],
    },
  }
}

export function containerToDeployment(entry) {
  const service = entry.Service || ''
  const running = String(entry.State || '').toLowerCase() === 'running'
  const health = String(entry.Health || '').toLowerCase()
  const ready = running && health !== 'unhealthy'
  return {
    metadata: { name: service },
    spec: {
      replicas: 1,
      template: { spec: { containers: [{ image: entry.Image || null }] } },
    },
    status: {
      readyReplicas: ready ? 1 : 0,
      availableReplicas: ready ? 1 : 0,
      updatedReplicas: 1,
    },
  }
}

async function composePs() {
  const { stdout } = await runCommand('docker', composeArgs(['ps', '-a', '--format', 'json']), {
    cwd: getComposeProjectDir(),
  })
  const text = stdout.trim()
  if (!text) return []
  if (text.startsWith('[')) return JSON.parse(text)
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

export async function listPodsByLabel(namespace, labelSelector) {
  const items = await composePs()
  const [key, value] = String(labelSelector || '').split('=')
  return items
    .map(containerToPod)
    .filter((pod) => !key || pod.metadata.labels[key] === value)
}

export async function listPodsByApp(namespace, appName) {
  const items = await composePs()
  return items.filter((item) => item.Service === appName).map(containerToPod)
}

export async function getDeployment(namespace, name) {
  const items = await composePs()
  const match = items.find((item) => item.Service === name)
  if (!match) {
    const error = new Error(`Compose service ${name} not found.`)
    error.code = 'KUBE_NOT_FOUND'
    error.statusCode = 404
    throw error
  }
  return containerToDeployment(match)
}

export async function listNamespaceEvents() {
  return []
}

export async function getPodLogs(namespace, podName, { tailLines } = {}) {
  const items = await composePs()
  const match = items.find((item) => item.Name === podName || item.Service === podName)
  if (!match) {
    const error = new Error(`Compose service ${podName} not found.`)
    error.code = 'KUBE_NOT_FOUND'
    error.statusCode = 404
    throw error
  }
  const { stdout } = await runCommand(
    'docker',
    composeArgs(['logs', '--no-color', '--tail', String(clampTailLines(tailLines)), match.Service]),
    { cwd: getComposeProjectDir() },
  )
  return truncateLogs(stdout, MAX_LOG_BYTES)
}

export function getRuntimeNamespace() {
  return getComposeProject()
}

export const composeRuntimeClient = {
  listPodsByLabel,
  listPodsByApp,
  getDeployment,
  listNamespaceEvents,
  getPodLogs,
  getRuntimeNamespace,
}

export function composeEnvFilePath() {
  return join(getComposeProjectDir(), '.env')
}

import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import https from 'node:https'
import { getGkeConfig } from './gkeDomainClient.js'

export const MAX_TAIL_LINES = 500
export const DEFAULT_TAIL_LINES = 200
export const MAX_LOG_BYTES = 512 * 1024
export const DEFAULT_KUBE_TIMEOUT_MS = 8_000

const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token'
const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'

export function clampTailLines(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TAIL_LINES
  return Math.min(Math.floor(parsed), MAX_TAIL_LINES)
}

export function parseComponent(value) {
  const component = String(value || '').trim().toLowerCase()
  if (component === 'erp' || component === 'web') return component
  const error = new Error('component must be erp or web.')
  error.statusCode = 400
  error.code = 'INVALID_COMPONENT'
  throw error
}

export function parsePreviousFlag(value) {
  if (value === true || value === 'true' || value === '1') return true
  return false
}

export function isInCluster() {
  return Boolean(process.env.KUBERNETES_SERVICE_HOST?.trim())
}

export function mapKubeHttpError(status, body) {
  const error = new Error('Kubernetes API request failed.')
  if (status === 401 || status === 403) {
    error.message = 'Kubernetes API forbidden. Check sige-panel RoleBinding.'
    error.code = 'KUBE_FORBIDDEN'
    error.statusCode = 503
    return error
  }
  if (status === 404) {
    error.message = 'Kubernetes resource not found.'
    error.code = 'KUBE_NOT_FOUND'
    error.statusCode = 404
    return error
  }
  error.message = 'Kubernetes API unavailable.'
  error.code = 'KUBE_UNAVAILABLE'
  error.statusCode = 503
  error.kubeStatus = status
  if (typeof body === 'string' && body && body.length < 200) {
    error.detail = body
  }
  return error
}

export function inferComponent(pod, names) {
  const labels = pod?.metadata?.labels || {}
  const label = labels['sige.component']
  if (label === 'erp' || label === 'web') return label

  const app = labels.app || ''
  const name = pod?.metadata?.name || ''
  if (app === names.erpDeployment || name.startsWith(`${names.erpDeployment}-`) || name === names.erpDeployment) {
    return 'erp'
  }
  if (app === names.webDeployment || name.startsWith(`${names.webDeployment}-`) || name === names.webDeployment) {
    return 'web'
  }
  return 'unknown'
}

function firstContainer(pod) {
  return pod?.spec?.containers?.[0] || pod?.status?.containerStatuses?.[0] || null
}

function containerStateReason(status) {
  const state = status?.state || {}
  if (state.waiting?.reason) return state.waiting.reason
  if (state.terminated?.reason) return state.terminated.reason
  return null
}

export function summarizePod(pod, names) {
  const statuses = pod?.status?.containerStatuses || []
  const restarts = statuses.reduce((sum, item) => sum + Number(item.restartCount || 0), 0)
  const ready = statuses.length > 0 && statuses.every((item) => item.ready === true) && pod?.status?.phase === 'Running'
  const primary = statuses[0] || null
  const container = firstContainer(pod)
  const component = inferComponent(pod, names)

  return {
    name: pod?.metadata?.name || '',
    component,
    phase: pod?.status?.phase || 'Unknown',
    ready,
    restarts,
    image: primary?.image || container?.image || null,
    node: pod?.spec?.nodeName || null,
    startedAt: pod?.status?.startTime || primary?.state?.running?.startedAt || null,
    containerName: primary?.name || container?.name || component || null,
    reason: ready ? null : containerStateReason(primary),
  }
}

export function summarizeDeployment(deploy) {
  if (!deploy) return null
  const image = deploy.spec?.template?.spec?.containers?.[0]?.image || null
  return {
    name: deploy.metadata?.name || '',
    replicas: Number(deploy.spec?.replicas ?? 0),
    readyReplicas: Number(deploy.status?.readyReplicas ?? 0),
    availableReplicas: Number(deploy.status?.availableReplicas ?? 0),
    updatedReplicas: Number(deploy.status?.updatedReplicas ?? 0),
    image,
  }
}

export function summarizeEvent(event) {
  const objectKind = event?.involvedObject?.kind || ''
  const objectName = event?.involvedObject?.name || ''
  return {
    type: event?.type || 'Normal',
    reason: event?.reason || '',
    message: event?.message || '',
    object: objectKind && objectName ? `${objectKind}/${objectName}` : objectName,
    count: Number(event?.count ?? 1),
    lastTimestamp: event?.lastTimestamp || event?.eventTime || event?.metadata?.creationTimestamp || null,
  }
}

export function pickNewestPod(pods) {
  if (!pods?.length) return null
  return [...pods].sort((left, right) => {
    const leftTs = Date.parse(left?.metadata?.creationTimestamp || 0)
    const rightTs = Date.parse(right?.metadata?.creationTimestamp || 0)
    return rightTs - leftTs
  })[0]
}

export function belongsToTenant(resourceName, names) {
  const name = String(resourceName || '')
  if (!name) return false
  return (
    name === names.erpDeployment
    || name === names.webDeployment
    || name.startsWith(`${names.erpDeployment}-`)
    || name.startsWith(`${names.webDeployment}-`)
  )
}

export function filterTenantEvents(events, names) {
  return (events || []).filter((event) => belongsToTenant(event?.involvedObject?.name, names))
}

export function groupPodsByComponent(pods, names) {
  const grouped = { erp: [], web: [], unknown: [] }
  for (const pod of pods || []) {
    const component = inferComponent(pod, names)
    if (component === 'erp' || component === 'web') grouped[component].push(pod)
    else grouped.unknown.push(pod)
  }
  return grouped
}

export function truncateLogs(text, maxBytes = MAX_LOG_BYTES) {
  const value = String(text || '')
  if (value.length <= maxBytes) return value
  return value.slice(-maxBytes)
}

export function buildKubectlGetArgs({ resource, namespace, name, labelSelector, output = 'json' }) {
  const args = ['get', resource]
  if (name) args.push(name)
  args.push('-n', namespace)
  if (labelSelector) args.push('-l', labelSelector)
  args.push('-o', output)
  return args
}

export function buildKubectlLogsArgs({ namespace, podName, container, tailLines, previous }) {
  const args = ['logs', podName, '-n', namespace]
  if (container) args.push('-c', container)
  args.push(`--tail=${clampTailLines(tailLines)}`)
  if (previous) args.push('--previous')
  return args
}

function kubeUnavailableError(message) {
  const error = new Error(message)
  error.code = 'KUBE_UNAVAILABLE'
  error.statusCode = 503
  return error
}

function runKubectl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('kubectl', args, {
      env: process.env,
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
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(kubeUnavailableError('Kubernetes CLI is not available.'))
        return
      }
      reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      const combined = (stderr || stdout).trim()
      if (/previous terminated container/i.test(combined)) {
        const missing = new Error('Previous container logs are not available.')
        missing.code = 'KUBE_PREVIOUS_MISSING'
        missing.statusCode = 200
        reject(missing)
        return
      }
      reject(kubeUnavailableError(combined || `kubectl exited ${code}`))
    })
  })
}

function kubeApiBase() {
  const host = process.env.KUBERNETES_SERVICE_HOST.trim()
  const port = process.env.KUBERNETES_SERVICE_PORT?.trim() || '443'
  const wrapped = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `https://${wrapped}:${port}`
}

function readServiceAccount() {
  if (!existsSync(SA_TOKEN_PATH) || !existsSync(SA_CA_PATH)) {
    throw kubeUnavailableError('In-cluster service account credentials are missing.')
  }
  return {
    token: readFileSync(SA_TOKEN_PATH, 'utf8').trim(),
    ca: readFileSync(SA_CA_PATH),
  }
}

function inClusterRequest(pathWithQuery, { asText = false } = {}) {
  const { token, ca } = readServiceAccount()
  const url = new URL(pathWithQuery, kubeApiBase())

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          // Pod logs: GKE rejects Accept: text/plain with 406. Use */* for log streams.
          Accept: asText ? '*/*' : 'application/json',
        },
        ca,
        timeout: DEFAULT_KUBE_TIMEOUT_MS,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body)
            return
          }
          reject(mapKubeHttpError(res.statusCode, body))
        })
      },
    )
    req.on('timeout', () => {
      req.destroy()
      reject(kubeUnavailableError('Kubernetes API request timed out.'))
    })
    req.on('error', (error) => {
      reject(kubeUnavailableError(error.message || 'Kubernetes API network error.'))
    })
    req.end()
  })
}

function parseJsonList(body) {
  if (!body) return []
  const parsed = JSON.parse(body)
  if (Array.isArray(parsed.items)) return parsed.items
  if (parsed.kind && parsed.metadata) return [parsed]
  return []
}

async function kubectlJson(args) {
  const { stdout } = await runKubectl(args)
  return JSON.parse(stdout)
}

export async function listPodsByLabel(namespace, labelSelector) {
  if (isInCluster()) {
    const query = new URLSearchParams({ labelSelector }).toString()
    const body = await inClusterRequest(`/api/v1/namespaces/${namespace}/pods?${query}`)
    return parseJsonList(body)
  }
  const payload = await kubectlJson(
    buildKubectlGetArgs({ resource: 'pods', namespace, labelSelector }),
  )
  return payload.items || []
}

export async function listPodsByApp(namespace, appName) {
  return listPodsByLabel(namespace, `app=${appName}`)
}

export async function getDeployment(namespace, name) {
  if (isInCluster()) {
    const body = await inClusterRequest(`/apis/apps/v1/namespaces/${namespace}/deployments/${name}`)
    return JSON.parse(body)
  }
  return kubectlJson(buildKubectlGetArgs({ resource: 'deploy', namespace, name }))
}

export async function listNamespaceEvents(namespace) {
  if (isInCluster()) {
    const body = await inClusterRequest(`/api/v1/namespaces/${namespace}/events`)
    return parseJsonList(body)
  }
  const payload = await kubectlJson(buildKubectlGetArgs({ resource: 'events', namespace }))
  return payload.items || []
}

export async function getPodLogs(namespace, podName, { container, tailLines, previous } = {}) {
  const clamped = clampTailLines(tailLines)
  try {
    if (isInCluster()) {
      const params = new URLSearchParams({
        timestamps: 'false',
        tailLines: String(clamped),
      })
      if (container) params.set('container', container)
      if (previous) params.set('previous', 'true')
      const body = await inClusterRequest(
        `/api/v1/namespaces/${namespace}/pods/${podName}/log?${params.toString()}`,
        { asText: true },
      )
      return truncateLogs(body)
    }
    const { stdout } = await runKubectl(
      buildKubectlLogsArgs({ namespace, podName, container, tailLines: clamped, previous }),
    )
    return truncateLogs(stdout)
  } catch (error) {
    if (error.code === 'KUBE_PREVIOUS_MISSING') {
      error.previousMissing = true
      throw error
    }
    if (previous && /previous terminated container/i.test(error.message || '')) {
      const missing = new Error('Previous container logs are not available.')
      missing.code = 'KUBE_PREVIOUS_MISSING'
      missing.previousMissing = true
      throw missing
    }
    throw error
  }
}

export function getRuntimeNamespace() {
  return getGkeConfig().namespace
}

export const defaultKubeClient = {
  listPodsByLabel,
  listPodsByApp,
  getDeployment,
  listNamespaceEvents,
  getPodLogs,
  getRuntimeNamespace,
}

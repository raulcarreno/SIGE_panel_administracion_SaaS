import * as controlApi from './controlApiClient.js'
import { loadTenantContext, resolveTenantCredentials } from './tenantContext.js'
import {
  tenantErpDeploymentName,
  tenantWebDeploymentName,
} from './tenantDomains.js'
import {
  clampTailLines,
  filterTenantEvents,
  getRuntimeNamespace,
  groupPodsByComponent,
  parseComponent,
  parsePreviousFlag,
  pickNewestPod,
  summarizeDeployment,
  summarizeEvent,
  summarizePod,
} from './kubeApiClient.js'
import { defaultRuntimeClient } from './runtimeClient.js'

const WEB_HEALTH_TIMEOUT_MS = 8_000

function namesForSlug(slug) {
  return {
    erpDeployment: tenantErpDeploymentName(slug),
    webDeployment: tenantWebDeploymentName(slug),
  }
}

function deriveWorkloadStatus(pods, deployment) {
  if ((!pods || pods.length === 0) && !deployment) return 'missing'
  if (pods.some((pod) => pod.reason === 'CrashLoopBackOff')) return 'crash'
  if (pods.some((pod) => pod.ready)) return 'ready'
  if (pods.some((pod) => pod.phase === 'Pending')) return 'pending'
  if (deployment?.readyReplicas > 0) return 'ready'
  return 'unhealthy'
}

function mapErpAppHealth(status) {
  return {
    reachable: true,
    ok: status?.db === 'connected',
    appVersion: status?.appVersion || null,
    gitSha: status?.gitSha || null,
    db: status?.db || null,
    erpDb: status?.erpDb || null,
    configDb: status?.configDb || null,
    uptimeSeconds: status?.uptimeSeconds ?? null,
    migrationsPending: status?.migrationsPending ?? null,
    maintenanceMode: Boolean(status?.maintenanceMode),
    tenantSlug: status?.tenantSlug || null,
    error: null,
    code: null,
  }
}

function mapFailedAppHealth(error) {
  return {
    reachable: false,
    ok: false,
    appVersion: null,
    gitSha: null,
    db: null,
    error: error.message,
    code: error.code || 'APP_UNREACHABLE',
  }
}

export async function fetchWebReady(webBaseUrl, { fetchImpl = fetch, timeoutMs = WEB_HEALTH_TIMEOUT_MS } = {}) {
  if (!webBaseUrl) {
    return {
      reachable: false,
      ok: false,
      error: 'Web CMS URL is not configured.',
      code: 'WEB_URL_MISSING',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${webBaseUrl.replace(/\/+$/, '')}/api/health/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { raw: text }
      }
    }
    return {
      reachable: true,
      ok: response.ok && payload?.ok !== false,
      db: payload?.db || null,
      migrationsPending: payload?.migrationsPending ?? null,
      status: response.status,
      error: response.ok ? null : payload?.error || `Health check failed (${response.status}).`,
      code: response.ok ? null : 'WEB_UNHEALTHY',
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        reachable: false,
        ok: false,
        error: 'Web CMS health check timed out.',
        code: 'WEB_UNREACHABLE',
      }
    }
    return {
      reachable: false,
      ok: false,
      error: error.message || 'Cannot reach Web CMS.',
      code: error.code || 'WEB_UNREACHABLE',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function listTenantPods(kube, namespace, slug, names) {
  let pods = []
  try {
    pods = await kube.listPodsByLabel(namespace, `sige.tenant=${slug}`)
  } catch (error) {
    if (error.code !== 'KUBE_NOT_FOUND') throw error
  }

  if (pods.length) return pods

  const [erpPods, webPods] = await Promise.all([
    kube.listPodsByApp(namespace, names.erpDeployment).catch(() => []),
    kube.listPodsByApp(namespace, names.webDeployment).catch(() => []),
  ])
  return [...erpPods, ...webPods]
}

function sortEventsNewestFirst(events) {
  return [...events].sort((left, right) => {
    const leftTs = Date.parse(left.lastTimestamp || 0)
    const rightTs = Date.parse(right.lastTimestamp || 0)
    return rightTs - leftTs
  })
}

export async function fetchClusterSnapshot(slug, kube = defaultRuntimeClient()) {
  const namespace = kube.getRuntimeNamespace?.() || getRuntimeNamespace()
  const names = namesForSlug(slug)

  try {
    const pods = await listTenantPods(kube, namespace, slug, names)
    const [erpDeploy, webDeploy, rawEvents] = await Promise.all([
      kube.getDeployment(namespace, names.erpDeployment).catch(() => null),
      kube.getDeployment(namespace, names.webDeployment).catch(() => null),
      kube.listNamespaceEvents(namespace).catch(() => []),
    ])

    const grouped = groupPodsByComponent(pods, names)
    const erpPods = grouped.erp
      .map((pod) => summarizePod(pod, names))
      .sort((left, right) => Date.parse(right.startedAt || 0) - Date.parse(left.startedAt || 0))
    const webPods = grouped.web
      .map((pod) => summarizePod(pod, names))
      .sort((left, right) => Date.parse(right.startedAt || 0) - Date.parse(left.startedAt || 0))
    const erpDeployment = summarizeDeployment(erpDeploy)
    const webDeployment = summarizeDeployment(webDeploy)
    const events = sortEventsNewestFirst(
      filterTenantEvents(rawEvents, names).map(summarizeEvent),
    ).slice(0, 20)

    return {
      available: true,
      error: null,
      code: null,
      erp: {
        status: deriveWorkloadStatus(erpPods, erpDeployment),
        deployment: erpDeployment,
        pods: erpPods,
      },
      web: {
        status: deriveWorkloadStatus(webPods, webDeployment),
        deployment: webDeployment,
        pods: webPods,
      },
      events,
    }
  } catch (error) {
    const empty = { status: 'missing', deployment: null, pods: [] }
    return {
      available: false,
      error: error.message,
      code: error.code || 'KUBE_UNAVAILABLE',
      erp: empty,
      web: empty,
      events: [],
    }
  }
}

export async function getTenantRuntime(tenantId, deps = {}) {
  const loadTenant = deps.loadTenant || loadTenantContext
  const getCredentials = deps.getCredentials || resolveTenantCredentials
  const kube = deps.kube || defaultRuntimeClient()
  const getErpStatus = deps.getErpStatus || controlApi.getStatus
  const getWebReady = deps.getWebReady || fetchWebReady

  const tenant = await loadTenant(tenantId)
  const credentials = await getCredentials(tenantId)

  const [cluster, erpApp, webApp] = await Promise.all([
    fetchClusterSnapshot(tenant.slug, kube),
    getErpStatus(credentials)
      .then(mapErpAppHealth)
      .catch(mapFailedAppHealth),
    Promise.resolve()
      .then(() => getWebReady(tenant.webBaseUrl))
      .catch(mapFailedAppHealth),
  ])

  return {
    slug: tenant.slug,
    clusterAvailable: cluster.available,
    clusterError: cluster.error,
    clusterErrorCode: cluster.code,
    services: {
      erp: {
        status: cluster.erp.status,
        deployment: cluster.erp.deployment,
        pods: cluster.erp.pods,
        app: erpApp,
      },
      web: {
        status: cluster.web.status,
        deployment: cluster.web.deployment,
        pods: cluster.web.pods,
        app: webApp,
      },
    },
    events: cluster.events,
  }
}

export async function getTenantRuntimeLogs(tenantId, query = {}, deps = {}) {
  const loadTenant = deps.loadTenant || loadTenantContext
  const kube = deps.kube || defaultRuntimeClient()
  const component = parseComponent(query.component)
  const tailLines = clampTailLines(query.tailLines)
  const previous = parsePreviousFlag(query.previous)
  const tenant = await loadTenant(tenantId)
  const namespace = kube.getRuntimeNamespace?.() || getRuntimeNamespace()
  const names = namesForSlug(tenant.slug)

  let pods
  try {
    pods = await listTenantPods(kube, namespace, tenant.slug, names)
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 503
      error.code = error.code || 'KUBE_UNAVAILABLE'
    }
    throw error
  }

  const grouped = groupPodsByComponent(pods, names)
  const newest = pickNewestPod(grouped[component])
  if (!newest) {
    const error = new Error(`No ${component} pod found for tenant ${tenant.slug}.`)
    error.statusCode = 404
    error.code = 'POD_NOT_FOUND'
    throw error
  }

  const summarized = summarizePod(newest, names)
  const container = summarized.containerName || component

  try {
    const logs = await kube.getPodLogs(namespace, newest.metadata.name, {
      container,
      tailLines,
      previous,
    })
    return {
      component,
      podName: newest.metadata.name,
      container,
      tailLines,
      previous,
      previousMissing: false,
      logs,
    }
  } catch (error) {
    if (error.code === 'KUBE_PREVIOUS_MISSING') {
      return {
        component,
        podName: newest.metadata.name,
        container,
        tailLines,
        previous,
        previousMissing: true,
        logs: '',
      }
    }
    if (!error.statusCode) {
      error.statusCode = 503
      error.code = error.code || 'KUBE_UNAVAILABLE'
    }
    throw error
  }
}

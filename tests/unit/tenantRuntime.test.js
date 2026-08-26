import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getTenantRuntime, getTenantRuntimeLogs } from '../../api/_lib/tenantRuntime.js'

const TENANT = {
  id: 'tenant-1',
  slug: 'acme',
  baseUrl: 'https://erp.acme.findspo.com',
  webBaseUrl: 'https://www.acme.findspo.com',
}

const CREDENTIALS = {
  id: 'tenant-1',
  slug: 'acme',
  baseUrl: TENANT.baseUrl,
  controlToken: 'token',
}

function erpPod() {
  return {
    metadata: {
      name: 'sige-erp-acme-abc',
      creationTimestamp: '2026-08-26T09:00:00Z',
      labels: { app: 'sige-erp-acme', 'sige.component': 'erp', 'sige.tenant': 'acme' },
    },
    spec: {
      nodeName: 'node-1',
      containers: [{ name: 'erp', image: 'erp:1' }],
    },
    status: {
      phase: 'Running',
      startTime: '2026-08-26T09:01:00Z',
      containerStatuses: [
        { name: 'erp', ready: true, restartCount: 0, image: 'erp:1', state: { running: {} } },
      ],
    },
  }
}

function webPod() {
  return {
    metadata: {
      name: 'sige-web-acme-xyz',
      creationTimestamp: '2026-08-26T09:05:00Z',
      labels: { app: 'sige-web-acme', 'sige.component': 'web', 'sige.tenant': 'acme' },
    },
    spec: {
      nodeName: 'node-2',
      containers: [{ name: 'web', image: 'web:1' }],
    },
    status: {
      phase: 'Running',
      startTime: '2026-08-26T09:06:00Z',
      containerStatuses: [
        { name: 'web', ready: false, restartCount: 3, image: 'web:1', state: { waiting: { reason: 'CrashLoopBackOff' } } },
      ],
    },
  }
}

describe('tenantRuntime', () => {
  it('groups ERP and Web workloads and keeps app health when kube works', async () => {
    const kube = {
      getRuntimeNamespace: () => 'sige-saas-prod',
      listPodsByLabel: async () => [erpPod(), webPod()],
      listPodsByApp: async () => [],
      getDeployment: async (_ns, name) => ({
        metadata: { name },
        spec: { replicas: 1, template: { spec: { containers: [{ image: `${name}:1` }] } } },
        status: { readyReplicas: name.includes('erp') ? 1 : 0, availableReplicas: name.includes('erp') ? 1 : 0 },
      }),
      listNamespaceEvents: async () => [
        {
          type: 'Warning',
          reason: 'BackOff',
          message: 'crash',
          count: 2,
          lastTimestamp: '2026-08-26T10:00:00Z',
          involvedObject: { kind: 'Pod', name: 'sige-web-acme-xyz' },
        },
        {
          type: 'Normal',
          reason: 'Pulled',
          message: 'other tenant',
          involvedObject: { kind: 'Pod', name: 'sige-web-other-1' },
        },
      ],
    }

    const result = await getTenantRuntime('tenant-1', {
      loadTenant: async () => TENANT,
      getCredentials: async () => CREDENTIALS,
      kube,
      getErpStatus: async () => ({ db: 'connected', appVersion: '1.2.3', uptimeSeconds: 10 }),
      getWebReady: async () => ({ ok: true, db: 'connected' }),
    })

    assert.equal(result.slug, 'acme')
    assert.equal(result.clusterAvailable, true)
    assert.equal(result.services.erp.status, 'ready')
    assert.equal(result.services.web.status, 'crash')
    assert.equal(result.services.erp.app.ok, true)
    assert.equal(result.services.web.app.ok, true)
    assert.equal(result.events.length, 1)
    assert.equal(result.events[0].object, 'Pod/sige-web-acme-xyz')
  })

  it('degrades cluster data when kube fails and still returns app health', async () => {
    const kube = {
      getRuntimeNamespace: () => 'sige-saas-prod',
      listPodsByLabel: async () => {
        const error = new Error('Kubernetes CLI is not available.')
        error.code = 'KUBE_UNAVAILABLE'
        error.statusCode = 503
        throw error
      },
      listPodsByApp: async () => [],
      getDeployment: async () => null,
      listNamespaceEvents: async () => [],
    }

    const result = await getTenantRuntime('tenant-1', {
      loadTenant: async () => TENANT,
      getCredentials: async () => CREDENTIALS,
      kube,
      getErpStatus: async () => ({ db: 'connected', appVersion: '1.0.0' }),
      getWebReady: async () => {
        const error = new Error('Cannot reach tenant pod.')
        error.code = 'TENANT_UNREACHABLE'
        throw error
      },
    })

    assert.equal(result.clusterAvailable, false)
    assert.equal(result.clusterErrorCode, 'KUBE_UNAVAILABLE')
    assert.equal(result.services.erp.status, 'missing')
    assert.equal(result.services.erp.app.ok, true)
    assert.equal(result.services.web.app.reachable, false)
    assert.equal(result.events.length, 0)
  })

  it('reads logs from the newest pod of the requested component', async () => {
    const older = erpPod()
    older.metadata.name = 'sige-erp-acme-old'
    older.metadata.creationTimestamp = '2026-08-01T00:00:00Z'
    const newer = erpPod()
    newer.metadata.name = 'sige-erp-acme-new'
    newer.metadata.creationTimestamp = '2026-08-26T00:00:00Z'

    let captured
    const kube = {
      getRuntimeNamespace: () => 'sige-saas-prod',
      listPodsByLabel: async () => [older, newer, webPod()],
      listPodsByApp: async () => [],
      getPodLogs: async (namespace, podName, options) => {
        captured = { namespace, podName, options }
        return '{"level":"info","message":"ok"}\n'
      },
    }

    const result = await getTenantRuntimeLogs('tenant-1', { component: 'erp', tailLines: 100 }, {
      loadTenant: async () => TENANT,
      kube,
    })

    assert.equal(result.podName, 'sige-erp-acme-new')
    assert.equal(result.container, 'erp')
    assert.equal(result.tailLines, 100)
    assert.match(result.logs, /"message":"ok"/)
    assert.equal(captured.podName, 'sige-erp-acme-new')
    assert.equal(captured.options.tailLines, 100)
  })

  it('rejects invalid log components', async () => {
    await assert.rejects(
      () =>
        getTenantRuntimeLogs('tenant-1', { component: 'postgres' }, {
          loadTenant: async () => TENANT,
        }),
      (error) => error.code === 'INVALID_COMPONENT',
    )
  })
})

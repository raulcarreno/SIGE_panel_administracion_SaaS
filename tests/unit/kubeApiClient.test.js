import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_TAIL_LINES,
  buildKubectlGetArgs,
  buildKubectlLogsArgs,
  clampTailLines,
  filterTenantEvents,
  inferComponent,
  mapKubeHttpError,
  parseComponent,
  parsePreviousFlag,
  pickNewestPod,
  summarizeDeployment,
  summarizeEvent,
  summarizePod,
  truncateLogs,
} from '../../api/_lib/kubeApiClient.js'

const NAMES = {
  erpDeployment: 'sige-erp-acme',
  webDeployment: 'sige-web-acme',
}

function podFixture(overrides = {}) {
  return {
    metadata: {
      name: 'sige-erp-acme-abc',
      creationTimestamp: '2026-08-26T09:00:00Z',
      labels: {
        app: 'sige-erp-acme',
        'sige.component': 'erp',
        'sige.tenant': 'acme',
      },
      ...overrides.metadata,
    },
    spec: {
      nodeName: 'gke-node-1',
      containers: [{ name: 'erp', image: 'registry/sige-monolith:abc' }],
      ...overrides.spec,
    },
    status: {
      phase: 'Running',
      startTime: '2026-08-26T09:01:00Z',
      containerStatuses: [
        {
          name: 'erp',
          ready: true,
          restartCount: 2,
          image: 'registry/sige-monolith:abc',
          state: { running: { startedAt: '2026-08-26T09:01:00Z' } },
        },
      ],
      ...overrides.status,
    },
  }
}

describe('kubeApiClient helpers', () => {
  it('clamps tailLines between 1 and MAX_TAIL_LINES', () => {
    assert.equal(clampTailLines(undefined), 200)
    assert.equal(clampTailLines('0'), 200)
    assert.equal(clampTailLines('-10'), 200)
    assert.equal(clampTailLines('50'), 50)
    assert.equal(clampTailLines(String(MAX_TAIL_LINES + 100)), MAX_TAIL_LINES)
  })

  it('parses component and previous query flags', () => {
    assert.equal(parseComponent('erp'), 'erp')
    assert.equal(parseComponent('WEB'), 'web')
    assert.equal(parsePreviousFlag('true'), true)
    assert.equal(parsePreviousFlag('1'), true)
    assert.equal(parsePreviousFlag('false'), false)
    assert.equal(parsePreviousFlag(undefined), false)

    assert.throws(
      () => parseComponent('postgres'),
      (error) => {
        assert.equal(error.statusCode, 400)
        assert.equal(error.code, 'INVALID_COMPONENT')
        return true
      },
    )
  })

  it('maps kube HTTP errors without leaking bodies as secrets', () => {
    const forbidden = mapKubeHttpError(403, '{"message":"pods is forbidden"}')
    assert.equal(forbidden.code, 'KUBE_FORBIDDEN')
    assert.equal(forbidden.statusCode, 503)

    const missing = mapKubeHttpError(404, 'not found')
    assert.equal(missing.code, 'KUBE_NOT_FOUND')
    assert.equal(missing.statusCode, 404)

    const down = mapKubeHttpError(500, 'internal')
    assert.equal(down.code, 'KUBE_UNAVAILABLE')
    assert.equal(down.statusCode, 503)
  })

  it('infers component from labels and deployment names', () => {
    assert.equal(inferComponent(podFixture(), NAMES), 'erp')
    assert.equal(
      inferComponent(
        podFixture({
          metadata: {
            name: 'sige-web-acme-xyz',
            labels: { app: 'sige-web-acme' },
          },
        }),
        NAMES,
      ),
      'web',
    )
  })

  it('summarizes a ready pod and a crash-loop pod', () => {
    const ready = summarizePod(podFixture(), NAMES)
    assert.equal(ready.name, 'sige-erp-acme-abc')
    assert.equal(ready.component, 'erp')
    assert.equal(ready.phase, 'Running')
    assert.equal(ready.ready, true)
    assert.equal(ready.restarts, 2)
    assert.equal(ready.image, 'registry/sige-monolith:abc')
    assert.equal(ready.node, 'gke-node-1')
    assert.equal(ready.containerName, 'erp')

    const crash = summarizePod(
      podFixture({
        status: {
          phase: 'Running',
          containerStatuses: [
            {
              name: 'erp',
              ready: false,
              restartCount: 8,
              image: 'registry/sige-monolith:abc',
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        },
      }),
      NAMES,
    )
    assert.equal(crash.ready, false)
    assert.equal(crash.reason, 'CrashLoopBackOff')
    assert.equal(crash.restarts, 8)
  })

  it('summarizes deployments and events', () => {
    const deployment = summarizeDeployment({
      metadata: { name: 'sige-erp-acme' },
      spec: { replicas: 1, template: { spec: { containers: [{ image: 'img:1' }] } } },
      status: { readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1 },
    })
    assert.equal(deployment.name, 'sige-erp-acme')
    assert.equal(deployment.replicas, 1)
    assert.equal(deployment.readyReplicas, 1)
    assert.equal(deployment.image, 'img:1')

    const event = summarizeEvent({
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      count: 4,
      lastTimestamp: '2026-08-26T10:00:00Z',
      involvedObject: { kind: 'Pod', name: 'sige-erp-acme-abc' },
    })
    assert.equal(event.type, 'Warning')
    assert.equal(event.object, 'Pod/sige-erp-acme-abc')
    assert.equal(event.count, 4)
  })

  it('picks the newest pod and filters tenant events', () => {
    const older = podFixture({
      metadata: { name: 'old', creationTimestamp: '2026-08-01T00:00:00Z', labels: { app: 'sige-erp-acme' } },
    })
    const newer = podFixture({
      metadata: { name: 'new', creationTimestamp: '2026-08-26T00:00:00Z', labels: { app: 'sige-erp-acme' } },
    })
    assert.equal(pickNewestPod([older, newer]).metadata.name, 'new')

    const events = [
      { involvedObject: { name: 'sige-erp-acme-abc' }, message: 'ok' },
      { involvedObject: { name: 'sige-erp-other-xyz' }, message: 'skip' },
      { involvedObject: { name: 'sige-web-acme-1' }, message: 'web' },
    ]
    const filtered = filterTenantEvents(events, NAMES)
    assert.equal(filtered.length, 2)
    assert.deepEqual(
      filtered.map((item) => item.message),
      ['ok', 'web'],
    )
  })

  it('builds kubectl args for get and logs', () => {
    assert.deepEqual(
      buildKubectlGetArgs({
        resource: 'pods',
        namespace: 'sige-saas-prod',
        labelSelector: 'sige.tenant=acme',
      }),
      ['get', 'pods', '-n', 'sige-saas-prod', '-l', 'sige.tenant=acme', '-o', 'json'],
    )
    assert.deepEqual(
      buildKubectlLogsArgs({
        namespace: 'sige-saas-prod',
        podName: 'sige-erp-acme-abc',
        container: 'erp',
        tailLines: 200,
        previous: true,
      }),
      [
        'logs',
        'sige-erp-acme-abc',
        '-n',
        'sige-saas-prod',
        '-c',
        'erp',
        '--tail=200',
        '--previous',
      ],
    )
  })

  it('truncates oversized log payloads from the end', () => {
    const text = 'a'.repeat(100)
    assert.equal(truncateLogs(text, 40), 'a'.repeat(40))
    assert.equal(truncateLogs('short', 40), 'short')
  })
})

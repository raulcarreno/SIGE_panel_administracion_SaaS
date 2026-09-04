import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildApacheVhost, vhostFileName } from '../../api/_lib/apacheVhost.js'
import { getRuntimeTarget, imageEnvKey, isHetznerRuntime } from '../../api/_lib/runtimeTarget.js'
import { containerToPod, containerToDeployment } from '../../api/_lib/composeClient.js'

describe('runtimeTarget', () => {
  it('defaults to gke and recognizes hetzner', () => {
    const previous = process.env.RUNTIME_TARGET
    try {
      delete process.env.RUNTIME_TARGET
      assert.equal(getRuntimeTarget(), 'gke')
      assert.equal(isHetznerRuntime(), false)
      process.env.RUNTIME_TARGET = 'hetzner'
      assert.equal(getRuntimeTarget(), 'hetzner')
      assert.equal(isHetznerRuntime(), true)
    } finally {
      if (previous === undefined) delete process.env.RUNTIME_TARGET
      else process.env.RUNTIME_TARGET = previous
    }
  })

  it('maps image env keys for demo and isolated tenants', () => {
    assert.equal(imageEnvKey('erp', 'sige-saas'), 'ERP_IMAGE')
    assert.equal(imageEnvKey('web', 'sige-saas'), 'WEB_IMAGE')
    assert.equal(imageEnvKey('erp', 'reformasbcn'), 'ERP_IMAGE_REFORMASBCN')
    assert.equal(imageEnvKey('web', 'reformasbcn'), 'WEB_IMAGE_REFORMASBCN')
  })
})

describe('apacheVhost', () => {
  it('renders a reverse proxy vhost with aliases', () => {
    const conf = buildApacheVhost({
      serverName: 'www.reformasbcn.findspo.com',
      port: 8083,
      aliases: ['www.reformasbcn.com', 'www.reformasbcn.findspo.com'],
    })
    assert.match(conf, /ServerName www\.reformasbcn\.findspo\.com/)
    assert.match(conf, /ServerAlias www\.reformasbcn\.com/)
    assert.match(conf, /ProxyPass \/ http:\/\/127\.0\.0\.1:8083\//)
    assert.doesNotMatch(conf, /RewriteRule \^\/\(admin/)
    assert.equal(vhostFileName('erp.acme.findspo.com'), '100-erp.acme.findspo.com.conf')
  })

  it('blocks /admin on www hosts when blockWwwAdmin is set', () => {
    const conf = buildApacheVhost({
      serverName: 'www.acme.findspo.com',
      port: 8083,
      aliases: ['cms.acme.info', 'www.acme.info'],
      blockWwwAdmin: true,
    })
    assert.match(conf, /RewriteCond %\{HTTP_HOST\} \^www\\\. \[NC\]/)
    assert.match(conf, /RewriteRule \^\/\(admin\|api\/admin\)\(\/\.\*\)\?\$ - \[F,L\]/)
    assert.match(conf, /ServerAlias cms\.acme\.info www\.acme\.info/)
  })
})

describe('composeClient mapping', () => {
  it('maps compose ps JSON to a kube-like pod and deployment', () => {
    const entry = {
      Name: 'sige-sige-erp-reformasbcn-1',
      Service: 'sige-erp-reformasbcn',
      State: 'running',
      Health: 'healthy',
      Image: 'registry/sige-monolith:abc',
      CreatedAt: '2026-09-04 10:00:00 +0000 UTC',
      Labels: 'sige.component=erp,sige.tenant=reformasbcn',
      Status: 'Up 2 hours (healthy)',
    }
    const pod = containerToPod(entry)
    assert.equal(pod.metadata.labels['sige.tenant'], 'reformasbcn')
    assert.equal(pod.metadata.labels['sige.component'], 'erp')
    assert.equal(pod.status.phase, 'Running')
    assert.equal(pod.status.containerStatuses[0].ready, true)

    const deploy = containerToDeployment(entry)
    assert.equal(deploy.metadata.name, 'sige-erp-reformasbcn')
    assert.equal(deploy.status.readyReplicas, 1)
  })
})

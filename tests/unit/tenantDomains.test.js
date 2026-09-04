import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildManualDnsInstructions,
  buildTenantDomainManifest,
  cmsAdminHostFromWebHost,
  cmsAdminUrlFromWebHost,
  deriveSaasHosts,
  evaluateDnsVerification,
  ionosRecordNameForHost,
  isValidHostname,
  normalizeHostname,
} from '../../api/_lib/tenantDomains.js'

describe('tenantDomains', () => {
  it('derives erp.<slug> and www.<slug> hosts', () => {
    const hosts = deriveSaasHosts('Acme-Co', 'findspo.com')
    assert.equal(hosts.erpHost, 'erp.acme-co.findspo.com')
    assert.equal(hosts.webHost, 'www.acme-co.findspo.com')
    assert.equal(hosts.saasBaseDomain, 'findspo.com')
  })

  it('maps www web host to cms admin host', () => {
    assert.equal(cmsAdminHostFromWebHost('www.acme.findspo.com'), 'cms.acme.findspo.com')
    assert.equal(cmsAdminUrlFromWebHost('www.acme.findspo.com'), 'https://cms.acme.findspo.com/admin')
    assert.equal(cmsAdminHostFromWebHost('cms.acme.info'), 'cms.acme.info')
  })

  it('validates hostnames', () => {
    assert.equal(isValidHostname('www.cliente.com'), true)
    assert.equal(isValidHostname('https://bad.example.com/path'), true)
    assert.equal(isValidHostname('not a host'), false)
    assert.equal(isValidHostname('*.findspo.com'), false)
  })

  it('builds ionos relative record names', () => {
    assert.equal(
      ionosRecordNameForHost('erp.acme.findspo.com', 'findspo.com'),
      'erp.acme',
    )
    assert.equal(
      ionosRecordNameForHost('www.acme.findspo.com', 'findspo.com'),
      'www.acme',
    )
  })

  it('builds manual DNS instructions for IONOS operators', () => {
    const instructions = buildManualDnsInstructions({
      erpHost: 'erp.acme.findspo.com',
      webHost: 'www.acme.findspo.com',
      ingressIp: '8.8.8.8',
      zoneName: 'findspo.com',
      customDomains: [{ hostname: 'www.cliente.com', kind: 'web' }],
    })
    assert.equal(instructions.provider, 'IONOS (manual)')
    assert.equal(instructions.aRecords.length, 2)
    assert.equal(instructions.aRecords[0].name, 'erp.acme')
    assert.equal(instructions.aRecords[0].value, '8.8.8.8')
    assert.equal(instructions.cnameRecords[0].value, 'www.acme.findspo.com')
  })

  it('builds ingress + managed cert manifest with custom hosts', () => {
    const manifest = buildTenantDomainManifest({
      slug: 'acme',
      namespace: 'sige-saas-prod',
      erpHost: 'erp.acme.findspo.com',
      webHost: 'www.acme.findspo.com',
      customHosts: [{ hostname: 'www.cliente.com', kind: 'web' }],
    })

    assert.equal(manifest.certName, 'sige-cert-acme')
    assert.equal(manifest.ingressName, 'sige-tenant-acme')
    assert.equal(manifest.erpService, 'sige-erp-acme')
    assert.equal(manifest.webService, 'sige-web-acme')
    assert.deepEqual(manifest.domains, [
      'erp.acme.findspo.com',
      'www.acme.findspo.com',
      'www.cliente.com',
    ])
    assert.match(manifest.yaml, /kind: ManagedCertificate/)
    assert.match(manifest.yaml, /host: www\.cliente\.com/)
    assert.match(manifest.yaml, /name: sige-web-acme/)
    assert.match(manifest.yaml, /networking\.gke\.io\/managed-certificates: sige-cert-acme/)
  })

  it('uses shared services when PLATFORM_TENANT_ISOLATED=0', () => {
    process.env.PLATFORM_TENANT_ISOLATED = '0'
    process.env.PLATFORM_ERP_SERVICE = 'sige-erp'
    process.env.PLATFORM_WEB_SERVICE = 'sige-web'
    try {
      const manifest = buildTenantDomainManifest({
        slug: 'acme',
        namespace: 'sige-saas-prod',
        erpHost: 'erp.acme.findspo.com',
        webHost: 'www.acme.findspo.com',
      })
      assert.equal(manifest.erpService, 'sige-erp')
      assert.equal(manifest.webService, 'sige-web')
    } finally {
      delete process.env.PLATFORM_TENANT_ISOLATED
      delete process.env.PLATFORM_ERP_SERVICE
      delete process.env.PLATFORM_WEB_SERVICE
    }
  })

  it('maps platform demo slug to sige-erp/sige-web and apex hosts', async () => {
    const { tenantErpServiceName, tenantWebServiceName, deriveSaasHosts: derive } = await import(
      '../../api/_lib/tenantDomains.js'
    )
    process.env.PLATFORM_DEMO_SLUG = 'sige-saas'
    try {
      assert.equal(tenantErpServiceName('sige-saas'), 'sige-erp')
      assert.equal(tenantWebServiceName('sige-saas'), 'sige-web')
      const hosts = derive('sige-saas', 'findspo.com')
      assert.equal(hosts.erpHost, 'sige-saas.findspo.com')
      assert.equal(hosts.webHost, 'www.sige-saas.findspo.com')
      // other tenants stay isolated
      assert.equal(tenantErpServiceName('reformasbcn'), 'sige-erp-reformasbcn')
    } finally {
      delete process.env.PLATFORM_DEMO_SLUG
    }
  })

  it('evaluates CNAME verification as ok', async () => {
    const dnsApi = {
      async resolveCname() {
        return ['www.acme.findspo.com.']
      },
      async resolve4() {
        throw Object.assign(new Error('no A'), { code: 'ENODATA' })
      },
    }
    const result = await evaluateDnsVerification(
      'www.cliente.com',
      'www.acme.findspo.com',
      '1.2.3.4',
      dnsApi,
    )
    assert.equal(result.ok, true)
    assert.equal(result.method, 'cname')
  })

  it('evaluates A record verification as ok', async () => {
    const dnsApi = {
      async resolveCname() {
        throw Object.assign(new Error('no cname'), { code: 'ENODATA' })
      },
      async resolve4() {
        return ['8.8.8.8']
      },
    }
    const result = await evaluateDnsVerification(
      'www.cliente.com',
      'www.acme.findspo.com',
      '8.8.8.8',
      dnsApi,
    )
    assert.equal(result.ok, true)
    assert.equal(result.method, 'a')
  })

  it('fails verification when DNS does not match', async () => {
    const dnsApi = {
      async resolveCname() {
        return ['other.example.com']
      },
      async resolve4() {
        return ['9.9.9.9']
      },
    }
    const result = await evaluateDnsVerification(
      'www.cliente.com',
      'www.acme.findspo.com',
      '1.2.3.4',
      dnsApi,
    )
    assert.equal(result.ok, false)
    assert.match(result.error, /expected/)
  })

  it('normalizes hostnames', () => {
    assert.equal(normalizeHostname('HTTPS://WWW.Example.COM/path'), 'www.example.com')
  })
})

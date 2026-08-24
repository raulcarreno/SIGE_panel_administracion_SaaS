import dns from 'node:dns/promises'
import {
  buildManualDnsInstructions,
  buildTenantDomainManifest,
  deriveSaasHosts,
  evaluateDnsVerification,
  getSaasBaseDomain,
  httpsUrlForHost,
  isValidHostname,
  normalizeHostname,
} from './tenantDomains.js'
import * as gke from './gkeDomainClient.js'
import {
  addCustomDomain,
  deleteCustomDomain,
  getCustomDomain,
  listCustomDomains,
  mapDomainFields,
  updateCustomDomain,
  updateTenantDomainState,
} from './domainsRepository.js'
import {
  createDeployJob,
  listDeployJobs,
  updateDeployJob,
} from './versioningRepository.js'
import { writeAuditLog } from './auditLog.js'
import { getDb } from './db.js'

function zoneName() {
  return process.env.DNS_ZONE_NAME?.trim() || getSaasBaseDomain()
}

async function loadTenantDomainRow(tenantId) {
  const db = getDb()
  const result = await db.execute('SELECT * FROM tenants WHERE id = ? LIMIT 1', [tenantId])
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    baseUrl: row.base_url,
    webBaseUrl: row.web_base_url,
    ...mapDomainFields(row),
  }
}

function dnsInstructionsFor(tenant, derived, ingressIp, customDomains = []) {
  return buildManualDnsInstructions({
    erpHost: tenant.erpHost || derived.erpHost,
    webHost: tenant.webHost || derived.webHost,
    ingressIp,
    zoneName: zoneName(),
    customDomains,
  })
}

export async function getDomainsStatus(tenantId) {
  const tenant = await loadTenantDomainRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const customDomains = await listCustomDomains(tenantId)
  const jobs = (await listDeployJobs(tenantId, { limit: 20 })).filter((job) =>
    ['provision_domains', 'verify_custom_domain'].includes(job.action),
  )

  let ingressIp = process.env.INGRESS_IP?.trim() || null
  if (!ingressIp) {
    try {
      ingressIp = await gke.resolveIngressIp()
    } catch {
      ingressIp = null
    }
  }

  const derived = deriveSaasHosts(tenant.slug, tenant.saasBaseDomain)

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      saasBaseDomain: tenant.saasBaseDomain || derived.saasBaseDomain,
      erpHost: tenant.erpHost || derived.erpHost,
      webHost: tenant.webHost || derived.webHost,
      baseUrl: tenant.baseUrl,
      webBaseUrl: tenant.webBaseUrl,
      domainStatus: tenant.domainStatus,
      domainError: tenant.domainError,
      domainsProvisionedAt: tenant.domainsProvisionedAt,
    },
    saas: {
      erpHost: tenant.erpHost || derived.erpHost,
      webHost: tenant.webHost || derived.webHost,
      erpUrl: httpsUrlForHost(tenant.erpHost || derived.erpHost),
      webUrl: httpsUrlForHost(tenant.webHost || derived.webHost),
    },
    customDomains,
    ingressIp,
    dnsManual: true,
    dnsInstructions: dnsInstructionsFor(tenant, derived, ingressIp, customDomains),
    jobs,
  }
}

async function applyIngressAndCert(tenant, customDomains) {
  const config = gke.getGkeConfig()
  const provisionedCustom = customDomains
    .filter((d) => d.status === 'verified' || d.status === 'provisioned')
    .map((d) => ({ hostname: d.hostname, kind: d.kind }))

  const manifest = buildTenantDomainManifest({
    slug: tenant.slug,
    namespace: config.namespace,
    erpHost: tenant.erpHost,
    webHost: tenant.webHost,
    customHosts: provisionedCustom,
    erpService: config.erpService,
    webService: config.webService,
  })

  const applyResult = await gke.applyDomainManifest(manifest.yaml)
  return { manifest, applyResult }
}

export async function provisionTenantDomains(tenantId, { actorEmail }) {
  const tenant = await loadTenantDomainRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const derived = deriveSaasHosts(tenant.slug, tenant.saasBaseDomain || getSaasBaseDomain())
  const erpHost = derived.erpHost
  const webHost = derived.webHost

  const job = await createDeployJob({
    tenantId,
    component: 'both',
    action: 'provision_domains',
    actorEmail,
    requestPayload: { erpHost, webHost, dnsManual: true },
  })

  await updateDeployJob(job.id, { status: 'running', startedAt: true })
  await updateTenantDomainState(tenantId, {
    saasBaseDomain: derived.saasBaseDomain,
    erpHost,
    webHost,
    domainStatus: 'provisioning',
    domainError: null,
  })

  try {
    const ingressIp = await gke.resolveIngressIp()
    const customDomains = await listCustomDomains(tenantId)
    const { manifest, applyResult } = await applyIngressAndCert(
      { ...tenant, erpHost, webHost },
      customDomains,
    )

    for (const custom of customDomains.filter((d) => d.status === 'verified')) {
      await updateCustomDomain(custom.id, { status: 'provisioned', errorMessage: null })
    }

    await updateTenantDomainState(tenantId, {
      erpHost,
      webHost,
      baseUrl: httpsUrlForHost(erpHost),
      webBaseUrl: httpsUrlForHost(webHost),
      domainStatus: 'active',
      domainError: null,
      domainsProvisionedAt: true,
    })

    const dnsInstructions = buildManualDnsInstructions({
      erpHost,
      webHost,
      ingressIp,
      zoneName: zoneName(),
      customDomains,
    })

    const resultPayload = {
      erpHost,
      webHost,
      ingressIp,
      dnsManual: true,
      dnsInstructions,
      certName: manifest.certName,
      ingressName: manifest.ingressName,
      domains: manifest.domains,
      kubectl: applyResult.stdout,
    }

    await updateDeployJob(job.id, {
      status: 'succeeded',
      finishedAt: true,
      resultPayload,
    })

    await writeAuditLog({
      tenantId,
      action: 'tenant.domains.provisioned',
      actorEmail,
      payload: resultPayload,
    })

    return {
      job: (await listDeployJobs(tenantId, { limit: 1 }))[0],
      ...resultPayload,
      domains: await getDomainsStatus(tenantId),
    }
  } catch (error) {
    await updateTenantDomainState(tenantId, {
      domainStatus: 'failed',
      domainError: error.message,
    })
    await updateDeployJob(job.id, {
      status: 'failed',
      finishedAt: true,
      errorMessage: error.message,
      resultPayload: { code: error.code || null },
    })
    throw error
  }
}

export async function registerCustomDomain(tenantId, { kind, hostname, actorEmail }) {
  const tenant = await loadTenantDomainRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const derived = deriveSaasHosts(tenant.slug, tenant.saasBaseDomain || getSaasBaseDomain())
  const erpHost = tenant.erpHost || derived.erpHost
  const webHost = tenant.webHost || derived.webHost
  const normalized = normalizeHostname(hostname)

  if (!isValidHostname(normalized)) {
    const error = new Error('Invalid custom hostname.')
    error.statusCode = 400
    throw error
  }

  if (normalized === erpHost || normalized === webHost) {
    const error = new Error('Custom hostname cannot match the SaaS host.')
    error.statusCode = 400
    throw error
  }

  if (kind !== 'erp' && kind !== 'web') {
    const error = new Error('kind must be erp or web.')
    error.statusCode = 400
    throw error
  }

  const verificationTarget = kind === 'erp' ? erpHost : webHost
  const domain = await addCustomDomain(tenantId, {
    kind,
    hostname: normalized,
    verificationTarget,
  })

  await writeAuditLog({
    tenantId,
    action: 'tenant.domains.custom.added',
    actorEmail,
    payload: { domainId: domain.id, hostname: domain.hostname, kind },
  })

  return {
    domain,
    instructions: {
      cname: {
        type: 'CNAME',
        name: normalized,
        value: verificationTarget,
      },
      aAlternative: {
        type: 'A',
        name: normalized,
        valueHint: 'Same Ingress IP as SaaS hosts (after provision)',
      },
    },
  }
}

export async function verifyAndProvisionCustomDomain(tenantId, domainId, { actorEmail }) {
  const tenant = await loadTenantDomainRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const domain = await getCustomDomain(tenantId, domainId)
  if (!domain) {
    const error = new Error('Custom domain not found.')
    error.statusCode = 404
    throw error
  }

  const job = await createDeployJob({
    tenantId,
    component: domain.kind,
    action: 'verify_custom_domain',
    actorEmail,
    requestPayload: { domainId, hostname: domain.hostname },
  })
  await updateDeployJob(job.id, { status: 'running', startedAt: true })

  try {
    let ingressIp = process.env.INGRESS_IP?.trim() || null
    try {
      ingressIp = ingressIp || (await gke.resolveIngressIp())
    } catch {
      // A-record verification optional if IP unknown
    }

    const evaluation = await evaluateDnsVerification(
      domain.hostname,
      domain.verificationTarget,
      ingressIp,
      dns,
    )

    await updateCustomDomain(domainId, {
      lastCheckedAt: true,
      status: evaluation.ok ? 'verified' : 'failed',
      errorMessage: evaluation.ok ? null : evaluation.error,
    })

    if (!evaluation.ok) {
      const error = new Error(evaluation.error)
      error.statusCode = 400
      error.code = 'DNS_NOT_VERIFIED'
      throw error
    }

    const derived = deriveSaasHosts(tenant.slug, tenant.saasBaseDomain || getSaasBaseDomain())
    const erpHost = tenant.erpHost || derived.erpHost
    const webHost = tenant.webHost || derived.webHost

    const customDomains = await listCustomDomains(tenantId)
    const { manifest, applyResult } = await applyIngressAndCert(
      { ...tenant, erpHost, webHost },
      customDomains.map((d) =>
        d.id === domainId ? { ...d, status: 'verified' } : d,
      ),
    )

    await updateCustomDomain(domainId, { status: 'provisioned', errorMessage: null })

    const resultPayload = {
      hostname: domain.hostname,
      method: evaluation.method,
      certName: manifest.certName,
      ingressName: manifest.ingressName,
      kubectl: applyResult.stdout,
    }

    await updateDeployJob(job.id, {
      status: 'succeeded',
      finishedAt: true,
      resultPayload,
    })

    await writeAuditLog({
      tenantId,
      action: 'tenant.domains.custom.provisioned',
      actorEmail,
      payload: resultPayload,
    })

    return {
      job: (await listDeployJobs(tenantId, { limit: 1 }))[0],
      domain: await getCustomDomain(tenantId, domainId),
      ...resultPayload,
      domains: await getDomainsStatus(tenantId),
    }
  } catch (error) {
    await updateDeployJob(job.id, {
      status: 'failed',
      finishedAt: true,
      errorMessage: error.message,
      resultPayload: { code: error.code || null },
    })
    throw error
  }
}

export async function removeCustomDomain(tenantId, domainId, { actorEmail }) {
  const tenant = await loadTenantDomainRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const removed = await deleteCustomDomain(tenantId, domainId)

  const derived = deriveSaasHosts(tenant.slug, tenant.saasBaseDomain || getSaasBaseDomain())
  const erpHost = tenant.erpHost || derived.erpHost
  const webHost = tenant.webHost || derived.webHost

  if (tenant.domainStatus === 'active') {
    const customDomains = await listCustomDomains(tenantId)
    await applyIngressAndCert({ ...tenant, erpHost, webHost }, customDomains)
  }

  await writeAuditLog({
    tenantId,
    action: 'tenant.domains.custom.removed',
    actorEmail,
    payload: { domainId, hostname: removed.hostname },
  })

  return { removed, domains: await getDomainsStatus(tenantId) }
}

import { getDb } from './db.js'
import {
  deriveSaasHosts,
  getSaasBaseDomain,
  httpsUrlForHost,
  normalizeHostname,
  isValidHostname,
} from './tenantDomains.js'

function mapCustomDomain(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kind: row.kind,
    hostname: row.hostname,
    status: row.status,
    verificationTarget: row.verification_target,
    lastCheckedAt: row.last_checked_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapDomainFields(row) {
  if (!row) return {}
  return {
    saasBaseDomain: row.saas_base_domain || getSaasBaseDomain(),
    erpHost: row.erp_host || null,
    webHost: row.web_host || null,
    domainStatus: row.domain_status || 'draft',
    domainError: row.domain_error || null,
    domainsProvisionedAt: row.domains_provisioned_at || null,
  }
}

export async function listCustomDomains(tenantId) {
  const db = getDb()
  const result = await db.execute(
    `SELECT * FROM tenant_custom_domains
     WHERE tenant_id = ?
     ORDER BY created_at ASC`,
    [tenantId],
  )
  return result.rows.map(mapCustomDomain)
}

export async function getCustomDomain(tenantId, domainId) {
  const db = getDb()
  const result = await db.execute(
    `SELECT * FROM tenant_custom_domains
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, domainId],
  )
  return mapCustomDomain(result.rows[0])
}

export async function addCustomDomain(tenantId, { kind, hostname, verificationTarget }) {
  const normalized = normalizeHostname(hostname)
  if (!isValidHostname(normalized)) {
    const error = new Error('Invalid custom hostname.')
    error.statusCode = 400
    throw error
  }
  if (kind !== 'erp' && kind !== 'web') {
    const error = new Error('kind must be erp or web.')
    error.statusCode = 400
    throw error
  }

  const db = getDb()
  try {
    const result = await db.execute(
      `INSERT INTO tenant_custom_domains (
        tenant_id, kind, hostname, status, verification_target
      ) VALUES (?, ?, ?, 'pending_dns', ?)
      RETURNING *`,
      [tenantId, kind, normalized, verificationTarget],
    )
    return mapCustomDomain(result.rows[0])
  } catch (error) {
    if (String(error.message || '').includes('unique') || error.code === '23505') {
      const conflict = new Error('Hostname already registered.')
      conflict.statusCode = 409
      throw conflict
    }
    throw error
  }
}

export async function updateCustomDomain(domainId, patch = {}) {
  const db = getDb()
  const sets = []
  const args = []

  if (patch.status !== undefined) {
    sets.push('status = ?')
    args.push(patch.status)
  }
  if (patch.errorMessage !== undefined) {
    sets.push('error_message = ?')
    args.push(patch.errorMessage)
  }
  if (patch.lastCheckedAt === true) {
    sets.push('last_checked_at = NOW()')
  }
  if (patch.verificationTarget !== undefined) {
    sets.push('verification_target = ?')
    args.push(patch.verificationTarget)
  }

  if (!sets.length) return getCustomDomainById(domainId)

  sets.push('updated_at = NOW()')
  args.push(domainId)

  const result = await db.execute(
    `UPDATE tenant_custom_domains SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    args,
  )
  return mapCustomDomain(result.rows[0])
}

async function getCustomDomainById(domainId) {
  const db = getDb()
  const result = await db.execute(
    'SELECT * FROM tenant_custom_domains WHERE id = ? LIMIT 1',
    [domainId],
  )
  return mapCustomDomain(result.rows[0])
}

export async function deleteCustomDomain(tenantId, domainId) {
  const db = getDb()
  const existing = await getCustomDomain(tenantId, domainId)
  if (!existing) {
    const error = new Error('Custom domain not found.')
    error.statusCode = 404
    throw error
  }
  await db.execute('DELETE FROM tenant_custom_domains WHERE id = ? AND tenant_id = ?', [
    domainId,
    tenantId,
  ])
  return existing
}

export async function updateTenantDomainState(tenantId, patch = {}) {
  const db = getDb()
  const sets = []
  const args = []

  const map = {
    saasBaseDomain: 'saas_base_domain',
    erpHost: 'erp_host',
    webHost: 'web_host',
    domainStatus: 'domain_status',
    domainError: 'domain_error',
    baseUrl: 'base_url',
    webBaseUrl: 'web_base_url',
  }

  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      sets.push(`${column} = ?`)
      args.push(patch[key])
    }
  }

  if (patch.domainsProvisionedAt === true) {
    sets.push('domains_provisioned_at = NOW()')
  } else if (patch.domainsProvisionedAt !== undefined) {
    sets.push('domains_provisioned_at = ?')
    args.push(patch.domainsProvisionedAt)
  }

  if (!sets.length) return null

  sets.push('updated_at = NOW()')
  args.push(tenantId)

  const result = await db.execute(
    `UPDATE tenants SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    args,
  )
  return result.rows[0]
}

export function ensureDerivedHostsForSlug(slug, saasBaseDomain) {
  const hosts = deriveSaasHosts(slug, saasBaseDomain || getSaasBaseDomain())
  return {
    ...hosts,
    baseUrl: httpsUrlForHost(hosts.erpHost),
    webBaseUrl: httpsUrlForHost(hosts.webHost),
  }
}

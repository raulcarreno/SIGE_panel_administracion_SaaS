import {
  getTenantCredentials,
  getTenantWithSnapshot,
} from './tenantsRepository.js'

export async function resolveTenantCredentials(tenantId) {
  const credentials = await getTenantCredentials(tenantId)
  if (!credentials) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }
  return credentials
}

export async function loadTenantContext(tenantId) {
  const tenant = await getTenantWithSnapshot(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }
  return tenant
}

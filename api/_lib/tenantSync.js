import { getDb } from './db.js'
import { getStatus } from './controlApiClient.js'

export async function syncTenantSnapshot(tenantId, credentials) {
  const db = getDb()

  try {
    const status = await getStatus(credentials)
    await db.execute(
      `INSERT INTO tenant_snapshots (tenant_id, payload, sync_error)
       VALUES (?, ?::jsonb, NULL)`,
      [tenantId, JSON.stringify(status)],
    )
    return { ok: true, status }
  } catch (error) {
    await db.execute(
      `INSERT INTO tenant_snapshots (tenant_id, payload, sync_error)
       VALUES (?, NULL, ?)`,
      [tenantId, error.message],
    )
    throw error
  }
}

export async function syncAllTenants(tenantsWithCredentials) {
  const results = []

  for (const item of tenantsWithCredentials) {
    try {
      const status = await syncTenantSnapshot(item.id, item)
      results.push({ tenantId: item.id, ok: true, status })
    } catch (error) {
      results.push({
        tenantId: item.id,
        ok: false,
        error: error.message,
        code: error.code,
      })
    }
  }

  return results
}

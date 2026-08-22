import { getDb } from './db.js'
import { encryptSecret, decryptSecret } from './secretsCrypto.js'

function mapTenantRow(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    baseUrl: row.base_url,
    databaseName: row.database_name,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, '')
}

function normalizeSlug(slug) {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

export async function listTenants({ status } = {}) {
  const db = getDb()
  let sql = `
    SELECT t.*,
      s.payload AS snapshot_payload,
      s.sync_error AS snapshot_sync_error,
      s.synced_at AS snapshot_synced_at
    FROM tenants t
    LEFT JOIN LATERAL (
      SELECT payload, sync_error, synced_at
      FROM tenant_snapshots
      WHERE tenant_id = t.id
      ORDER BY synced_at DESC
      LIMIT 1
    ) s ON true
  `
  const args = []

  if (status) {
    sql += ' WHERE t.status = ?'
    args.push(status)
  }

  sql += ' ORDER BY t.created_at DESC'

  const result = await db.execute(sql, args)
  return result.rows.map((row) => ({
    ...mapTenantRow(row),
    snapshot: row.snapshot_payload
      ? {
          payload: row.snapshot_payload,
          syncError: row.snapshot_sync_error,
          syncedAt: row.snapshot_synced_at,
        }
      : null,
  }))
}

export async function getTenantById(id) {
  const db = getDb()
  const result = await db.execute('SELECT * FROM tenants WHERE id = ? LIMIT 1', [id])
  return mapTenantRow(result.rows[0])
}

export async function getTenantWithSnapshot(id) {
  const tenant = await getTenantById(id)
  if (!tenant) return null

  const db = getDb()
  const snapshotResult = await db.execute(
    `SELECT payload, sync_error, synced_at
     FROM tenant_snapshots
     WHERE tenant_id = ?
     ORDER BY synced_at DESC
     LIMIT 1`,
    [id],
  )

  const snapshotRow = snapshotResult.rows[0]
  return {
    ...tenant,
    snapshot: snapshotRow
      ? {
          payload: snapshotRow.payload,
          syncError: snapshotRow.sync_error,
          syncedAt: snapshotRow.synced_at,
        }
      : null,
  }
}

export async function getTenantCredentials(id) {
  const db = getDb()
  const result = await db.execute(
    'SELECT id, slug, base_url, control_token_encrypted FROM tenants WHERE id = ? LIMIT 1',
    [id],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    baseUrl: row.base_url,
    controlToken: decryptSecret(row.control_token_encrypted),
  }
}

export async function createTenant(payload) {
  const slug = normalizeSlug(payload.slug)
  const baseUrl = normalizeBaseUrl(payload.baseUrl)
  const controlToken = payload.controlToken?.trim()

  if (!slug || !baseUrl || !controlToken) {
    const error = new Error('slug, baseUrl and controlToken are required.')
    error.statusCode = 400
    throw error
  }

  const db = getDb()
  const result = await db.execute(
    `INSERT INTO tenants (
      slug, display_name, base_url, control_token_encrypted,
      database_name, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *`,
    [
      slug,
      payload.displayName?.trim() || slug,
      baseUrl,
      encryptSecret(controlToken),
      payload.databaseName?.trim() || `sige_${slug}`,
      payload.status || 'active',
      payload.notes?.trim() || null,
    ],
  )

  return mapTenantRow(result.rows[0])
}

export async function updateTenant(id, payload) {
  const current = await getTenantById(id)
  if (!current) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const db = getDb()
  const args = []
  const sets = []

  if (payload.displayName !== undefined) {
    sets.push(`display_name = ?`)
    args.push(payload.displayName.trim())
  }
  if (payload.baseUrl !== undefined) {
    sets.push(`base_url = ?`)
    args.push(normalizeBaseUrl(payload.baseUrl))
  }
  if (payload.databaseName !== undefined) {
    sets.push(`database_name = ?`)
    args.push(payload.databaseName.trim())
  }
  if (payload.status !== undefined) {
    sets.push(`status = ?`)
    args.push(payload.status)
  }
  if (payload.notes !== undefined) {
    sets.push(`notes = ?`)
    args.push(payload.notes?.trim() || null)
  }
  if (payload.controlToken !== undefined && payload.controlToken.trim()) {
    sets.push(`control_token_encrypted = ?`)
    args.push(encryptSecret(payload.controlToken.trim()))
  }

  if (!sets.length) return current

  sets.push('updated_at = NOW()')
  args.push(id)

  const result = await db.execute(
    `UPDATE tenants SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    args,
  )

  return mapTenantRow(result.rows[0])
}

export async function archiveTenant(id) {
  return updateTenant(id, { status: 'archived' })
}

export async function getDashboardStats() {
  const tenants = await listTenants({ status: undefined })
  const activeTenants = tenants.filter((t) => t.status !== 'archived')

  let maintenanceCount = 0
  let pendingMigrationsCount = 0
  let expiredCount = 0
  const now = new Date()

  for (const tenant of activeTenants) {
    const payload = tenant.snapshot?.payload
    if (!payload) continue
    if (payload.maintenanceMode) maintenanceCount += 1
    if (typeof payload.migrationsPending === 'number' && payload.migrationsPending > 0) {
      pendingMigrationsCount += 1
    }
    if (payload.validUntil && new Date(payload.validUntil) < now) expiredCount += 1
    if (payload.suspendedAt) expiredCount += 1
  }

  return {
    totalTenants: activeTenants.length,
    maintenanceCount,
    pendingMigrationsCount,
    expiredCount,
  }
}

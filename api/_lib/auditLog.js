import { getDb } from './db.js'

export async function writeAuditLog({ tenantId, action, actorEmail, payload }) {
  const db = getDb()
  await db.execute(
    `INSERT INTO audit_log (tenant_id, action, actor_email, payload)
     VALUES (?, ?, ?, ?::jsonb)`,
    [tenantId || null, action, actorEmail, JSON.stringify(payload || {})],
  )
}

export async function listAuditLog(tenantId, { limit = 50 } = {}) {
  const db = getDb()
  const result = await db.execute(
    `SELECT id, tenant_id, action, actor_email, payload, created_at
     FROM audit_log
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [tenantId, limit],
  )

  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    action: row.action,
    actorEmail: row.actor_email,
    payload: row.payload,
    createdAt: row.created_at,
  }))
}

export async function upsertPanelUser({ email, googleSub }) {
  const db = getDb()
  await db.execute(
    `INSERT INTO panel_users (email, google_sub, last_login_at)
     VALUES (?, ?, NOW())
     ON CONFLICT (email) DO UPDATE SET
       google_sub = COALESCE(EXCLUDED.google_sub, panel_users.google_sub),
       last_login_at = NOW()`,
    [email.toLowerCase(), googleSub || null],
  )
}

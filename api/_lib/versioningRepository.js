import { getDb } from './db.js'

function mapJob(row) {
  if (!row) return null
  return {
    id: row.id,
    tenantId: row.tenant_id,
    component: row.component,
    action: row.action,
    status: row.status,
    actorEmail: row.actor_email,
    requestPayload: row.request_payload,
    resultPayload: row.result_payload,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

export function mapVersioningFields(row) {
  if (!row) return {}
  return {
    erpBranch: row.erp_branch || 'main',
    webBranch: row.web_branch || 'main',
    erpDeployedSha: row.erp_deployed_sha || null,
    webDeployedSha: row.web_deployed_sha || null,
    erpDeployedVersion: row.erp_deployed_version || null,
    webDeployedVersion: row.web_deployed_version || null,
    erpDesiredSha: row.erp_desired_sha || null,
    webDesiredSha: row.web_desired_sha || null,
    lastDeployStatus: row.last_deploy_status || null,
    lastDeployError: row.last_deploy_error || null,
    lastDeployAt: row.last_deploy_at || null,
  }
}

export async function getTenantVersioningRow(tenantId) {
  const db = getDb()
  const result = await db.execute(
    `SELECT id, slug, erp_branch, web_branch,
            erp_deployed_sha, web_deployed_sha,
            erp_deployed_version, web_deployed_version,
            erp_desired_sha, web_desired_sha,
            last_deploy_status, last_deploy_error, last_deploy_at
     FROM tenants WHERE id = ? LIMIT 1`,
    [tenantId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    ...mapVersioningFields(row),
  }
}

export async function updateTenantVersioning(tenantId, patch = {}) {
  const db = getDb()
  const sets = []
  const args = []

  const map = {
    erpBranch: 'erp_branch',
    webBranch: 'web_branch',
    erpDeployedSha: 'erp_deployed_sha',
    webDeployedSha: 'web_deployed_sha',
    erpDeployedVersion: 'erp_deployed_version',
    webDeployedVersion: 'web_deployed_version',
    erpDesiredSha: 'erp_desired_sha',
    webDesiredSha: 'web_desired_sha',
    lastDeployStatus: 'last_deploy_status',
    lastDeployError: 'last_deploy_error',
    lastDeployAt: 'last_deploy_at',
  }

  for (const [key, column] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      sets.push(`${column} = ?`)
      args.push(patch[key])
    }
  }

  if (!sets.length) return getTenantVersioningRow(tenantId)

  sets.push('updated_at = NOW()')
  args.push(tenantId)

  await db.execute(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, args)
  return getTenantVersioningRow(tenantId)
}

export async function createDeployJob({
  tenantId,
  component,
  action,
  actorEmail,
  requestPayload = {},
}) {
  const db = getDb()
  const result = await db.execute(
    `INSERT INTO tenant_deploy_jobs (
      tenant_id, component, action, status, actor_email, request_payload
    ) VALUES (?, ?, ?, 'queued', ?, ?::jsonb)
    RETURNING *`,
    [tenantId, component, action, actorEmail, JSON.stringify(requestPayload)],
  )
  return mapJob(result.rows[0])
}

export async function updateDeployJob(jobId, patch = {}) {
  const db = getDb()
  const sets = []
  const args = []

  if (patch.status !== undefined) {
    sets.push('status = ?')
    args.push(patch.status)
  }
  if (patch.resultPayload !== undefined) {
    sets.push('result_payload = ?::jsonb')
    args.push(JSON.stringify(patch.resultPayload))
  }
  if (patch.errorMessage !== undefined) {
    sets.push('error_message = ?')
    args.push(patch.errorMessage)
  }
  if (patch.startedAt === true) {
    sets.push('started_at = NOW()')
  }
  if (patch.finishedAt === true) {
    sets.push('finished_at = NOW()')
  }

  if (!sets.length) return null
  args.push(jobId)

  const result = await db.execute(
    `UPDATE tenant_deploy_jobs SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
    args,
  )
  return mapJob(result.rows[0])
}

export async function listDeployJobs(tenantId, { limit = 20 } = {}) {
  const db = getDb()
  const result = await db.execute(
    `SELECT * FROM tenant_deploy_jobs
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [tenantId, Math.min(100, Math.max(1, Number(limit) || 20))],
  )
  return result.rows.map(mapJob)
}

import { sendJson, handleApiError } from '../../../api/_lib/apiHelpers.js'
import {
  archiveTenant,
  createTenant,
  getDashboardStats,
  getTenantWithSnapshot,
  listTenants,
  updateTenant,
} from '../../../api/_lib/tenantsRepository.js'
import { listAuditLog, writeAuditLog } from '../../../api/_lib/auditLog.js'
import { resolveTenantCredentials } from '../../../api/_lib/tenantContext.js'
import { syncTenantSnapshot } from '../../../api/_lib/tenantSync.js'
import * as controlApi from '../../../api/_lib/controlApiClient.js'

async function getActorEmail(req) {
  return req.superadmin?.email || req.superadmin?.sub || 'unknown'
}

export async function listHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const tenants = await listTenants({ status: req.query?.status })
    return sendJson(res, 200, { tenants })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function dashboardHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const stats = await getDashboardStats()
    return sendJson(res, 200, { stats })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function createHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const tenant = await createTenant(req.body || {})
    await writeAuditLog({
      tenantId: tenant.id,
      action: 'tenant.created',
      actorEmail: await getActorEmail(req),
      payload: { slug: tenant.slug, baseUrl: tenant.baseUrl },
    })
    return sendJson(res, 201, { tenant })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function detailHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const tenant = await getTenantWithSnapshot(req.params.id)
    if (!tenant) return sendJson(res, 404, { error: 'Tenant not found.' })
    return sendJson(res, 200, { tenant })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function patchHandler(req, res) {
  if (req.method !== 'PATCH') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const tenant = await updateTenant(req.params.id, req.body || {})
    await writeAuditLog({
      tenantId: tenant.id,
      action: 'tenant.updated',
      actorEmail: await getActorEmail(req),
      payload: req.body || {},
    })
    return sendJson(res, 200, { tenant })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function deleteHandler(req, res) {
  if (req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const tenant = await archiveTenant(req.params.id)
    await writeAuditLog({
      tenantId: tenant.id,
      action: 'tenant.archived',
      actorEmail: await getActorEmail(req),
      payload: {},
    })
    return sendJson(res, 200, { tenant })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function syncHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const status = await syncTenantSnapshot(req.params.id, credentials)
    await writeAuditLog({
      tenantId: req.params.id,
      action: 'tenant.synced',
      actorEmail: await getActorEmail(req),
      payload: { tenantSlug: credentials.slug },
    })
    const tenant = await getTenantWithSnapshot(req.params.id)
    return sendJson(res, 200, { status, tenant })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function configGetHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const result = await controlApi.getConfig(credentials)
    return sendJson(res, 200, result)
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function configPutHandler(req, res) {
  if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const result = await controlApi.updateConfig(credentials, req.body || {})
    await writeAuditLog({
      tenantId: req.params.id,
      action: 'tenant.config.updated',
      actorEmail: await getActorEmail(req),
      payload: req.body || {},
    })
    return sendJson(res, 200, result)
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function settingsGetHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const result = await controlApi.getSettings(credentials)
    return sendJson(res, 200, result)
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function settingsPutHandler(req, res) {
  if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const result = await controlApi.updateSettings(credentials, req.body || {})
    await writeAuditLog({
      tenantId: req.params.id,
      action: 'tenant.settings.updated',
      actorEmail: await getActorEmail(req),
      payload: { keys: Object.keys(req.body || {}) },
    })
    return sendJson(res, 200, result)
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function migrationsGetHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const result = await controlApi.getMigrations(credentials)
    return sendJson(res, 200, result)
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function migrationsRunHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const result = await controlApi.runMigrations(credentials)
    await writeAuditLog({
      tenantId: req.params.id,
      action: 'tenant.migrations.run',
      actorEmail: await getActorEmail(req),
      payload: result,
    })
    return sendJson(res, 200, result)
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function maintenanceHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const credentials = await resolveTenantCredentials(req.params.id)
    const enabled = Boolean(req.body?.enabled)
    const result = await controlApi.setMaintenance(credentials, enabled)
    await writeAuditLog({
      tenantId: req.params.id,
      action: 'tenant.maintenance.updated',
      actorEmail: await getActorEmail(req),
      payload: { enabled },
    })
    return sendJson(res, 200, result)
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function auditHandler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const entries = await listAuditLog(req.params.id)
    return sendJson(res, 200, { entries })
  } catch (error) {
    return handleApiError(res, error)
  }
}

export async function syncAllHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const tenants = await listTenants()
    const results = []
    for (const tenant of tenants) {
      if (tenant.status === 'archived') continue
      try {
        const credentials = await resolveTenantCredentials(tenant.id)
        const status = await syncTenantSnapshot(tenant.id, credentials)
        results.push({ tenantId: tenant.id, ok: true, status })
      } catch (error) {
        results.push({
          tenantId: tenant.id,
          ok: false,
          error: error.message,
          code: error.code,
        })
      }
    }
    return sendJson(res, 200, { results })
  } catch (error) {
    return handleApiError(res, error)
  }
}

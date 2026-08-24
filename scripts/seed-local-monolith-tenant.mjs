#!/usr/bin/env node
/**
 * Register the local SIGE tenant (ERP + optional web CMS as one tenant) in the panel.
 * Usage: node scripts/seed-local-monolith-tenant.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(envPath, mapKeys = null) {
  if (!existsSync(envPath)) return
  readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const i = trimmed.indexOf('=')
      if (i === -1) return
      const key = trimmed.slice(0, i).trim()
      const value = trimmed.slice(i + 1).trim()
      if (!key) return
      if (mapKeys) {
        const target = mapKeys[key]
        if (target && process.env[target] === undefined) process.env[target] = value
        return
      }
      if (process.env[key] === undefined) process.env[key] = value
    })
}

loadEnvFile(resolve(process.cwd(), '.env'))
loadEnvFile(resolve(process.cwd(), '../SIGE_monolito/.env'), {
  CONTROL_API_TOKEN: 'MONOLITH_CONTROL_TOKEN',
})

const PANEL_API = process.env.PANEL_API_URL || 'http://localhost:3002'
const DEV_EMAIL =
  process.env.SUPERADMIN_ALLOWED_EMAILS?.split(',')[0]?.trim() || 'raul@findspo.com'

const LOCAL_TENANT = {
  slug: 'local-monolith',
  displayName: 'SIGE Local (ERP + Web CMS)',
  baseUrl: process.env.MONOLITH_BASE_URL || 'http://localhost:5174',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:5175',
  controlToken:
    process.env.MONOLITH_CONTROL_TOKEN || 'local-dev-control-token-change-me',
  databaseName: 'sige_erp',
  notes: 'Un solo tenant local: ERP :5174/:3001 + Web CMS :5175/:3003 (config compartida)',
}

async function login() {
  const response = await fetch(`${PANEL_API}/api/superadmin/login/dev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEV_EMAIL }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Login failed')
  return payload.token
}

async function archiveIfExists(token, slug) {
  const existing = await fetch(`${PANEL_API}/api/superadmin/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())

  const found = existing.tenants?.find((t) => t.slug === slug)
  if (!found) return

  await fetch(`${PANEL_API}/api/superadmin/tenants/${found.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log(`Archived duplicate tenant ${slug}:`, found.id)
}

async function upsertTenant(token, definition) {
  const existing = await fetch(`${PANEL_API}/api/superadmin/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())

  const found = existing.tenants?.find((t) => t.slug === definition.slug)
  let tenantId = found?.id

  if (found) {
    console.log(`Tenant ${definition.slug} already exists:`, found.id)
    const updated = await fetch(`${PANEL_API}/api/superadmin/tenants/${found.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: definition.displayName,
        baseUrl: definition.baseUrl,
        webBaseUrl: definition.webBaseUrl,
        controlToken: definition.controlToken,
        databaseName: definition.databaseName,
        notes: definition.notes,
        status: 'active',
      }),
    }).then((r) => r.json())
    if (updated.error) throw new Error(updated.error)
  } else {
    const created = await fetch(`${PANEL_API}/api/superadmin/tenants`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(definition),
    }).then((r) => r.json())

    if (!created.tenant) {
      throw new Error(created.error || `Failed to create ${definition.slug}`)
    }

    tenantId = created.tenant.id
    console.log(`Created tenant ${definition.slug}:`, tenantId)
  }

  const sync = await fetch(`${PANEL_API}/api/superadmin/tenants/${tenantId}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())

  console.log(`Sync ${definition.slug}:`, sync.status?.ok ? 'ok' : JSON.stringify(sync))
  console.log(`  ERP:  ${definition.baseUrl}/admin`)
  console.log(`  Web:  ${definition.webBaseUrl}`)
  console.log(`  CMS:  ${definition.webBaseUrl}/admin`)
  console.log(`  Panel: http://localhost:5173/superadmin/tenants/${tenantId}`)
}

async function main() {
  const token = await login()
  await archiveIfExists(token, 'local-web-cms')
  await upsertTenant(token, LOCAL_TENANT)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * Register local SIGE monolith as a tenant in the superadmin panel.
 * Usage: node scripts/seed-local-monolith-tenant.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile() {
  for (const name of ['.env', 'env']) {
    const envPath = resolve(process.cwd(), name)
    if (!existsSync(envPath)) continue
    readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return
        const i = trimmed.indexOf('=')
        if (i === -1) return
        const key = trimmed.slice(0, i).trim()
        const value = trimmed.slice(i + 1).trim()
        if (key && process.env[key] === undefined) process.env[key] = value
      })
    break
  }
}

function loadMonolithEnv() {
  const monolithEnv = resolve(process.cwd(), '../SIGE_monolito/.env')
  if (!existsSync(monolithEnv)) return
  readFileSync(monolithEnv, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const i = trimmed.indexOf('=')
      if (i === -1) return
      const key = trimmed.slice(0, i).trim()
      const value = trimmed.slice(i + 1).trim()
      if (key === 'CONTROL_API_TOKEN' && !process.env.MONOLITH_CONTROL_TOKEN) {
        process.env.MONOLITH_CONTROL_TOKEN = value
      }
    })
}

loadEnvFile()
loadMonolithEnv()

const PANEL_API = process.env.PANEL_API_URL || 'http://localhost:3002'
const MONOLITH_URL = process.env.MONOLITH_BASE_URL || 'http://localhost:5174'
const CONTROL_TOKEN =
  process.env.MONOLITH_CONTROL_TOKEN || 'local-dev-control-token-change-me'
const DEV_EMAIL = process.env.SUPERADMIN_ALLOWED_EMAILS?.split(',')[0]?.trim() || 'raul@findspo.com'

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

async function main() {
  const token = await login()

  const existing = await fetch(`${PANEL_API}/api/superadmin/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())

  const found = existing.tenants?.find((t) => t.slug === 'local-monolith')
  if (found) {
    console.log('Tenant local-monolith already exists:', found.id)
    const sync = await fetch(`${PANEL_API}/api/superadmin/tenants/${found.id}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json())
    console.log('Sync result:', JSON.stringify(sync, null, 2))
    return
  }

  const created = await fetch(`${PANEL_API}/api/superadmin/tenants`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      slug: 'local-monolith',
      displayName: 'SIGE Monolito (local)',
      baseUrl: MONOLITH_URL,
      controlToken: CONTROL_TOKEN,
      databaseName: 'sige',
      notes: 'Local dev monolith via npm run dev:full',
    }),
  }).then((r) => r.json())

  if (!created.tenant) {
    throw new Error(created.error || 'Failed to create tenant')
  }

  console.log('Created tenant:', created.tenant.id)

  const sync = await fetch(`${PANEL_API}/api/superadmin/tenants/${created.tenant.id}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json())

  console.log('Sync result:', JSON.stringify(sync, null, 2))
  console.log(`Open panel: http://localhost:5173/superadmin/tenants/${created.tenant.id}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

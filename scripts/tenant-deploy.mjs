#!/usr/bin/env node
/**
 * CLI worker for tenant promote/deploy (same logic as panel API).
 *
 * Usage:
 *   node scripts/tenant-deploy.mjs promote <tenantId> erp|web|both
 *   node scripts/tenant-deploy.mjs deploy <tenantId> erp|web|both
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { deployTenant, promoteFromMain } from '../api/_lib/deployRunner.js'
import { closePool } from '../api/_lib/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function loadEnv() {
  for (const name of ['.env', 'env']) {
    const path = resolve(root, name)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const i = trimmed.indexOf('=')
      if (i < 0) continue
      const key = trimmed.slice(0, i).trim()
      let value = trimmed.slice(i + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

loadEnv()

const [action, tenantId, component = 'erp'] = process.argv.slice(2)
const actorEmail = process.env.ACTOR_EMAIL || 'cli@localhost'

if (!action || !tenantId || !['promote', 'deploy'].includes(action)) {
  console.error('Usage: node scripts/tenant-deploy.mjs <promote|deploy> <tenantId> [erp|web|both]')
  process.exit(1)
}

try {
  const result =
    action === 'promote'
      ? await promoteFromMain(tenantId, { component, actorEmail })
      : await deployTenant(tenantId, { component, actorEmail })
  console.log(JSON.stringify(result, null, 2))
  await closePool()
} catch (error) {
  console.error(error.message)
  await closePool()
  process.exit(1)
}

#!/usr/bin/env node
/**
 * Run ADR 001 path guard against a tenant branch (GitHub compare).
 *
 *   node scripts/check-tenant-paths.mjs erp <branch>
 *   node scripts/check-tenant-paths.mjs web <branch>
 *
 * Requires GITHUB_TOKEN (or gh-compatible env). Optional SIGE_WORKSPACE_ROOT
 * to load Web allowlist from the monolith_web checkout.
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { assertTenantBranchPaths } from '../api/_lib/tenantPathGuard.js'

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

const [kind, branch] = process.argv.slice(2)
if (!kind || !branch || !['erp', 'web'].includes(kind)) {
  console.error('Usage: node scripts/check-tenant-paths.mjs <erp|web> <branch>')
  process.exit(1)
}

try {
  const result = await assertTenantBranchPaths(kind, branch)
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error.message)
  if (error.forbidden?.length) {
    for (const file of error.forbidden) console.error(`  - ${file}`)
  }
  process.exit(1)
}

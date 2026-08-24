#!/usr/bin/env node
/**
 * Apply GitHub branch protection via local `gh` CLI (uses your logged-in auth
 * or GH_TOKEN / GITHUB_TOKEN). Same REST endpoints as the API — private repos
 * still need GitHub Pro / org Team|Enterprise for branch protection.
 *
 * Run from a laptop or the ops VM after `gh auth login`:
 *
 *   node scripts/apply-branch-protection.mjs
 *   node scripts/apply-branch-protection.mjs --erp-slugs imufusters --web-slugs imureformas
 *   node scripts/apply-branch-protection.mjs --main-only
 *   node scripts/apply-branch-protection.mjs --dry-run
 *
 * Env (optional, same as panel):
 *   GITHUB_ERP_REPO=raulcarreno/SIGE_monolito
 *   GITHUB_WEB_REPO=raulcarreno/SIGE_monolito_web
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

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

function parseArgs(argv) {
  const out = {
    dryRun: false,
    mainOnly: false,
    erpSlugs: [],
    webSlugs: [],
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') out.dryRun = true
    else if (arg === '--main-only') out.mainOnly = true
    else if (arg === '--erp-slugs' && argv[i + 1]) {
      out.erpSlugs = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    } else if (arg === '--web-slugs' && argv[i + 1]) {
      out.webSlugs = argv[++i].split(',').map((s) => s.trim()).filter(Boolean)
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/apply-branch-protection.mjs [options]

Options:
  --erp-slugs a,b     Tenant branches to protect on the ERP repo
  --web-slugs a,b     Tenant branches to protect on the Web repo
  --main-only         Only protect main (skip tenant slugs)
  --dry-run           Print payloads without calling GitHub
`)
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(1)
    }
  }
  return out
}

function ghJson(args, input) {
  const result = execFileSync('gh', args, {
    encoding: 'utf8',
    input: input ?? undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return result.trim() ? JSON.parse(result) : null
}

function putBranchProtection(repo, branch, body, dryRun) {
  const path = `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`
  if (dryRun) {
    console.log(`[dry-run] PUT ${path}`)
    console.log(JSON.stringify(body, null, 2))
    return { ok: true, dryRun: true }
  }
  try {
    ghJson(
      ['api', '-X', 'PUT', path, '-H', 'Accept: application/vnd.github+json', '--input', '-'],
      JSON.stringify(body)
    )
    console.log(`OK  ${repo}@${branch}`)
    return { ok: true }
  } catch (err) {
    const stderr = err.stderr?.toString?.() || err.message || String(err)
    console.error(`FAIL ${repo}@${branch}`)
    console.error(stderr.trim())
    if (/Upgrade to GitHub Pro|403/.test(stderr)) {
      console.error(
        '\nBranch protection on private repos requires GitHub Pro (personal) or Team/Enterprise (org).\n' +
          '`gh` uses the same API as HTTPS — local auth does not bypass this plan limit.\n' +
          'tenant-path-guard Actions still run on push without required-status enforcement.'
      )
    }
    return { ok: false, error: stderr }
  }
}

function mainProtectionBody() {
  return {
    required_status_checks: { strict: true, contexts: [] },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      require_code_owner_reviews: true,
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  }
}

function tenantProtectionBody() {
  return {
    required_status_checks: {
      strict: true,
      contexts: ['tenant-path-guard'],
    },
    enforce_admins: true,
    required_pull_request_reviews: null,
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  }
}

loadEnv()
const opts = parseArgs(process.argv.slice(2))

const erpRepo = process.env.GITHUB_ERP_REPO?.trim() || 'raulcarreno/SIGE_monolito'
const webRepo = process.env.GITHUB_WEB_REPO?.trim() || 'raulcarreno/SIGE_monolito_web'

try {
  execFileSync('gh', ['auth', 'status'], { stdio: 'pipe' })
} catch {
  console.error('gh is not authenticated. Run: gh auth login')
  process.exit(1)
}

console.log(`ERP repo: ${erpRepo}`)
console.log(`Web repo: ${webRepo}`)
if (opts.dryRun) console.log('Mode: dry-run')

const results = []

results.push(putBranchProtection(erpRepo, 'main', mainProtectionBody(), opts.dryRun))
results.push(putBranchProtection(webRepo, 'main', mainProtectionBody(), opts.dryRun))

if (!opts.mainOnly) {
  for (const slug of opts.erpSlugs) {
    results.push(putBranchProtection(erpRepo, slug, tenantProtectionBody(), opts.dryRun))
  }
  for (const slug of opts.webSlugs) {
    results.push(putBranchProtection(webRepo, slug, tenantProtectionBody(), opts.dryRun))
  }
  if (opts.erpSlugs.length === 0 && opts.webSlugs.length === 0) {
    console.log(
      'No tenant slugs passed; only main was updated. Re-run with --erp-slugs / --web-slugs when needed.'
    )
  }
}

const failed = results.filter((r) => !r.ok).length
process.exit(failed > 0 ? 1 : 0)

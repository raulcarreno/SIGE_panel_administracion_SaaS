/**
 * Enforce ADR 001 tenant path ownership before promote/deploy.
 * Uses GitHub compare (main...branch) — plain git semantics, no branch-protection plan needed.
 *
 * Escape hatch: SKIP_TENANT_PATH_GUARD=1
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as github from './githubClient.js'

/** Fallback if workspace allowlist file is missing — keep in sync with SIGE_monolito_web. */
export const DEFAULT_WEB_PRESENTATION_PATTERNS = [
  'src/styles/**',
  'src/components/**',
  'src/routes/**',
  'public/**',
  'src/config/stockImages.js',
]

export function matchesPresentationPattern(filePath, pattern) {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return normalized === prefix || normalized.startsWith(`${prefix}/`)
  }
  return normalized === pattern
}

export function isPresentationPath(filePath, patterns = DEFAULT_WEB_PRESENTATION_PATTERNS) {
  return patterns.some((p) => matchesPresentationPattern(filePath, p))
}

export function loadWebPresentationPatterns() {
  const workspaceRoot = process.env.SIGE_WORKSPACE_ROOT?.trim()
  if (workspaceRoot) {
    const allowlistPath = resolve(
      workspaceRoot,
      'SIGE_monolito_web/scripts/ci/tenant-presentation-allowlist.json',
    )
    if (existsSync(allowlistPath)) {
      const data = JSON.parse(readFileSync(allowlistPath, 'utf8'))
      if (Array.isArray(data.patterns) && data.patterns.length > 0) {
        return data.patterns
      }
    }
  }
  return DEFAULT_WEB_PRESENTATION_PATTERNS
}

/**
 * @param {'erp'|'web'} kind
 * @param {string[]} files - paths changed on branch vs main (ahead)
 * @param {string[]} [webPatterns]
 * @returns {{ ok: true } | { ok: false, forbidden: string[], message: string }}
 */
export function evaluateTenantPathDiff(kind, files, webPatterns = DEFAULT_WEB_PRESENTATION_PATTERNS) {
  const list = Array.isArray(files) ? files.filter(Boolean) : []

  if (kind === 'erp') {
    if (list.length === 0) return { ok: true }
    return {
      ok: false,
      forbidden: list,
      message:
        `ERP tenant branch must stay 1:1 with main (ADR 001). ` +
        `${list.length} diverging file(s): ${list.slice(0, 12).join(', ')}` +
        (list.length > 12 ? ', …' : ''),
    }
  }

  if (kind === 'web') {
    const forbidden = list.filter((f) => !isPresentationPath(f, webPatterns))
    if (forbidden.length === 0) return { ok: true }
    return {
      ok: false,
      forbidden,
      message:
        `Web tenant branch may only change presentation paths (ADR 001). ` +
        `${forbidden.length} forbidden file(s): ${forbidden.slice(0, 12).join(', ')}` +
        (forbidden.length > 12 ? ', …' : ''),
    }
  }

  return {
    ok: false,
    forbidden: list,
    message: `Unknown component kind: ${kind}`,
  }
}

/**
 * Compare tenant branch to main via GitHub and throw if ownership policy fails.
 */
export async function assertTenantBranchPaths(kind, branch) {
  if (process.env.SKIP_TENANT_PATH_GUARD === '1') {
    return { skipped: true, kind, branch }
  }

  if (!branch || branch === 'main' || branch === 'development') {
    return { skipped: true, reason: 'base_branch', kind, branch }
  }

  const compare = await github.compareBranches(kind, 'main', branch)
  const files = compare.files || []
  const patterns = kind === 'web' ? loadWebPresentationPatterns() : []
  const result = evaluateTenantPathDiff(kind, files, patterns)

  if (!result.ok) {
    const error = new Error(result.message)
    error.statusCode = 409
    error.code = 'TENANT_PATH_GUARD_FAILED'
    error.forbidden = result.forbidden
    error.kind = kind
    error.branch = branch
    throw error
  }

  return {
    ok: true,
    kind,
    branch,
    fileCount: files.length,
    aheadBy: compare.aheadBy,
    behindBy: compare.behindBy,
  }
}

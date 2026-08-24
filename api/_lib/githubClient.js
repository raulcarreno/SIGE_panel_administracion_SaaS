/**
 * Minimal GitHub REST client for branch compare / merge.
 * Requires GITHUB_TOKEN with repo contents + pull access.
 */

function getToken() {
  return process.env.GITHUB_TOKEN?.trim() || ''
}

export function isGitHubConfigured() {
  return Boolean(getToken())
}

function repoFullName(kind) {
  if (kind === 'web') {
    return process.env.GITHUB_WEB_REPO?.trim() || 'raulcarreno/SIGE_monolito_web'
  }
  return process.env.GITHUB_ERP_REPO?.trim() || 'raulcarreno/SIGE_monolito'
}

async function githubRequest(path, { method = 'GET', body } = {}) {
  const token = getToken()
  if (!token) {
    const error = new Error('GITHUB_TOKEN is not configured on the panel.')
    error.statusCode = 503
    error.code = 'GITHUB_NOT_CONFIGURED'
    throw error
  }

  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
  }

  if (!response.ok) {
    const message = payload?.message || `GitHub API ${response.status}`
    const error = new Error(message)
    error.statusCode = response.status === 409 ? 409 : 502
    error.code = payload?.errors?.[0]?.message?.includes('Merge conflict')
      ? 'GITHUB_MERGE_CONFLICT'
      : 'GITHUB_API_ERROR'
    error.payload = payload
    throw error
  }

  return payload
}

export async function getBranchHead(kind, branch) {
  const repo = repoFullName(kind)
  const data = await githubRequest(
    `/repos/${repo}/commits/${encodeURIComponent(branch)}`,
  )
  return {
    repo,
    branch,
    sha: data.sha,
    shortSha: String(data.sha || '').slice(0, 7),
    message: data.commit?.message?.split('\n')[0] || '',
    date: data.commit?.committer?.date || data.commit?.author?.date || null,
  }
}

export async function compareBranches(kind, base, head) {
  const repo = repoFullName(kind)
  const data = await githubRequest(
    `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  )
  const files = Array.isArray(data.files)
    ? data.files.map((f) => f.filename).filter(Boolean)
    : []
  return {
    repo,
    base,
    head,
    status: data.status,
    aheadBy: data.ahead_by || 0,
    behindBy: data.behind_by || 0,
    totalCommits: data.total_commits || 0,
    files,
  }
}

/**
 * Merge baseBranch into headBranch (e.g. main into tenant slug).
 * GitHub API: POST /merges with base=tenant branch, head=main.
 */
export async function mergeBranchInto(kind, { targetBranch, sourceBranch = 'main' }) {
  const repo = repoFullName(kind)
  const data = await githubRequest(`/repos/${repo}/merges`, {
    method: 'POST',
    body: {
      base: targetBranch,
      head: sourceBranch,
      commit_message: `chore: promote ${sourceBranch} into ${targetBranch}`,
    },
  })

  // 204 / empty when already up to date — GitHub returns null body sometimes
  if (!data) {
    const head = await getBranchHead(kind, targetBranch)
    return { alreadyUpToDate: true, sha: head.sha, shortSha: head.shortSha, repo }
  }

  return {
    alreadyUpToDate: false,
    sha: data.sha,
    shortSha: String(data.sha || '').slice(0, 7),
    message: data.commit?.message || '',
    repo,
  }
}

export async function ensureBranchExists(kind, branch, from = 'main') {
  const repo = repoFullName(kind)
  try {
    return await getBranchHead(kind, branch)
  } catch (error) {
    if (error.statusCode !== 502 && error.code !== 'GITHUB_API_ERROR') throw error
  }

  const source = await getBranchHead(kind, from)
  await githubRequest(`/repos/${repo}/git/refs`, {
    method: 'POST',
    body: {
      ref: `refs/heads/${branch}`,
      sha: source.sha,
    },
  })
  return getBranchHead(kind, branch)
}

export function imageNameFor(kind, slug, shortSha) {
  const registry =
    process.env.ARTIFACT_REGISTRY?.trim() ||
    'europe-southwest1-docker.pkg.dev/findspo-core/fraian-saas'
  const name = kind === 'web' ? 'sige-web-cms' : 'sige-monolith'
  return `${registry}/${name}:${slug}-${shortSha}`
}

export function deploymentNameFor(kind, slug) {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized || process.env.PLATFORM_TENANT_ISOLATED === '0') {
    return kind === 'web' ? 'sige-web' : 'sige-erp'
  }
  return kind === 'web' ? `sige-web-${normalized}` : `sige-erp-${normalized}`
}

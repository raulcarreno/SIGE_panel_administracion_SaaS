import { spawn } from 'node:child_process'
import * as github from './githubClient.js'
import * as controlApi from './controlApiClient.js'
import { assertTenantBranchPaths } from './tenantPathGuard.js'
import {
  createDeployJob,
  getTenantVersioningRow,
  listDeployJobs,
  updateDeployJob,
  updateTenantVersioning,
} from './versioningRepository.js'
import { getTenantCredentials, getTenantById } from './tenantsRepository.js'
import { writeAuditLog } from './auditLog.js'

function runCommand(command, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr, code })
      else {
        const error = new Error(stderr.trim() || stdout.trim() || `${command} exited ${code}`)
        error.code = 'COMMAND_FAILED'
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      }
    })
  })
}

function componentsFrom(component) {
  if (component === 'both') return ['erp', 'web']
  if (component === 'erp' || component === 'web') return [component]
  const error = new Error('component must be erp, web or both.')
  error.statusCode = 400
  throw error
}

async function buildStatusForComponent(tenant, kind) {
  const branch = kind === 'web' ? tenant.webBranch : tenant.erpBranch
  const deployedSha = kind === 'web' ? tenant.webDeployedSha : tenant.erpDeployedSha
  const deployedVersion =
    kind === 'web' ? tenant.webDeployedVersion : tenant.erpDeployedVersion

  let head = null
  let vsMain = null
  let githubError = null

  if (github.isGitHubConfigured()) {
    try {
      head = await github.getBranchHead(kind, branch)
      vsMain = await github.compareBranches(kind, 'main', branch)
    } catch (error) {
      githubError = error.message
    }
  }

  return {
    component: kind,
    branch,
    deployedSha,
    deployedVersion,
    desiredSha: kind === 'web' ? tenant.webDesiredSha : tenant.erpDesiredSha,
    headSha: head?.sha || null,
    headShortSha: head?.shortSha || null,
    headMessage: head?.message || null,
    aheadOfMain: vsMain?.aheadBy ?? null,
    behindMain: vsMain?.behindBy ?? null,
    compareStatus: vsMain?.status || null,
    githubError,
    imageHint: head
      ? github.imageNameFor(kind, tenant.slug, head.shortSha)
      : null,
  }
}

export async function getVersioningStatus(tenantId) {
  const tenant = await getTenantVersioningRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const credentials = await getTenantCredentials(tenantId)
  let podStatus = null
  let podError = null
  if (credentials) {
    try {
      podStatus = await controlApi.getStatus(credentials)
    } catch (error) {
      podError = error.message
    }
  }

  const [erp, web] = await Promise.all([
    buildStatusForComponent(tenant, 'erp'),
    buildStatusForComponent(tenant, 'web'),
  ])

  const jobs = await listDeployJobs(tenantId, { limit: 15 })

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      erpBranch: tenant.erpBranch,
      webBranch: tenant.webBranch,
      lastDeployStatus: tenant.lastDeployStatus,
      lastDeployError: tenant.lastDeployError,
      lastDeployAt: tenant.lastDeployAt,
    },
    githubConfigured: github.isGitHubConfigured(),
    pod: {
      appVersion: podStatus?.appVersion || null,
      gitSha: podStatus?.gitSha || null,
      migrationsPending: podStatus?.migrationsPending ?? null,
      error: podError,
    },
    erp,
    web,
    jobs,
  }
}

async function promoteOne(kind, tenant, actorEmail) {
  const branch = kind === 'web' ? tenant.webBranch || tenant.slug : tenant.erpBranch || tenant.slug
  await github.ensureBranchExists(kind, branch, 'main')
  const merge = await github.mergeBranchInto(kind, {
    targetBranch: branch,
    sourceBranch: 'main',
  })
  // After promote, remaining ahead-of-main files must respect path ownership (ADR 001).
  const pathGuard = await assertTenantBranchPaths(kind, branch)
  const patch =
    kind === 'web'
      ? { webDesiredSha: merge.sha, webBranch: branch }
      : { erpDesiredSha: merge.sha, erpBranch: branch }
  await updateTenantVersioning(tenant.id, patch)
  return { kind, branch, ...merge, pathGuard }
}

export async function promoteFromMain(tenantId, { component = 'erp', actorEmail }) {
  const tenant = await getTenantVersioningRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  const job = await createDeployJob({
    tenantId,
    component,
    action: 'promote_main',
    actorEmail,
    requestPayload: { component },
  })

  await updateDeployJob(job.id, { status: 'running', startedAt: true })

  try {
    const kinds = componentsFrom(component)
    const results = []
    for (const kind of kinds) {
      results.push(await promoteOne(kind, tenant, actorEmail))
    }

    await updateDeployJob(job.id, {
      status: 'succeeded',
      finishedAt: true,
      resultPayload: { results },
    })
    await updateTenantVersioning(tenantId, {
      lastDeployStatus: 'promote_succeeded',
      lastDeployError: null,
      lastDeployAt: new Date().toISOString(),
    })
    await writeAuditLog({
      tenantId,
      action: 'versioning.promote_main',
      actorEmail,
      payload: { component, results },
    })

    const jobs = await listDeployJobs(tenantId, { limit: 1 })
    return { job: jobs[0], results }
  } catch (error) {
    await updateDeployJob(job.id, {
      status: 'failed',
      finishedAt: true,
      errorMessage: error.message,
      resultPayload: { code: error.code || null },
    })
    await updateTenantVersioning(tenantId, {
      lastDeployStatus: 'promote_failed',
      lastDeployError: error.message,
      lastDeployAt: new Date().toISOString(),
    })
    throw error
  }
}

async function deployOne(kind, tenant) {
  const branch = kind === 'web' ? tenant.webBranch || tenant.slug : tenant.erpBranch || tenant.slug
  const pathGuard = await assertTenantBranchPaths(kind, branch)
  const head = await github.getBranchHead(kind, branch)
  const image = github.imageNameFor(kind, tenant.slug, head.shortSha)
  const deployment = github.deploymentNameFor(kind)
  const namespace = process.env.GKE_NAMESPACE?.trim() || 'sige-saas-prod'
  const project = process.env.GCP_PROJECT_ID?.trim() || 'findspo-core'
  const region = process.env.GKE_REGION?.trim() || 'europe-southwest1'
  const cluster = process.env.GKE_CLUSTER?.trim() || 'kbnt-prd-1'
  const appVersion = process.env.DEFAULT_APP_VERSION?.trim() || '0.2.0'
  const repoDirHint = kind === 'web' ? 'SIGE_monolito_web' : 'SIGE_monolito'
  const configPath =
    kind === 'web'
      ? process.env.WEB_CLOUDBUILD_CONFIG || 'cloudbuild.yaml'
      : process.env.ERP_CLOUDBUILD_CONFIG || 'cloudbuild.yaml'

  // Prefer triggering Cloud Build from the connected workspace checkout when available.
  const workspaceRoot = process.env.SIGE_WORKSPACE_ROOT?.trim()
  const sourceDir = workspaceRoot ? `${workspaceRoot}/${repoDirHint}` : null

  if (sourceDir && process.env.DEPLOY_MODE !== 'kubectl-only') {
    try {
      await runCommand('gcloud', [
        'builds',
        'submit',
        sourceDir,
        `--config=${sourceDir}/${configPath}`,
        `--substitutions=_IMAGE=${image},_APP_VERSION=${appVersion},_GIT_SHA=${head.shortSha}`,
        `--project=${project}`,
      ])
    } catch (error) {
      // Fall through to kubectl set image if build tools unavailable in-panel
      if (process.env.DEPLOY_REQUIRE_BUILD === '1') throw error
    }
  }

  await runCommand('gcloud', [
    'container',
    'clusters',
    'get-credentials',
    cluster,
    `--region=${region}`,
    `--project=${project}`,
  ])

  await runCommand('kubectl', [
    'set',
    'image',
    `deployment/${deployment}`,
    `${kind === 'web' ? 'web' : 'erp'}=${image}`,
    `-n`,
    namespace,
  ])

  await runCommand('kubectl', [
    'set',
    'env',
    `deployment/${deployment}`,
    `-n`,
    namespace,
    `APP_VERSION=${appVersion}`,
    `GIT_SHA=${head.sha}`,
    `GIT_BRANCH=${branch}`,
  ])

  await runCommand('kubectl', [
    'rollout',
    'status',
    `deployment/${deployment}`,
    `-n`,
    namespace,
    `--timeout=300s`,
  ])

  const patch =
    kind === 'web'
      ? {
          webDeployedSha: head.sha,
          webDesiredSha: head.sha,
          webDeployedVersion: appVersion,
          webBranch: branch,
        }
      : {
          erpDeployedSha: head.sha,
          erpDesiredSha: head.sha,
          erpDeployedVersion: appVersion,
          erpBranch: branch,
        }
  await updateTenantVersioning(tenant.id, patch)

  return { kind, branch, sha: head.sha, shortSha: head.shortSha, image, deployment, pathGuard }
}

export async function deployTenant(tenantId, { component = 'erp', actorEmail, ref }) {
  const tenant = await getTenantVersioningRow(tenantId)
  if (!tenant) {
    const error = new Error('Tenant not found.')
    error.statusCode = 404
    throw error
  }

  // Ensure branches default to slug when still on main placeholder for demo tenants
  if (tenant.erpBranch === 'main' || tenant.webBranch === 'main') {
    const full = await getTenantById(tenantId)
    await updateTenantVersioning(tenantId, {
      erpBranch: tenant.erpBranch === 'main' ? full.slug : tenant.erpBranch,
      webBranch: tenant.webBranch === 'main' ? full.slug : tenant.webBranch,
    })
  }

  const refreshed = await getTenantVersioningRow(tenantId)

  const job = await createDeployJob({
    tenantId,
    component,
    action: 'deploy',
    actorEmail,
    requestPayload: { component, ref: ref || null },
  })
  await updateDeployJob(job.id, { status: 'running', startedAt: true })

  try {
    const kinds = componentsFrom(component)
    const results = []
    for (const kind of kinds) {
      results.push(await deployOne(kind, refreshed))
    }

    await updateDeployJob(job.id, {
      status: 'succeeded',
      finishedAt: true,
      resultPayload: { results },
    })
    await updateTenantVersioning(tenantId, {
      lastDeployStatus: 'deploy_succeeded',
      lastDeployError: null,
      lastDeployAt: new Date().toISOString(),
    })
    await writeAuditLog({
      tenantId,
      action: 'versioning.deploy',
      actorEmail,
      payload: { component, results },
    })

    return { job: (await listDeployJobs(tenantId, { limit: 1 }))[0], results }
  } catch (error) {
    await updateDeployJob(job.id, {
      status: 'failed',
      finishedAt: true,
      errorMessage: error.message,
    })
    await updateTenantVersioning(tenantId, {
      lastDeployStatus: 'deploy_failed',
      lastDeployError: error.message,
      lastDeployAt: new Date().toISOString(),
    })
    throw error
  }
}

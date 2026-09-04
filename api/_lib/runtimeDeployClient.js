import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { isHetznerRuntime, imageEnvKey, artifactRegistryHost, serviceAccountKeyPath } from './runtimeTarget.js'
import { getComposeFile, getComposeProject, getComposeProjectDir } from './runtimeTarget.js'
import { tenantErpDeploymentName, tenantWebDeploymentName } from './tenantDomains.js'

function runCommand(command, args, { cwd, env, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
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
    if (stdin) child.stdin.end(stdin)
  })
}

async function setEnvVar(filePath, key, value) {
  let text = ''
  try {
    text = await readFile(filePath, 'utf8')
  } catch {
    text = ''
  }
  const lines = text.split('\n')
  let found = false
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true
      return `${key}=${value}`
    }
    return line
  })
  if (!found) next.push(`${key}=${value}`)
  const body = next.join('\n').replace(/\n+$/, '')
  await writeFile(filePath, `${body}\n`, 'utf8')
}

async function dockerLogin() {
  const keyPath = serviceAccountKeyPath()
  const key = await readFile(keyPath, 'utf8')
  await runCommand(
    'docker',
    ['login', '-u', '_json_key', '--password-stdin', `https://${artifactRegistryHost()}`],
    { stdin: key },
  )
}

async function composeRollout({ kind, slug, image, appVersion, gitSha, gitBranch }) {
  const service = kind === 'web' ? tenantWebDeploymentName(slug) : tenantErpDeploymentName(slug)
  const envKey = imageEnvKey(kind, slug)
  const composeDir = getComposeProjectDir()
  await setEnvVar(`${composeDir}/.env`, envKey, image)
  await setEnvVar(`${composeDir}/.env`, 'APP_VERSION', appVersion)
  if (kind === 'web') {
    await setEnvVar(`${composeDir}/.env`, 'WEB_GIT_SHA', gitSha)
    await setEnvVar(`${composeDir}/.env`, 'WEB_GIT_BRANCH', gitBranch)
  } else {
    await setEnvVar(`${composeDir}/.env`, 'GIT_SHA', gitSha)
    await setEnvVar(`${composeDir}/.env`, 'ERP_GIT_BRANCH', gitBranch)
  }

  await dockerLogin()
  const argsPrefix = ['compose', '-p', getComposeProject(), '-f', getComposeFile()]
  await runCommand('docker', [...argsPrefix, 'pull', service], { cwd: composeDir })
  await runCommand('docker', [...argsPrefix, 'up', '-d', '--no-deps', '--force-recreate', service], {
    cwd: composeDir,
  })
  return { service, image, envKey }
}

async function gkeRollout({ kind, slug, image, appVersion, gitSha, gitBranch }) {
  const deployment = kind === 'web' ? tenantWebDeploymentName(slug) : tenantErpDeploymentName(slug)
  const namespace = process.env.GKE_NAMESPACE?.trim() || 'sige-saas-prod'
  const project = process.env.GCP_PROJECT_ID?.trim() || 'findspo-core'
  const region = process.env.GKE_REGION?.trim() || 'europe-southwest1'
  const cluster = process.env.GKE_CLUSTER?.trim() || 'kbnt-prd-1'

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
    '-n',
    namespace,
  ])
  await runCommand('kubectl', [
    'set',
    'env',
    `deployment/${deployment}`,
    '-n',
    namespace,
    `APP_VERSION=${appVersion}`,
    `GIT_SHA=${gitSha}`,
    `GIT_BRANCH=${gitBranch}`,
  ])
  await runCommand('kubectl', [
    'rollout',
    'status',
    `deployment/${deployment}`,
    '-n',
    namespace,
    '--timeout=300s',
  ])
  return { service: deployment, image }
}

export async function rollOutService(opts) {
  if (isHetznerRuntime()) return composeRollout(opts)
  return gkeRollout(opts)
}

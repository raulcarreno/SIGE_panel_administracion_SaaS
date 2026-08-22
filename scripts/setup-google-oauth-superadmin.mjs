import { createInterface } from 'node:readline/promises'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const PROJECT_ID = process.env.GCP_PROJECT_ID?.trim() || 'gen-lang-client-0189443749'
const ENV_PATH = resolve(process.cwd(), '.env')
const CONSOLE_URL =
  `https://console.cloud.google.com/auth/clients/create?project=${PROJECT_ID}`

function upsertEnvValue(content, key, value) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(content)) {
    return content.replace(pattern, line)
  }
  return `${content.trimEnd()}\n${line}\n`
}

async function main() {
  const cliClientId = process.argv[2]?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || ''

  console.log('Google OAuth setup — SIGE Superadmin Panel')
  console.log(`GCP project: ${PROJECT_ID}`)
  console.log('')
  console.log('Authorized JavaScript origins (local):')
  console.log('  - http://localhost:5173')
  console.log('  - http://127.0.0.1:5173')
  console.log('')

  let clientId = cliClientId

  if (!clientId) {
    console.log(CONSOLE_URL)
    spawnSync('open', [CONSOLE_URL], { stdio: 'ignore' })

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    clientId = (await rl.question('Paste GOOGLE_CLIENT_ID: ')).trim()
    await rl.close()
  }

  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    console.error('Invalid client ID. Must end with .apps.googleusercontent.com')
    process.exit(1)
  }

  if (!existsSync(ENV_PATH)) {
    console.error('Missing .env. Copy .env.example first.')
    process.exit(1)
  }

  let content = readFileSync(ENV_PATH, 'utf8')
  content = upsertEnvValue(content, 'GOOGLE_CLIENT_ID', clientId)
  content = upsertEnvValue(content, 'VITE_GOOGLE_CLIENT_ID', clientId)
  if (!/^SUPERADMIN_ALLOWED_EMAILS=/m.test(content)) {
    content = upsertEnvValue(content, 'SUPERADMIN_ALLOWED_EMAILS', 'admin@example.com')
  }
  content = upsertEnvValue(content, 'SUPERADMIN_DEV_LOGIN', 'true')

  writeFileSync(ENV_PATH, content, 'utf8')
  console.log('')
  console.log('Updated .env with GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID.')
  console.log('Ensure SUPERADMIN_ALLOWED_EMAILS includes your Google account.')
  console.log('Restart: npm run dev:full')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

import { createInterface } from 'node:readline/promises'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const PROJECT_ID = process.env.GCP_PROJECT_ID?.trim() || 'sige-saas'
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
  console.log(`Proyecto GCP: ${PROJECT_ID}`)
  console.log('')

  let clientId = cliClientId

  if (!clientId) {
    console.log('1. Abre Google Cloud Console (Auth Platform → Clients).')
    console.log('2. Crea un OAuth client ID tipo "Web application".')
    console.log('3. Authorized JavaScript origins:')
    console.log('   - http://localhost:5173')
    console.log('   - http://127.0.0.1:5173')
    console.log('   - http://localhost:5174')
    console.log('   - http://127.0.0.1:5174')
    console.log('   - http://localhost:5175')
    console.log('   - http://127.0.0.1:5175')
    console.log('   - https://panel.sige-saas.findspo.com')
    console.log('   - https://sige-saas.findspo.com')
    console.log('   - https://www.sige-saas.findspo.com')
    console.log('   - https://erp.reformasbcn.findspo.com')
    console.log('   - https://www.reformasbcn.findspo.com')
    console.log('4. Copia el Client ID (....apps.googleusercontent.com).')
    console.log('')
    console.log(CONSOLE_URL)
    console.log('')

    spawnSync('open', [CONSOLE_URL], { stdio: 'ignore' })

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    clientId = (await rl.question('Pega el GOOGLE_CLIENT_ID: ')).trim()
    await rl.close()
  }

  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    console.error('Client ID invalido. Debe terminar en .apps.googleusercontent.com')
    process.exit(1)
  }

  if (!existsSync(ENV_PATH)) {
    console.error('No existe .env. Copia .env.example primero.')
    process.exit(1)
  }

  let content = readFileSync(ENV_PATH, 'utf8')
  content = upsertEnvValue(content, 'GOOGLE_CLIENT_ID', clientId)
  content = upsertEnvValue(content, 'VITE_GOOGLE_CLIENT_ID', clientId)
  if (!/^SUPERADMIN_ALLOWED_EMAILS=/m.test(content)) {
    content = upsertEnvValue(content, 'SUPERADMIN_ALLOWED_EMAILS', 'raul@findspo.com')
  }
  content = upsertEnvValue(content, 'SUPERADMIN_DEV_LOGIN', 'true')

  writeFileSync(ENV_PATH, content, 'utf8')
  console.log('')
  console.log('.env actualizado.')
  console.log('Asegurate de que SUPERADMIN_ALLOWED_EMAILS incluye tu cuenta Google.')
  console.log('Reinicia: npm run dev:full')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

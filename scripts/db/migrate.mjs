import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPendingMigrations } from '../../api/_lib/migrations.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

function loadEnvFile() {
  for (const name of ['.env', 'env']) {
    const envPath = resolve(root, name)
    if (!existsSync(envPath)) continue

    readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return
        const separatorIndex = trimmed.indexOf('=')
        if (separatorIndex === -1) return
        const key = trimmed.slice(0, separatorIndex).trim()
        const value = trimmed.slice(separatorIndex + 1).trim()
        if (key && process.env[key] === undefined) {
          process.env[key] = value
        }
      })
    break
  }
}

async function main() {
  loadEnvFile()

  if (!process.env.DATABASE_URL?.trim()) {
    console.error('Missing DATABASE_URL.')
    process.exit(1)
  }

  const result = await runPendingMigrations()
  if (result.skipped) {
    console.log('No pending migrations.')
    return
  }

  console.log(`Applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})

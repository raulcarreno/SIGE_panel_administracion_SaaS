import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkDbConnection } from '../api/_lib/db.js'

const children = []

function loadEnvFile() {
  for (const name of ['.env', 'env']) {
    const envPath = resolve(process.cwd(), name)
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

async function checkDatabase() {
  try {
    const connected = await checkDbConnection()
    if (connected) {
      console.log('PostgreSQL connected.')
      return
    }
    console.warn('Warning: Cannot connect to PostgreSQL. Run: npm run db:migrate')
  } catch (error) {
    console.warn('Warning: Cannot connect to PostgreSQL. Run: npm run db:migrate')
    console.warn(`  ${error.message}`)
  }
}

function spawnProcess(command, args, label) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${label} exited with code ${code}`)
    }
    shutdown(code ?? 0)
  })

  children.push(child)
  return child
}

function shutdown(code = 0) {
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGTERM')
  })
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

loadEnvFile()

console.log('Checking database...')
await checkDatabase()

console.log('Starting local API...')
spawnProcess('node', ['--watch', 'scripts/local-api.mjs'], 'API')

setTimeout(() => {
  console.log('Starting Vite...')
  spawnProcess('npx', ['vite'], 'Vite')
}, 500)

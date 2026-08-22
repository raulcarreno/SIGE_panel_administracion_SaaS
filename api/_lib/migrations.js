import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb, withTransaction } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, '../../scripts/db/migrations')
const ADVISORY_LOCK_KEY = 1122334455

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

export async function listAppliedMigrations(db = getDb()) {
  try {
    const result = await db.execute(
      'SELECT name, applied_at FROM schema_migrations ORDER BY name ASC',
    )
    return result.rows.map((row) => ({ name: row.name, appliedAt: row.applied_at }))
  } catch {
    return []
  }
}

export async function listPendingMigrations(db = getDb()) {
  const files = listMigrationFiles()
  const applied = new Set((await listAppliedMigrations(db)).map((row) => row.name))
  return files.filter((name) => !applied.has(name))
}

export async function runPendingMigrations(db = getDb()) {
  const pending = await listPendingMigrations(db)
  if (!pending.length) {
    return { applied: [], skipped: true }
  }

  const appliedNames = []

  await withTransaction(async (tx) => {
    await tx.execute('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY])

    const hasMigrationTable = await tx
      .execute("SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists")
      .then((result) => Boolean(result.rows[0]?.exists))

    for (const name of pending) {
      if (hasMigrationTable) {
        const already = await tx.execute({
          sql: 'SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1',
          args: [name],
        })
        if (already.rows.length) continue
      }

      const sql = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8')
      await tx.execute(sql)
      await tx.execute({
        sql: 'INSERT INTO schema_migrations (name) VALUES (?)',
        args: [name],
      })
      appliedNames.push(name)
    }
  })

  return { applied: appliedNames, skipped: false }
}

import pg from 'pg'

const { Pool } = pg

let pool = null

function toPgQuery(sql, args = []) {
  let index = 0
  const pgSql = sql.replace(/\?/g, () => {
    index += 1
    return `$${index}`
  })
  return { sql: pgSql, args }
}

export function getDbConfig() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error('Missing DATABASE_URL.')
  }
  return { connectionString: url }
}

export function getPool() {
  if (!pool) {
    pool = new Pool({
      ...getDbConfig(),
      max: Number(process.env.DB_POOL_MAX || 10),
    })
  }
  return pool
}

export function getDb() {
  return {
    execute(input, maybeArgs) {
      const query =
        typeof input === 'string'
          ? toPgQuery(input, maybeArgs || [])
          : toPgQuery(input.sql, input.args || [])
      return getPool()
        .query(query.sql, query.args)
        .then((result) => ({
          rows: result.rows,
          rowsAffected: result.rowCount,
        }))
    },
  }
}

export async function withTransaction(fn) {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const txDb = {
      execute(input, maybeArgs) {
        const query =
          typeof input === 'string'
            ? toPgQuery(input, maybeArgs || [])
            : toPgQuery(input.sql, input.args || [])
        return client.query(query.sql, query.args).then((result) => ({
          rows: result.rows,
          rowsAffected: result.rowCount,
        }))
      },
    }
    const value = await fn(txDb)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function checkDbConnection() {
  try {
    await getDb().execute('SELECT 1')
    return true
  } catch {
    return false
  }
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

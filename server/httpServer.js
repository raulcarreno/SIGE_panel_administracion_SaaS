import { existsSync, createReadStream, statSync } from 'node:fs'
import { resolve, extname, join } from 'node:path'
import { createServer } from 'node:http'
import { dispatchApiRequest } from './apiRouter.js'
import { closePool } from '../api/_lib/db.js'
import { runPendingMigrations } from '../api/_lib/migrations.js'
import {
  attachJsonResponse,
  loadEnvFile,
  parseUrl,
  readRequestBody,
  toMockRequest,
} from './requestAdapter.js'
import { applyCorsHeadersAsync } from '../api/_lib/cors.js'
import { handleApiError } from '../api/_lib/apiHelpers.js'

const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '0.0.0'
const DIST_DIR = resolve(process.cwd(), 'dist')
const INDEX_HTML = join(DIST_DIR, 'index.html')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function sendStaticFile(req, res, filePath) {
  const ext = extname(filePath)
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream')
  if (req.method === 'HEAD') {
    res.writeHead(200)
    res.end()
    return
  }
  createReadStream(filePath).pipe(res)
}

function tryServeStatic(pathname, req, res) {
  if (!existsSync(DIST_DIR)) return false

  const safePath = pathname === '/' ? '/index.html' : pathname
  const filePath = resolve(DIST_DIR, `.${safePath}`)
  if (!filePath.startsWith(DIST_DIR)) return false

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendStaticFile(req, res, filePath)
    return true
  }

  if (existsSync(INDEX_HTML) && !pathname.startsWith('/api/')) {
    sendStaticFile(req, res, INDEX_HTML)
    return true
  }

  return false
}

async function handleApi(req, res, pathname, query) {
  const body = await readRequestBody(req)
  const contentType = req.headers['content-type'] || ''
  let parsedBody = body
  if (contentType.includes('application/json') && body.length) {
    try {
      parsedBody = JSON.parse(body.toString('utf8'))
    } catch {
      parsedBody = null
    }
  }

  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean)
  const mockReq = toMockRequest({
    method: req.method,
    body: parsedBody,
    headers: req.headers,
    socket: req.socket,
    query,
  })
  const mockRes = attachJsonResponse(res)
  await applyCorsHeadersAsync(mockReq, mockRes)
  await dispatchApiRequest(mockReq, mockRes, segments)
}

loadEnvFile()

async function bootstrap() {
  if (process.env.DATABASE_URL?.trim()) {
    try {
      const result = await runPendingMigrations()
      if (!result.skipped) {
        console.log(`Applied migrations: ${result.applied.join(', ')}`)
      }
    } catch (error) {
      console.warn('Migration warning:', error.message)
    }
  }
}

await bootstrap()

const server = createServer(async (req, res) => {
  const { pathname, query } = parseUrl(req.url || '/')

  if (req.method === 'OPTIONS') {
    await applyCorsHeadersAsync(req, res)
    res.writeHead(204)
    res.end()
    return
  }

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, query)
      return
    }

    if (tryServeStatic(pathname, req, res)) return

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found.' }))
  } catch (error) {
    console.error(`HTTP error [${pathname}]:`, error)
    if (!res.headersSent) {
      const mockRes = attachJsonResponse(res)
      handleApiError(mockRes, error)
    }
  }
})

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`)
  server.close(async () => {
    await closePool()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

server.listen(PORT, HOST, () => {
  console.log(`SIGE superadmin panel listening on http://${HOST}:${PORT}`)
})

export default server

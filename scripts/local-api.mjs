import { createServer } from 'node:http'
import { dispatchApiRequest } from '../server/apiRouter.js'
import { MAX_REQUEST_BODY_BYTES } from '../api/_lib/multipart.js'
import { applyCorsHeadersAsync } from '../api/_lib/cors.js'
import {
  attachJsonResponse,
  loadEnvFile,
  parseUrl,
  readRequestBody,
  toMockRequest,
} from '../server/requestAdapter.js'

loadEnvFile()

const PORT = Number(process.env.API_PORT || 3001)

const server = createServer(async (req, res) => {
  const { pathname, query } = parseUrl(req.url || '/')

  if (req.method === 'OPTIONS') {
    await applyCorsHeadersAsync(req, res)
    res.writeHead(204)
    res.end()
    return
  }

  if (!pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found.' }))
    return
  }

  try {
    const body = await readRequestBody(req, MAX_REQUEST_BODY_BYTES)
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
  } catch (error) {
    console.error(`Local API error [${pathname}]:`, error)
    const status = error?.statusCode === 413 ? 413 : 500
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: status === 413 ? 'Request body too large.' : 'Internal server error.',
      }),
    )
  }
})

server.listen(PORT, () => {
  console.log(`Local API running at http://localhost:${PORT}`)
})

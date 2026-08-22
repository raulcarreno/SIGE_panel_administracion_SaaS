import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAX_REQUEST_BODY_BYTES } from '../api/_lib/multipart.js'

export function loadEnvFile() {
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

export function readRequestBody(req, maxBytes = MAX_REQUEST_BODY_BYTES) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        const error = new Error('Request body too large.')
        error.statusCode = 413
        reject(error)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function attachJsonResponse(res) {
  res.status = function status(code) {
    res.statusCode = code
    return res
  }

  res.json = function json(payload) {
    if (!res.headersSent) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json')
      }
      res.writeHead(res.statusCode || 200)
    }
    res.end(JSON.stringify(payload))
  }

  return res
}

export function parseUrl(reqUrl) {
  const url = new URL(reqUrl, 'http://localhost')
  return {
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  }
}

export function toMockRequest({ method, body, headers, socket, query }) {
  return { method, body, headers, socket, query }
}

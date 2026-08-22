const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2

function normalizeBaseUrl(baseUrl) {
  return baseUrl.trim().replace(/\/+$/, '')
}

function mapControlError(status, body) {
  if (status === 401 || status === 403) {
    const error = new Error('Control API unauthorized.')
    error.statusCode = 502
    error.code = 'CONTROL_UNAUTHORIZED'
    return error
  }

  if (status >= 500) {
    const error = new Error('Tenant pod returned a server error.')
    error.statusCode = 502
    error.code = 'TENANT_POD_ERROR'
    return error
  }

  const message = body?.error || `Control API request failed (${status}).`
  const error = new Error(message)
  error.statusCode = 502
  error.code = 'CONTROL_API_ERROR'
  return error
}

async function requestOnce({ baseUrl, token, method, path, body, timeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })

    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { raw: text }
      }
    }

    if (!response.ok) {
      throw mapControlError(response.status, payload)
    }

    return payload
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Tenant pod request timed out.')
      timeoutError.statusCode = 504
      timeoutError.code = 'TENANT_UNREACHABLE'
      throw timeoutError
    }

    if (error.code) throw error

    const networkError = new Error('Cannot reach tenant pod.')
    networkError.statusCode = 502
    networkError.code = 'TENANT_UNREACHABLE'
    throw networkError
  } finally {
    clearTimeout(timer)
  }
}

export async function controlApiRequest({
  baseUrl,
  token,
  method = 'GET',
  path,
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let lastError

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await requestOnce({ baseUrl, token, method, path, body, timeoutMs })
    } catch (error) {
      lastError = error
      if (error.code === 'CONTROL_UNAUTHORIZED') throw error
      if (attempt === MAX_RETRIES) break
    }
  }

  throw lastError
}

export function getStatus(credentials) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'GET',
    path: '/api/control/status',
  })
}

export function getConfig(credentials) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'GET',
    path: '/api/control/config',
  })
}

export function updateConfig(credentials, body) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'PUT',
    path: '/api/control/config',
    body,
  })
}

export function getSettings(credentials) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'GET',
    path: '/api/control/settings',
  })
}

export function updateSettings(credentials, body) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'PUT',
    path: '/api/control/settings',
    body,
  })
}

export function getMigrations(credentials) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'GET',
    path: '/api/control/migrations',
  })
}

export function runMigrations(credentials) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'POST',
    path: '/api/control/migrations/run',
  })
}

export function setMaintenance(credentials, enabled) {
  return controlApiRequest({
    baseUrl: credentials.baseUrl,
    token: credentials.controlToken,
    method: 'POST',
    path: '/api/control/maintenance',
    body: { enabled: Boolean(enabled) },
  })
}

export function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload)
}

export function handleApiError(res, error, fallbackMessage = 'Internal server error.') {
  const statusCode = error?.statusCode || 500
  const message = statusCode < 500 ? error.message : fallbackMessage
  const code = error?.code

  if (statusCode >= 500) {
    console.error('[API]', { statusCode, code, message: error?.message })
  }

  const payload = { error: message }
  if (code) payload.code = code
  sendJson(res, statusCode, payload)
}

export function getJsonBody(req) {
  return req.body && typeof req.body === 'object' ? req.body : null
}

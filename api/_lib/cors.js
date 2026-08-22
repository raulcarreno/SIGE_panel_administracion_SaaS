function getAllowedOrigins() {
  const origins = new Set()

  const panelOrigin = process.env.PANEL_ORIGIN?.trim()
  if (panelOrigin) {
    origins.add(panelOrigin)
  }

  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173')
    origins.add('http://127.0.0.1:5173')
    origins.add('http://localhost:3001')
  }

  return origins
}

export async function applyCorsHeadersAsync(req, res) {
  const requestOrigin = req.headers?.origin || req.headers?.Origin
  const allowed = getAllowedOrigins()

  if (requestOrigin && allowed.has(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin)
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

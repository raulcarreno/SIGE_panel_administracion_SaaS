export function getClientIp(req) {
  const realIp = req.headers?.['x-real-ip']
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp.trim()
  }

  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean)
    return parts[0] || 'unknown'
  }

  return req.socket?.remoteAddress || 'unknown'
}

import { SignJWT, jwtVerify } from 'jose'
import { consumeRateLimit, resetMemoryRateLimit } from './rateLimit.js'
import { getClientIp } from './clientIp.js'

const TOKEN_TTL = '8h'
const ALGORITHM = 'HS256'
const MIN_JWT_SECRET_LENGTH = 32
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_RATE_NAMESPACE = 'superadmin-login'

function getJwtSecret() {
  const secret = process.env.SUPERADMIN_JWT_SECRET?.trim()
  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`SUPERADMIN_JWT_SECRET must be set (min ${MIN_JWT_SECRET_LENGTH} characters).`)
  }
  return new TextEncoder().encode(secret)
}

export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null
}

export function getAllowedSuperadminEmails() {
  const raw = process.env.SUPERADMIN_ALLOWED_EMAILS?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedSuperadminEmail(email) {
  if (!email || typeof email !== 'string') return false
  const allowed = getAllowedSuperadminEmails()
  if (!allowed.length) return false
  return allowed.includes(email.trim().toLowerCase())
}

export function isGoogleLoginConfigured() {
  return Boolean(getGoogleClientId()) && getAllowedSuperadminEmails().length > 0
}

export async function signPanelToken(email) {
  return new SignJWT({ role: 'superadmin', sub: email, email })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getJwtSecret())
}

export async function verifyPanelToken(token) {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: [ALGORITHM],
  })

  if (payload.role !== 'superadmin') {
    throw new Error('Invalid token role.')
  }

  const email = payload.email || payload.sub
  if (!isAllowedSuperadminEmail(email)) {
    throw new Error('Superadmin email is no longer allowed.')
  }

  return payload
}

export function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization
  if (!header || typeof header !== 'string') return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export async function requireSuperadmin(req) {
  const token = getBearerToken(req)
  if (!token) {
    const error = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }

  try {
    return await verifyPanelToken(token)
  } catch {
    const error = new Error('Invalid or expired token.')
    error.statusCode = 401
    throw error
  }
}

export async function enforceSuperadminAuth(req, pathname) {
  if (!pathname.startsWith('/api/superadmin/')) return
  if (pathname === '/api/superadmin/login') return
  await requireSuperadmin(req)
}

function isLoginRateLimitEnabled() {
  const flag = process.env.SUPERADMIN_LOGIN_RATE_LIMIT?.trim().toLowerCase()
  if (flag === 'false' || flag === '0' || flag === 'off') return false
  if (flag === 'true' || flag === '1' || flag === 'on') return true
  return process.env.NODE_ENV === 'production'
}

export async function checkLoginRateLimit(req) {
  if (!isLoginRateLimitEnabled()) return true
  const ip = getClientIp(req)
  return consumeRateLimit({
    namespace: LOGIN_RATE_NAMESPACE,
    key: ip,
    max: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
  })
}

export function resetLoginAttempts(req) {
  if (!isLoginRateLimitEnabled()) return
  resetMemoryRateLimit(LOGIN_RATE_NAMESPACE, getClientIp(req))
}

export { getClientIp }

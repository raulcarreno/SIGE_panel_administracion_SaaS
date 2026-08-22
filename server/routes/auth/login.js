import { OAuth2Client } from 'google-auth-library'
import {
  checkLoginRateLimit,
  getGoogleClientId,
  isAllowedSuperadminEmail,
  isGoogleLoginConfigured,
  resetLoginAttempts,
  signPanelToken,
} from '../../../api/_lib/panelAuth.js'
import { upsertPanelUser } from '../../../api/_lib/auditLog.js'
import { getJsonBody, handleApiError, sendJson } from '../../../api/_lib/apiHelpers.js'

const googleClient = new OAuth2Client()

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }

  try {
    if (!isGoogleLoginConfigured()) {
      return sendJson(res, 503, { error: 'Superadmin login is not configured.' })
    }

    if (!(await checkLoginRateLimit(req))) {
      return sendJson(res, 429, {
        error: 'Too many login attempts. Try again in 15 minutes.',
      })
    }

    const body = getJsonBody(req)
    const idToken = body?.idToken?.trim()
    if (!idToken) {
      return sendJson(res, 400, { error: 'Google idToken is required.' })
    }

    let ticket
    try {
      ticket = await googleClient.verifyIdToken({
        idToken,
        audience: getGoogleClientId(),
      })
    } catch {
      return sendJson(res, 401, { error: 'Invalid Google token.' })
    }

    const payload = ticket.getPayload()
    const email = payload?.email?.trim().toLowerCase()
    const isVerifiedEmail = payload?.email_verified === true

    if (!email || !isVerifiedEmail || !isAllowedSuperadminEmail(email)) {
      return sendJson(res, 401, { error: 'Unauthorized Google account.' })
    }

    resetLoginAttempts(req)
    await upsertPanelUser({ email, googleSub: payload?.sub })
    const token = await signPanelToken(email)
    return sendJson(res, 200, { token, email })
  } catch (error) {
    return handleApiError(res, error)
  }
}

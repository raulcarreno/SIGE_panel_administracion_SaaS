import {
  isAllowedSuperadminEmail,
  isDevLoginEnabled,
  resetLoginAttempts,
  signPanelToken,
} from '../../../api/_lib/panelAuth.js'
import { upsertPanelUser } from '../../../api/_lib/auditLog.js'
import { getJsonBody, handleApiError, sendJson } from '../../../api/_lib/apiHelpers.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }

  try {
    if (!isDevLoginEnabled()) {
      return sendJson(res, 404, { error: 'Dev login is disabled.' })
    }

    const body = getJsonBody(req)
    const email = body?.email?.trim().toLowerCase()

    if (!email) {
      return sendJson(res, 400, { error: 'Email is required.' })
    }

    if (!isAllowedSuperadminEmail(email)) {
      return sendJson(res, 401, { error: 'Email not in SUPERADMIN_ALLOWED_EMAILS.' })
    }

    resetLoginAttempts(req)
    await upsertPanelUser({ email })
    const token = await signPanelToken(email)
    return sendJson(res, 200, { token, email, mode: 'dev' })
  } catch (error) {
    return handleApiError(res, error)
  }
}

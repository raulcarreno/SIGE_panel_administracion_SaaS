import { checkDbConnection } from '../../api/_lib/db.js'
import { sendJson } from '../../api/_lib/apiHelpers.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }

  const dbOk = await checkDbConnection()
  return sendJson(res, 200, {
    status: 'ok',
    db: dbOk ? 'connected' : 'unreachable',
  })
}

import loginHandler from './routes/auth/login.js'
import devLoginHandler from './routes/auth/devLogin.js'
import healthHandler from './routes/health.js'
import {
  auditHandler,
  configGetHandler,
  configPutHandler,
  createHandler,
  dashboardHandler,
  deleteHandler,
  detailHandler,
  listHandler,
  maintenanceHandler,
  migrationsGetHandler,
  migrationsRunHandler,
  patchHandler,
  settingsGetHandler,
  settingsPutHandler,
  syncAllHandler,
  syncHandler,
  versioningDeployHandler,
  versioningGetHandler,
  versioningJobsHandler,
  versioningPromoteHandler,
} from './routes/tenants/handlers.js'
import {
  getGoogleClientId,
  isDevLoginEnabled,
  isGoogleLoginConfigured,
  requireSuperadmin,
} from '../api/_lib/panelAuth.js'
import { handleApiError } from '../api/_lib/apiHelpers.js'

async function publicConfigHandler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
  return res.status(200).json({
    googleClientId: getGoogleClientId(),
    googleLoginEnabled: isGoogleLoginConfigured(),
    devLoginEnabled: isDevLoginEnabled(),
  })
}

const STATIC_ROUTES = new Map([
  ['GET /api/health', healthHandler],
  ['GET /api/superadmin/public-config', publicConfigHandler],
  ['POST /api/superadmin/login', loginHandler],
  ['POST /api/superadmin/login/dev', devLoginHandler],
  ['GET /api/superadmin/dashboard', dashboardHandler],
  ['GET /api/superadmin/tenants', listHandler],
  ['POST /api/superadmin/tenants', createHandler],
  ['POST /api/superadmin/tenants/sync-all', syncAllHandler],
])

const TENANT_ROUTES = [
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)$/, methods: { GET: detailHandler, PATCH: patchHandler, DELETE: deleteHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/sync$/, methods: { POST: syncHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/config$/, methods: { GET: configGetHandler, PUT: configPutHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/settings$/, methods: { GET: settingsGetHandler, PUT: settingsPutHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/migrations$/, methods: { GET: migrationsGetHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/migrations\/run$/, methods: { POST: migrationsRunHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/maintenance$/, methods: { POST: maintenanceHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/audit$/, methods: { GET: auditHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning$/, methods: { GET: versioningGetHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning\/promote$/, methods: { POST: versioningPromoteHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning\/deploy$/, methods: { POST: versioningDeployHandler } },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning\/jobs$/, methods: { GET: versioningJobsHandler } },
]

function buildPathname(segments) {
  if (!segments?.length) return '/api'
  return `/api/${segments.map((segment) => String(segment)).join('/')}`
}

export async function dispatchApiRequest(req, res, pathSegments) {
  const pathname = buildPathname(pathSegments)
  const method = req.method || 'GET'
  const routeKey = `${method} ${pathname}`

  try {
    const publicPaths = new Set([
      '/api/superadmin/login',
      '/api/superadmin/login/dev',
      '/api/superadmin/public-config',
    ])
    if (pathname.startsWith('/api/superadmin/') && !publicPaths.has(pathname)) {
      req.superadmin = await requireSuperadmin(req)
    }
  } catch (error) {
    return handleApiError(res, error)
  }

  const staticHandler = STATIC_ROUTES.get(routeKey)
  if (staticHandler) {
    return staticHandler(req, res)
  }

  for (const route of TENANT_ROUTES) {
    const match = pathname.match(route.pattern)
    if (!match) continue
    const handler = route.methods[method]
    if (!handler) continue
    req.params = { id: decodeURIComponent(match[1]) }
    return handler(req, res)
  }

  return res.status(404).json({ error: 'Not found.' })
}

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
  domainsCustomAddHandler,
  domainsCustomDeleteHandler,
  domainsCustomVerifyHandler,
  domainsGetHandler,
  domainsProvisionHandler,
  runtimeGetHandler,
  runtimeLogsGetHandler,
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
  {
    pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/domains\/custom\/([^/]+)\/verify$/,
    methods: { POST: domainsCustomVerifyHandler },
    paramNames: ['id', 'domainId'],
  },
  {
    pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/domains\/custom\/([^/]+)$/,
    methods: { DELETE: domainsCustomDeleteHandler },
    paramNames: ['id', 'domainId'],
  },
  {
    pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/domains\/custom$/,
    methods: { POST: domainsCustomAddHandler },
    paramNames: ['id'],
  },
  {
    pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/domains\/provision$/,
    methods: { POST: domainsProvisionHandler },
    paramNames: ['id'],
  },
  {
    pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/domains$/,
    methods: { GET: domainsGetHandler },
    paramNames: ['id'],
  },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)$/, methods: { GET: detailHandler, PATCH: patchHandler, DELETE: deleteHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/sync$/, methods: { POST: syncHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/config$/, methods: { GET: configGetHandler, PUT: configPutHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/settings$/, methods: { GET: settingsGetHandler, PUT: settingsPutHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/migrations$/, methods: { GET: migrationsGetHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/migrations\/run$/, methods: { POST: migrationsRunHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/maintenance$/, methods: { POST: maintenanceHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/audit$/, methods: { GET: auditHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/runtime\/logs$/, methods: { GET: runtimeLogsGetHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/runtime$/, methods: { GET: runtimeGetHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning$/, methods: { GET: versioningGetHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning\/promote$/, methods: { POST: versioningPromoteHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning\/deploy$/, methods: { POST: versioningDeployHandler }, paramNames: ['id'] },
  { pattern: /^\/api\/superadmin\/tenants\/([^/]+)\/versioning\/jobs$/, methods: { GET: versioningJobsHandler }, paramNames: ['id'] },
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
    const paramNames = route.paramNames || ['id']
    req.params = {}
    for (let index = 0; index < paramNames.length; index += 1) {
      req.params[paramNames[index]] = decodeURIComponent(match[index + 1])
    }
    return handler(req, res)
  }

  return res.status(404).json({ error: 'Not found.' })
}

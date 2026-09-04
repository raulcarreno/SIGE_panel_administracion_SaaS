const DEFAULT_BASE_DOMAIN = 'findspo.com'

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i

export function getSaasBaseDomain(override) {
  const value = (override || process.env.SAAS_BASE_DOMAIN || DEFAULT_BASE_DOMAIN).trim().toLowerCase()
  return value.replace(/^\.+|\.+$/g, '')
}

export function normalizeHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return ''
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
}

export function isValidHostname(hostname) {
  const normalized = normalizeHostname(hostname)
  if (!normalized || normalized.includes('..')) return false
  if (normalized.startsWith('*.')) return false
  return HOSTNAME_RE.test(normalized)
}

export function normalizeSlug(slug) {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Platform demo tenant uses shared Services `sige-erp` / `sige-web`
 * (hosts sige-saas.findspo.com / www.sige-saas.findspo.com), not sige-erp-{slug}.
 */
export function getPlatformDemoSlug() {
  return normalizeSlug(process.env.PLATFORM_DEMO_SLUG || 'sige-saas')
}

export function isPlatformDemoSlug(slug) {
  const demo = getPlatformDemoSlug()
  return Boolean(demo) && normalizeSlug(slug) === demo
}

/**
 * Isolated tenant Services (default: sige-erp-{slug}).
 * Set PLATFORM_TENANT_ISOLATED=0 to use shared PLATFORM_ERP_SERVICE (legacy demo).
 * Platform demo slug always maps to sige-erp / sige-web.
 */
export function tenantErpServiceName(slug) {
  const normalized = normalizeSlug(slug)
  if (isPlatformDemoSlug(normalized) || process.env.PLATFORM_TENANT_ISOLATED === '0') {
    return process.env.PLATFORM_ERP_SERVICE?.trim() || 'sige-erp'
  }
  const tpl = process.env.PLATFORM_ERP_SERVICE_TEMPLATE?.trim() || 'sige-erp-{slug}'
  return tpl.replaceAll('{slug}', normalized)
}

export function tenantWebServiceName(slug) {
  const normalized = normalizeSlug(slug)
  if (isPlatformDemoSlug(normalized) || process.env.PLATFORM_TENANT_ISOLATED === '0') {
    return process.env.PLATFORM_WEB_SERVICE?.trim() || 'sige-web'
  }
  const tpl = process.env.PLATFORM_WEB_SERVICE_TEMPLATE?.trim() || 'sige-web-{slug}'
  return tpl.replaceAll('{slug}', normalized)
}

export function tenantErpDeploymentName(slug) {
  return tenantErpServiceName(slug)
}

export function tenantWebDeploymentName(slug) {
  return tenantWebServiceName(slug)
}

/**
 * Canonical SaaS hosts: erp.<slug>.<base> + www.<slug>.<base>
 * Platform demo uses apex hosts: <slug>.<base> + www.<slug>.<base>
 */
export function deriveSaasHosts(slug, baseDomain = getSaasBaseDomain()) {
  const normalizedSlug = normalizeSlug(slug)
  const base = getSaasBaseDomain(baseDomain)
  if (!normalizedSlug) {
    const error = new Error('slug is required to derive SaaS hosts.')
    error.statusCode = 400
    throw error
  }
  if (isPlatformDemoSlug(normalizedSlug)) {
    return {
      saasBaseDomain: base,
      erpHost: `${normalizedSlug}.${base}`,
      webHost: `www.${normalizedSlug}.${base}`,
    }
  }
  return {
    saasBaseDomain: base,
    erpHost: `erp.${normalizedSlug}.${base}`,
    webHost: `www.${normalizedSlug}.${base}`,
  }
}

export function httpsUrlForHost(hostname) {
  const host = normalizeHostname(hostname)
  return host ? `https://${host}` : ''
}

/**
 * CMS admin is served on cms.<domain>, never on public www.<domain>.
 * www.acme.findspo.com → cms.acme.findspo.com
 */
export function cmsAdminHostFromWebHost(webHost) {
  const host = normalizeHostname(webHost)
  if (!host) return ''
  if (host.startsWith('cms.')) return host
  if (host.startsWith('www.')) return `cms.${host.slice(4)}`
  return `cms.${host}`
}

export function cmsAdminUrlFromWebHost(webHost) {
  const host = cmsAdminHostFromWebHost(webHost)
  return host ? `https://${host}/admin` : ''
}

export function ionosRecordNameForHost(hostname, zoneName) {
  const host = normalizeHostname(hostname)
  const zone = normalizeHostname(zoneName || getSaasBaseDomain())
  if (!host.endsWith(`.${zone}`) && host !== zone) {
    const error = new Error(`Hostname ${host} is outside DNS zone ${zone}.`)
    error.statusCode = 400
    throw error
  }
  if (host === zone) return '@'
  return host.slice(0, -(zone.length + 1))
}

/**
 * Manual DNS steps for operators (IONOS UI). Not applied by the panel.
 */
export function buildManualDnsInstructions({
  erpHost,
  webHost,
  ingressIp,
  zoneName = getSaasBaseDomain(),
  customDomains = [],
}) {
  const zone = normalizeHostname(zoneName)
  const aRecords = [
    {
      type: 'A',
      name: ionosRecordNameForHost(erpHost, zone),
      hostname: normalizeHostname(erpHost),
      value: ingressIp || '<INGRESS_IP>',
      ttl: 300,
    },
    {
      type: 'A',
      name: ionosRecordNameForHost(webHost, zone),
      hostname: normalizeHostname(webHost),
      value: ingressIp || '<INGRESS_IP>',
      ttl: 300,
    },
  ]

  const cnameRecords = (customDomains || []).map((entry) => {
    const hostname = normalizeHostname(entry.hostname || entry)
    const kind = entry.kind || 'web'
    const target = kind === 'erp' ? normalizeHostname(erpHost) : normalizeHostname(webHost)
    return {
      type: 'CNAME',
      hostname,
      value: target,
      kind,
      note: 'Create at the customer DNS provider (or IONOS if they host there).',
    }
  })

  return {
    provider: 'IONOS (manual)',
    zone,
    ingressIp: ingressIp || null,
    aRecords,
    cnameRecords,
    summary: [
      `In IONOS DNS zone ${zone}, create A records for erp.<slug> and www.<slug> pointing to the Ingress IP.`,
      'Custom domains: customer CNAME → the SaaS host, then Verify in Superadmin.',
    ],
  }
}

export function buildTenantDomainManifest({
  slug,
  namespace,
  erpHost,
  webHost,
  customHosts = [],
  erpService,
  webService,
}) {
  const normalizedSlug = normalizeSlug(slug)
  const resolvedErp = erpService || tenantErpServiceName(normalizedSlug)
  const resolvedWeb = webService || tenantWebServiceName(normalizedSlug)
  const certName = `sige-cert-${normalizedSlug}`
  const ingressName = `sige-tenant-${normalizedSlug}`
  const domains = [
    normalizeHostname(erpHost),
    normalizeHostname(webHost),
    ...customHosts.map((entry) => normalizeHostname(entry.hostname || entry)),
  ].filter(Boolean)
  const uniqueDomains = [...new Set(domains)]

  const hostService = new Map()
  hostService.set(normalizeHostname(erpHost), resolvedErp)
  hostService.set(normalizeHostname(webHost), resolvedWeb)
  for (const entry of customHosts) {
    const host = normalizeHostname(entry.hostname || entry)
    if (!host) continue
    const kind = entry.kind || 'web'
    hostService.set(host, kind === 'erp' ? resolvedErp : resolvedWeb)
  }

  const rules = uniqueDomains.map((host) => ({
    host,
    service: hostService.get(host) || resolvedWeb,
  }))

  const certYaml = [
    'apiVersion: networking.gke.io/v1',
    'kind: ManagedCertificate',
    'metadata:',
    `  name: ${certName}`,
    `  namespace: ${namespace}`,
    'spec:',
    '  domains:',
    ...uniqueDomains.map((d) => `    - ${d}`),
  ].join('\n')

  const ingressYaml = [
    'apiVersion: networking.k8s.io/v1',
    'kind: Ingress',
    'metadata:',
    `  name: ${ingressName}`,
    `  namespace: ${namespace}`,
    '  annotations:',
    '    kubernetes.io/ingress.class: gce',
    `    networking.gke.io/managed-certificates: ${certName}`,
    'spec:',
    '  rules:',
    ...rules.flatMap((rule) => [
      `    - host: ${rule.host}`,
      '      http:',
      '        paths:',
      '          - path: /*',
      '            pathType: ImplementationSpecific',
      '            backend:',
      '              service:',
      `                name: ${rule.service}`,
      '                port:',
      '                  number: 80',
    ]),
  ].join('\n')

  return {
    certName,
    ingressName,
    domains: uniqueDomains,
    erpService: resolvedErp,
    webService: resolvedWeb,
    yaml: `${certYaml}\n---\n${ingressYaml}\n`,
  }
}

/**
 * Evaluate whether DNS for hostname points at verificationTarget (CNAME or A).
 * @param {{ resolveCname: Function, resolve4: Function }} dnsApi
 */
export async function evaluateDnsVerification(
  hostname,
  verificationTarget,
  expectedIp,
  dnsApi,
) {
  const host = normalizeHostname(hostname)
  const target = normalizeHostname(verificationTarget)
  const errors = []

  try {
    const cnames = await dnsApi.resolveCname(host)
    const normalized = (cnames || []).map(normalizeHostname)
    if (normalized.includes(target) || normalized.some((c) => c === `${target}.`)) {
      return { ok: true, method: 'cname', records: normalized }
    }
    if (normalized.length) {
      errors.push(`CNAME points to ${normalized.join(', ')}; expected ${target}`)
    }
  } catch (error) {
    if (error.code !== 'ENODATA' && error.code !== 'ENOTFOUND') {
      errors.push(`CNAME lookup failed: ${error.message}`)
    }
  }

  if (expectedIp) {
    try {
      const addresses = await dnsApi.resolve4(host)
      if ((addresses || []).includes(expectedIp)) {
        return { ok: true, method: 'a', records: addresses }
      }
      if (addresses?.length) {
        errors.push(`A records ${addresses.join(', ')}; expected ${expectedIp}`)
      }
    } catch (error) {
      if (error.code !== 'ENODATA' && error.code !== 'ENOTFOUND') {
        errors.push(`A lookup failed: ${error.message}`)
      }
    }
  }

  return {
    ok: false,
    method: null,
    records: [],
    error:
      errors.join('; ') ||
      `DNS for ${host} does not point to ${target}${expectedIp ? ` or A ${expectedIp}` : ''}`,
  }
}

function sanitizeLogName(hostname) {
  return String(hostname || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * @param {{
 *   serverName: string,
 *   port: number,
 *   aliases?: string[],
 *   blockWwwAdmin?: boolean,
 * }} options
 * When blockWwwAdmin is true:
 * - browser /admin on www.* redirects to https://crm.<rest>/admin (friendly UX)
 * - /api/admin on www.* stays forbidden
 * - cms.* / crm.* public paths redirect to /admin
 */
export function buildApacheVhost({
  serverName,
  port,
  aliases = [],
  blockWwwAdmin = false,
  cmsAdminRedirectBase = '',
}) {
  const host = String(serverName || '').trim().toLowerCase()
  const listenPort = Number(port)
  if (!host) {
    const error = new Error('serverName is required.')
    error.statusCode = 400
    throw error
  }
  if (!Number.isInteger(listenPort) || listenPort < 1) {
    const error = new Error('port must be a positive integer.')
    error.statusCode = 400
    throw error
  }

  const uniqueAliases = [...new Set(aliases.map((item) => String(item).trim().toLowerCase()).filter(Boolean))]
    .filter((alias) => alias !== host)
  const aliasLine = uniqueAliases.length ? `    ServerAlias ${uniqueAliases.join(' ')}\n` : ''

  let cmsRedirectTarget = String(cmsAdminRedirectBase || '').trim().replace(/\/$/, '')
  if (!cmsRedirectTarget && host.startsWith('www.')) {
    cmsRedirectTarget = `https://crm.${host.slice(4)}`
  }

  const adminBlock = blockWwwAdmin
    ? `    RewriteEngine On
    RewriteCond %{HTTP_HOST} ^www\\. [NC]
    RewriteRule ^/admin(/.*)?$ ${cmsRedirectTarget || 'https://crm.example.com'}/admin$1 [R=302,L]
    RewriteCond %{HTTP_HOST} ^www\\. [NC]
    RewriteRule ^/api/admin(/.*)?$ - [F,L]
    RewriteCond %{HTTP_HOST} ^(cms|crm)\\. [NC]
    RewriteCond %{REQUEST_URI} !^/admin
    RewriteCond %{REQUEST_URI} !^/api/
    RewriteCond %{REQUEST_URI} !^/assets/
    RewriteCond %{REQUEST_URI} !^/images/
    RewriteRule ^ /admin [R=302,L]
`
    : ''
  const log = sanitizeLogName(host)

  return `<VirtualHost *:80>
    ServerName ${host}
${aliasLine}    ProxyPreserveHost On
${adminBlock}    ProxyPass / http://127.0.0.1:${listenPort}/
    ProxyPassReverse / http://127.0.0.1:${listenPort}/
    RequestHeader set X-Forwarded-Proto "expr=%{REQUEST_SCHEME}"
    Timeout 300
    ProxyTimeout 300
    ErrorLog \${APACHE_LOG_DIR}/sige-${log}-error.log
    CustomLog \${APACHE_LOG_DIR}/sige-${log}-access.log combined
</VirtualHost>
`
}

export function vhostFileName(hostname, prefix = '100') {
  return `${prefix}-${String(hostname).trim().toLowerCase()}.conf`
}

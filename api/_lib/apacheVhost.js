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
 * When blockWwwAdmin is true, /admin and /api/admin are forbidden on Host www.*.
 * Use a cms.* (or non-www) alias on the same backend for CMS admin access.
 */
export function buildApacheVhost({ serverName, port, aliases = [], blockWwwAdmin = false }) {
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
  const adminBlock = blockWwwAdmin
    ? `    RewriteEngine On
    RewriteCond %{HTTP_HOST} ^www\\. [NC]
    RewriteRule ^/(admin|api/admin)(/.*)?$ - [F,L]
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

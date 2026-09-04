function sanitizeLogName(hostname) {
  return String(hostname || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildApacheVhost({ serverName, port, aliases = [] }) {
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
  const log = sanitizeLogName(host)

  return `<VirtualHost *:80>
    ServerName ${host}
${aliasLine}    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:${listenPort}/
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

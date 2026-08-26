import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import Alert from '../ui/Alert'
import Button from '../ui/Button'

const TAIL_OPTIONS = [100, 200, 500]
const REFRESH_MS = 10_000

function statusBadgeClass(status) {
  if (status === 'ready') return 'badge badge-active'
  if (status === 'crash' || status === 'unhealthy') return 'badge badge-suspended'
  if (status === 'pending') return 'badge badge-future'
  if (status === 'missing') return 'badge badge-unknown'
  return 'badge badge-unknown'
}

function formatUptime(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—'
  const total = Math.max(0, Number(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${total % 60}s`
  return `${total}s`
}

function ServiceCard({ title, service, t }) {
  if (!service) return null
  const pod = service.pods?.[0]
  const app = service.app || {}
  const replicas = service.deployment
    ? `${service.deployment.readyReplicas ?? 0}/${service.deployment.replicas ?? 0}`
    : '—'

  return (
    <div className="card versioning-card">
      <div className="card__header-row">
        <h3 className="card__title">{title}</h3>
        <span className={statusBadgeClass(service.status)}>
          {t(`monitoring.${service.status || 'unknown'}`)}
        </span>
      </div>
      <div className="overview-grid">
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.appHealth')}</p>
          <p className="overview-item__value">
            {app.reachable === false
              ? t('monitoring.unreachable')
              : app.ok
                ? t('monitoring.healthy')
                : t('monitoring.unhealthy')}
          </p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.replicas')}</p>
          <p className="overview-item__value">{replicas}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.restarts')}</p>
          <p className="overview-item__value">{pod?.restarts ?? '—'}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.phase')}</p>
          <p className="overview-item__value">{pod?.phase || pod?.reason || '—'}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.pod')}</p>
          <p className="overview-item__value overview-item__value--wrap">
            <code>{pod?.name || t('monitoring.noPods')}</code>
          </p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.node')}</p>
          <p className="overview-item__value">{pod?.node || '—'}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.image')}</p>
          <p className="overview-item__value overview-item__value--wrap">
            <code>{pod?.image || service.deployment?.image || '—'}</code>
          </p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.version')}</p>
          <p className="overview-item__value">{app.appVersion || '—'}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.db')}</p>
          <p className="overview-item__value">{app.db || '—'}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('monitoring.uptime')}</p>
          <p className="overview-item__value">{formatUptime(app.uptimeSeconds)}</p>
        </div>
      </div>
      {app.error ? <Alert variant="error">{app.error}</Alert> : null}
    </div>
  )
}

export default function TenantMonitoring({ tenantId }) {
  const { t } = useTranslation()
  const [runtime, setRuntime] = useState(null)
  const [logs, setLogs] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState('')
  const [logQuery, setLogQuery] = useState({
    component: 'erp',
    tailLines: 200,
    previous: false,
  })

  const loadRuntime = useCallback(async () => {
    const data = await apiRequest(`/api/superadmin/tenants/${tenantId}/runtime`)
    setRuntime(data)
  }, [tenantId])

  const loadLogs = useCallback(async () => {
    const params = new URLSearchParams({
      component: logQuery.component,
      tailLines: String(logQuery.tailLines),
      previous: logQuery.previous ? 'true' : 'false',
    })
    const data = await apiRequest(
      `/api/superadmin/tenants/${tenantId}/runtime/logs?${params.toString()}`,
    )
    setLogs(data)
  }, [tenantId, logQuery])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    setError('')
    const errors = []
    try {
      await loadRuntime()
    } catch (err) {
      errors.push(err.message)
    }
    try {
      await loadLogs()
    } catch (err) {
      errors.push(err.message)
    }
    if (errors.length) setError(errors.join(' '))
    setLoading(false)
  }, [loadRuntime, loadLogs])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (!autoRefresh) return undefined
    const timer = setInterval(() => {
      refreshAll()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [autoRefresh, refreshAll])

  const filteredLogs = useMemo(() => {
    const text = logs?.logs || ''
    if (!filter.trim()) return text
    const needle = filter.trim().toLowerCase()
    return text
      .split('\n')
      .filter((line) => line.toLowerCase().includes(needle))
      .join('\n')
  }, [logs, filter])

  async function handleCopy() {
    if (!filteredLogs) return
    try {
      await navigator.clipboard.writeText(filteredLogs)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError(t('error'))
    }
  }

  if (!runtime && !error) {
    return <p className="muted">{t('loading')}</p>
  }

  return (
    <div className="tenant-monitoring">
      <div className="card">
        <div className="card__header-row">
          <div>
            <h2 className="card__title">{t('monitoring.title')}</h2>
            <p className="muted">{t('monitoring.lead')}</p>
          </div>
          <div className="page-header__actions">
            <label className="monitoring-toggle">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              {t('monitoring.autoRefresh')}
            </label>
            <Button variant="secondary" disabled={loading} onClick={refreshAll}>
              {t('monitoring.refresh')}
            </Button>
          </div>
        </div>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {runtime && !runtime.clusterAvailable ? (
          <Alert variant="warning">
            {t('monitoring.clusterUnavailable')}
            {runtime.clusterError ? ` ${runtime.clusterError}` : ''}
          </Alert>
        ) : null}
      </div>

      {runtime ? (
        <div className="versioning-grid">
          <ServiceCard title={t('monitoring.erp')} service={runtime.services?.erp} t={t} />
          <ServiceCard title={t('monitoring.web')} service={runtime.services?.web} t={t} />
        </div>
      ) : null}

      <div className="card">
        <h3 className="card__title">{t('monitoring.events')}</h3>
        {runtime?.events?.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('monitoring.status')}</th>
                  <th>{t('monitoring.pod')}</th>
                  <th>{t('monitoring.events')}</th>
                  <th>{t('monitoring.age')}</th>
                </tr>
              </thead>
              <tbody>
                {runtime.events.map((event, index) => (
                  <tr key={`${event.object}-${event.reason}-${index}`}>
                    <td>
                      <span className={event.type === 'Warning' ? 'badge badge-expired' : 'badge badge-unknown'}>
                        {event.reason || event.type}
                      </span>
                    </td>
                    <td><code>{event.object}</code></td>
                    <td>{event.message}</td>
                    <td>{event.lastTimestamp ? new Date(event.lastTimestamp).toLocaleString('es-ES') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t('monitoring.noEvents')}</p>
        )}
      </div>

      <div className="card">
        <div className="card__header-row">
          <h3 className="card__title">{t('monitoring.logs')}</h3>
          <div className="page-header__actions">
            <Button variant="secondary" disabled={loading} onClick={handleCopy}>
              {copied ? t('monitoring.copied') : t('monitoring.copy')}
            </Button>
          </div>
        </div>
        <div className="monitoring-log-controls">
          <label>
            {t('monitoring.component')}
            <select
              value={logQuery.component}
              onChange={(event) => setLogQuery((current) => ({ ...current, component: event.target.value }))}
            >
              <option value="erp">{t('monitoring.erp')}</option>
              <option value="web">{t('monitoring.web')}</option>
            </select>
          </label>
          <label>
            {t('monitoring.tailLines')}
            <select
              value={logQuery.tailLines}
              onChange={(event) => setLogQuery((current) => ({
                ...current,
                tailLines: Number(event.target.value),
              }))}
            >
              {TAIL_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="monitoring-toggle">
            <input
              type="checkbox"
              checked={logQuery.previous}
              onChange={(event) => setLogQuery((current) => ({
                ...current,
                previous: event.target.checked,
              }))}
            />
            {t('monitoring.previous')}
          </label>
          <label className="monitoring-filter">
            {t('monitoring.filter')}
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('monitoring.filterPlaceholder')}
            />
          </label>
        </div>
        {logs?.previousMissing ? (
          <Alert variant="warning">{t('monitoring.previousMissing')}</Alert>
        ) : null}
        {logs?.podName ? (
          <p className="muted">
            {logs.podName} · {logs.container}
          </p>
        ) : null}
        <pre className="monitoring-log-viewer">{filteredLogs || t('monitoring.emptyLogs')}</pre>
      </div>
    </div>
  )
}

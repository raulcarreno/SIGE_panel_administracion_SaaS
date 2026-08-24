import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import TenantStatusBadge from '../../components/TenantStatusBadge'
import TenantSectionNav from '../../components/tenant/TenantSectionNav'
import TenantComposition from '../../components/tenant/TenantComposition'
import TenantVersioning from '../../components/tenant/TenantVersioning'
import TenantDomains from '../../components/tenant/TenantDomains'
import PageHeader from '../../components/ui/PageHeader'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'

const LOCKED_MODULES = new Set(['admin_panel', 'public_site_shell', 'health'])

function toDatetimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function TenantDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { t } = useTranslation()
  const [tab, setTab] = useState(location.state?.domainWarning ? 'domains' : 'overview')
  const [tenant, setTenant] = useState(null)
  const [configData, setConfigData] = useState(null)
  const [settingsData, setSettingsData] = useState(null)
  const [migrationsData, setMigrationsData] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [versioningStatus, setVersioningStatus] = useState(null)
  const [error, setError] = useState(location.state?.domainWarning || '')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadTenant() {
    const data = await apiRequest(`/api/superadmin/tenants/${id}`)
    setTenant(data.tenant)
  }

  useEffect(() => {
    loadTenant().catch((err) => setError(err.message))
  }, [id])

  useEffect(() => {
    setError('')
    setMessage('')
    if (tab === 'modules' || tab === 'validity') {
      apiRequest(`/api/superadmin/tenants/${id}/config`)
        .then(setConfigData)
        .catch((err) => setError(err.message))
    }
    if (tab === 'settings') {
      apiRequest(`/api/superadmin/tenants/${id}/settings`)
        .then(setSettingsData)
        .catch((err) => setError(err.message))
    }
    if (tab === 'migrations') {
      apiRequest(`/api/superadmin/tenants/${id}/migrations`)
        .then(setMigrationsData)
        .catch((err) => setError(err.message))
    }
    if (tab === 'audit') {
      apiRequest(`/api/superadmin/tenants/${id}/audit`)
        .then((data) => setAuditEntries(data.entries))
        .catch((err) => setError(err.message))
    }
    if (tab === 'versioning') {
      apiRequest(`/api/superadmin/tenants/${id}/versioning`)
        .then(setVersioningStatus)
        .catch((err) => setError(err.message))
    }
  }, [tab, id])

  async function refreshVersioning() {
    const data = await apiRequest(`/api/superadmin/tenants/${id}/versioning`)
    setVersioningStatus(data)
  }

  async function handlePromote(component) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/api/superadmin/tenants/${id}/versioning/promote`, {
        method: 'POST',
        body: { component },
      })
      await refreshVersioning()
      setMessage(t('versioning.promoteOk'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeploy(component) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/api/superadmin/tenants/${id}/versioning/deploy`, {
        method: 'POST',
        body: { component },
      })
      await refreshVersioning()
      setMessage(t('versioning.deployOk'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  async function handleSync() {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/api/superadmin/tenants/${id}/sync`, { method: 'POST' })
      if (result.tenant) setTenant(result.tenant)
      else await loadTenant()
      setMessage(t('syncComplete'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig(body) {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/api/superadmin/tenants/${id}/config`, {
        method: 'PUT',
        body,
      })
      const { tenant: updatedTenant, ...configResult } = result
      setConfigData(configResult)
      if (updatedTenant) setTenant(updatedTenant)
      else await loadTenant()
      setMessage(t('configSaved'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings(body) {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/api/superadmin/tenants/${id}/settings`, {
        method: 'PUT',
        body,
      })
      const { tenant: updatedTenant, ...settingsResult } = result
      setSettingsData(settingsResult)
      if (updatedTenant) setTenant(updatedTenant)
      setMessage(t('settingsSaved'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleMaintenance(enabled) {
    if (!window.confirm(`¿${enabled ? 'Activar' : 'Desactivar'} modo mantenimiento?`)) return
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/api/superadmin/tenants/${id}/maintenance`, {
        method: 'POST',
        body: { enabled },
      })
      if (result.tenant) {
        setTenant(result.tenant)
      } else {
        await loadTenant()
      }
      setMessage(t('maintenanceUpdated'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function runMigrations() {
    if (!window.confirm('¿Ejecutar migraciones pendientes en el pod?')) return
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest(`/api/superadmin/tenants/${id}/migrations/run`, {
        method: 'POST',
      })
      const { tenant: updatedTenant, ...migrationsResult } = result
      setMigrationsData(migrationsResult)
      if (updatedTenant) setTenant(updatedTenant)
      setMessage(t('migrationsRun'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!tenant) return <p>{t('loading')}</p>

  const snapshot = tenant.snapshot?.payload
  const subtitle = [
    tenant.slug,
    t('composition.subtitle'),
    tenant.webBaseUrl ? t('composition.complete') : t('composition.incomplete'),
  ].join(' · ')

  return (
    <div>
      <PageHeader
        title={tenant.displayName}
        subtitle={subtitle}
        breadcrumbs={
          <ol className="breadcrumbs">
            <li><Link to="/superadmin/tenants">{t('nav.tenants')}</Link></li>
            <li className="breadcrumbs__sep">/</li>
            <li>{tenant.slug}</li>
          </ol>
        }
        actions={
          <Button onClick={handleSync} disabled={loading}>{t('sync')}</Button>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}
      {!tenant.webBaseUrl ? (
        <Alert variant="error">{t('composition.incompleteWarning')}</Alert>
      ) : null}

      <div className="tenant-layout">
        <TenantSectionNav active={tab} onChange={setTab} />

        <div>
          {tab === 'overview' ? (
            <>
              <div className="card">
                <TenantComposition tenant={tenant} />
              </div>
              <div className="card">
                <h2 className="card__title">{t('overview')}</h2>
                <div className="overview-grid">
                  <div className="overview-item">
                    <p className="overview-item__label">Database</p>
                    <p className="overview-item__value">{tenant.databaseName || '-'}</p>
                  </div>
                  <div className="overview-item">
                    <p className="overview-item__label">Estado local</p>
                    <p className="overview-item__value">{tenant.status}</p>
                  </div>
                  <div className="overview-item">
                    <p className="overview-item__label">Estado remoto</p>
                    <p className="overview-item__value"><TenantStatusBadge snapshot={snapshot} /></p>
                  </div>
                  <div className="overview-item">
                    <p className="overview-item__label">DB pod</p>
                    <p className="overview-item__value">{snapshot?.db || '-'}</p>
                  </div>
                  <div className="overview-item">
                    <p className="overview-item__label">Versión</p>
                    <p className="overview-item__value">{snapshot?.appVersion || '-'}</p>
                  </div>
                  <div className="overview-item">
                    <p className="overview-item__label">Uptime</p>
                    <p className="overview-item__value">
                      {snapshot?.uptimeSeconds != null ? `${snapshot.uptimeSeconds}s` : '-'}
                    </p>
                  </div>
                  <div className="overview-item">
                    <p className="overview-item__label">Migraciones pendientes</p>
                    <p className="overview-item__value">{snapshot?.migrationsPending ?? '-'}</p>
                  </div>
                </div>
                {tenant.snapshot?.syncError ? (
                  <Alert variant="error">Sync error: {tenant.snapshot.syncError}</Alert>
                ) : null}
              </div>
            </>
          ) : null}

          {tab === 'domains' ? (
            <TenantDomains tenantId={id} onTenantUpdated={loadTenant} />
          ) : null}

          {tab === 'versioning' ? (
            <TenantVersioning
              status={versioningStatus}
              loading={loading}
              onPromote={handlePromote}
              onDeploy={handleDeploy}
              onRefresh={() => {
                setLoading(true)
                refreshVersioning()
                  .catch((err) => setError(err.message))
                  .finally(() => setLoading(false))
              }}
            />
          ) : null}

          {tab === 'modules' && configData ? (
            <ModulesTab configData={configData} loading={loading} onSave={saveConfig} t={t} />
          ) : null}

          {tab === 'validity' && configData ? (
            <ValidityTab config={configData.config} loading={loading} onSave={saveConfig} t={t} />
          ) : null}

          {tab === 'maintenance' ? (
            <div className="card">
              <p>{t('maintenanceCurrent')}: <strong>{snapshot?.maintenanceMode ? t('table.on') : t('table.off')}</strong></p>
              <div className="page-header__actions" style={{ marginTop: '1rem' }}>
                <Button disabled={loading} onClick={() => toggleMaintenance(true)}>
                  {t('enableMaintenance')}
                </Button>
                <Button variant="secondary" disabled={loading} onClick={() => toggleMaintenance(false)}>
                  {t('disableMaintenance')}
                </Button>
              </div>
            </div>
          ) : null}

          {tab === 'migrations' ? (
            <div className="card">
              <div className="page-header__actions" style={{ marginBottom: '1rem' }}>
                <Button onClick={runMigrations} disabled={loading}>{t('runMigrations')}</Button>
              </div>
              {migrationsData ? (
                <>
                  <h3 className="card__title">{t('pendingMigrations')}</h3>
                  <ul>
                    {(migrationsData.pending || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <h3 className="card__title">{t('appliedMigrations')}</h3>
                  <ul>
                    {(migrationsData.applied || []).map((item) => (
                      <li key={typeof item === 'string' ? item : item.name}>
                        {typeof item === 'string' ? item : item.name}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>{t('loading')}</p>
              )}
            </div>
          ) : null}

          {tab === 'settings' && settingsData ? (
            <SettingsTab settings={settingsData.settings} loading={loading} onSave={saveSettings} t={t} />
          ) : null}

          {tab === 'audit' ? (
            <div className="card">
              <ul className="audit-list">
                {auditEntries.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.action}</strong> — {entry.actorEmail}
                    <div>{new Date(entry.createdAt).toLocaleString('es-ES')}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ModulesTab({ configData, loading, onSave, t }) {
  const [modules, setModules] = useState(configData.config.modules)
  const [preset, setPreset] = useState('')

  useEffect(() => {
    setModules(configData.config.modules)
  }, [configData])

  function toggleModule(moduleId) {
    if (LOCKED_MODULES.has(moduleId)) return
    setModules((current) => ({ ...current, [moduleId]: !current[moduleId] }))
  }

  return (
    <div className="card">
      <label>
        {t('form.preset')}
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          <option value="">—</option>
          {(configData.presets || []).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      <div className="module-grid" style={{ marginTop: '1rem' }}>
        {Object.entries(modules).map(([moduleId, enabled]) => (
          <label key={moduleId} className="module-item">
            <span>{moduleId}</span>
            <input
              type="checkbox"
              checked={Boolean(enabled)}
              disabled={LOCKED_MODULES.has(moduleId)}
              onChange={() => toggleModule(moduleId)}
            />
          </label>
        ))}
      </div>
      <div className="page-header__actions" style={{ marginTop: '1rem' }}>
        <Button
          disabled={loading}
          onClick={() => onSave(preset ? { preset } : { modules })}
        >
          {t('saveModules')}
        </Button>
      </div>
    </div>
  )
}

function ValidityTab({ config, loading, onSave, t }) {
  const [validFrom, setValidFrom] = useState(toDatetimeLocal(config.validFrom))
  const [validUntil, setValidUntil] = useState(toDatetimeLocal(config.validUntil))
  const [suspended, setSuspended] = useState(Boolean(config.suspendedAt))

  return (
    <div className="card form-grid">
      <label>
        {t('form.validFrom')}
        <input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </label>
      <label>
        {t('form.validUntil')}
        <input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={suspended} onChange={(e) => setSuspended(e.target.checked)} />
        {' '}{t('form.suspended')}
      </label>
      <div className="page-header__actions">
        <Button
          disabled={loading}
          onClick={() =>
            onSave({
              validFrom: validFrom ? new Date(validFrom).toISOString() : null,
              validUntil: validUntil ? new Date(validUntil).toISOString() : null,
              suspendedAt: suspended ? new Date().toISOString() : null,
            })
          }
        >
          {t('saveValidity')}
        </Button>
      </div>
    </div>
  )
}

function SettingsTab({ settings, loading, onSave, t }) {
  const [siteUrl, setSiteUrl] = useState(settings.siteUrl || '')
  const [integrations, setIntegrations] = useState(settings.integrations || {})

  useEffect(() => {
    setSiteUrl(settings.siteUrl || '')
    setIntegrations(settings.integrations || {})
  }, [settings])

  function updateIntegration(key, value) {
    setIntegrations((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="card form-grid">
      <label>
        {t('form.siteUrl')}
        <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
      </label>
      {Object.entries(integrations).map(([key, value]) => (
        <label key={key}>
          {key}
          <input
            value={typeof value === 'string' ? value : JSON.stringify(value)}
            onChange={(e) => updateIntegration(key, e.target.value)}
          />
        </label>
      ))}
      <div className="page-header__actions">
        <Button disabled={loading} onClick={() => onSave({ siteUrl, integrations })}>
          {t('saveSettings')}
        </Button>
      </div>
    </div>
  )
}

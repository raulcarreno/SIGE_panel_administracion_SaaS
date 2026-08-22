import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import TenantStatusBadge from '../../components/TenantStatusBadge'

const TABS = ['overview', 'modules', 'validity', 'maintenance', 'migrations', 'settings', 'audit']
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
  const { t } = useTranslation()
  const [tab, setTab] = useState('overview')
  const [tenant, setTenant] = useState(null)
  const [configData, setConfigData] = useState(null)
  const [settingsData, setSettingsData] = useState(null)
  const [migrationsData, setMigrationsData] = useState(null)
  const [auditEntries, setAuditEntries] = useState([])
  const [error, setError] = useState('')
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
  }, [tab, id])

  async function handleSync() {
    setLoading(true)
    setError('')
    try {
      await apiRequest(`/api/superadmin/tenants/${id}/sync`, { method: 'POST' })
      await loadTenant()
      setMessage('Sincronización completada.')
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
      setConfigData(result)
      setMessage('Configuración guardada.')
      await loadTenant()
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
      setSettingsData(result)
      setMessage('Settings guardados.')
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
      await apiRequest(`/api/superadmin/tenants/${id}/maintenance`, {
        method: 'POST',
        body: { enabled },
      })
      setMessage('Mantenimiento actualizado.')
      await loadTenant()
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
      setMigrationsData(result)
      setMessage('Migraciones ejecutadas.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!tenant) return <p>{t('loading')}</p>

  const snapshot = tenant.snapshot?.payload

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{tenant.displayName}</h1>
          <p>{tenant.slug} — {tenant.baseUrl}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={handleSync} disabled={loading}>
            {t('sync')}
          </button>
          <a className="btn btn-secondary" href={`${tenant.baseUrl}/admin`} target="_blank" rel="noreferrer">
            Admin tenant
          </a>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={`tab ${tab === item ? 'active' : ''}`}
            onClick={() => setTab(item)}
          >
            {t(item)}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="card">
          <p>BD: <strong>{tenant.databaseName || '-'}</strong></p>
          <p>Estado local: <strong>{tenant.status}</strong></p>
          <p>Estado remoto: <TenantStatusBadge snapshot={snapshot} /></p>
          <p>DB pod: {snapshot?.db || '-'}</p>
          <p>Versión: {snapshot?.appVersion || '-'}</p>
          <p>Uptime: {snapshot?.uptimeSeconds != null ? `${snapshot.uptimeSeconds}s` : '-'}</p>
          <p>Migraciones pendientes: {snapshot?.migrationsPending ?? '-'}</p>
          {tenant.snapshot?.syncError ? (
            <p className="alert alert-error">Sync error: {tenant.snapshot.syncError}</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'modules' && configData ? (
        <ModulesTab
          configData={configData}
          loading={loading}
          onSave={saveConfig}
        />
      ) : null}

      {tab === 'validity' && configData ? (
        <ValidityTab
          config={configData.config}
          loading={loading}
          onSave={saveConfig}
        />
      ) : null}

      {tab === 'maintenance' ? (
        <div className="card actions">
          <p>Estado actual: {snapshot?.maintenanceMode ? 'ON' : 'OFF'}</p>
          <button type="button" className="btn" disabled={loading} onClick={() => toggleMaintenance(true)}>
            Activar mantenimiento
          </button>
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => toggleMaintenance(false)}>
            Desactivar mantenimiento
          </button>
        </div>
      ) : null}

      {tab === 'migrations' ? (
        <div className="card">
          <div className="actions" style={{ marginBottom: '1rem' }}>
            <button type="button" className="btn" onClick={runMigrations} disabled={loading}>
              {t('runMigrations')}
            </button>
          </div>
          {migrationsData ? (
            <>
              <h3>Pendientes</h3>
              <ul>
                {(migrationsData.pending || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>Aplicadas</h3>
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
        <SettingsTab settings={settingsData.settings} loading={loading} onSave={saveSettings} />
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
  )
}

function ModulesTab({ configData, loading, onSave }) {
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
        Preset
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
      <div className="actions" style={{ marginTop: '1rem' }}>
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => onSave(preset ? { preset } : { modules })}
        >
          Guardar módulos
        </button>
      </div>
    </div>
  )
}

function ValidityTab({ config, loading, onSave }) {
  const [validFrom, setValidFrom] = useState(toDatetimeLocal(config.validFrom))
  const [validUntil, setValidUntil] = useState(toDatetimeLocal(config.validUntil))
  const [suspended, setSuspended] = useState(Boolean(config.suspendedAt))

  return (
    <div className="card form-grid">
      <label>
        Válido desde
        <input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </label>
      <label>
        Válido hasta
        <input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={suspended} onChange={(e) => setSuspended(e.target.checked)} />
        {' '}Suspendido
      </label>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() =>
            onSave({
              validFrom: validFrom ? new Date(validFrom).toISOString() : null,
              validUntil: validUntil ? new Date(validUntil).toISOString() : null,
              suspendedAt: suspended ? new Date().toISOString() : null,
            })
          }
        >
          Guardar validez
        </button>
      </div>
    </div>
  )
}

function SettingsTab({ settings, loading, onSave }) {
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
        Site URL
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
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => onSave({ siteUrl, integrations })}
        >
          Guardar settings
        </button>
      </div>
    </div>
  )
}

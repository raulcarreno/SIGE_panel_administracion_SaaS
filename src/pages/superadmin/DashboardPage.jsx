import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'

export default function DashboardPage() {
  const { t } = useTranslation()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    apiRequest('/api/superadmin/dashboard')
      .then((data) => setStats(data.stats))
      .catch((err) => setError(err.message))
  }, [])

  async function handleSyncAll() {
    setSyncing(true)
    setError('')
    try {
      await apiRequest('/api/superadmin/tenants/sync-all', { method: 'POST' })
      const data = await apiRequest('/api/superadmin/dashboard')
      setStats(data.stats)
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('dashboard')}</h1>
        <button type="button" className="btn" onClick={handleSyncAll} disabled={syncing}>
          {syncing ? t('loading') : t('syncAll')}
        </button>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {stats ? (
        <div className="stats-grid">
          <div className="card">
            <div>{t('tenants')}</div>
            <div className="stat-value">{stats.totalTenants}</div>
          </div>
          <div className="card">
            <div>{t('maintenance')}</div>
            <div className="stat-value">{stats.maintenanceCount}</div>
          </div>
          <div className="card">
            <div>{t('migrations')} pendientes</div>
            <div className="stat-value">{stats.pendingMigrationsCount}</div>
          </div>
          <div className="card">
            <div>Expirados / suspendidos</div>
            <div className="stat-value">{stats.expiredCount}</div>
          </div>
        </div>
      ) : (
        <p>{t('loading')}</p>
      )}

      <div className="card">
        <Link to="/superadmin/tenants">{t('tenants')}</Link>
      </div>
    </div>
  )
}

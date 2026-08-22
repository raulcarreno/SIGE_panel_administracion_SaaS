import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'

function StatIcon({ children }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {children}
    </svg>
  )
}

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
      <PageHeader
        title={t('nav.dashboard')}
        actions={
          <Button onClick={handleSyncAll} disabled={syncing}>
            {syncing ? t('loading') : t('syncAll')}
          </Button>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      {stats ? (
        <div className="stats-grid">
          <StatCard
            label={t('stats.totalTenants')}
            value={stats.totalTenants}
            tone="primary"
            icon={<StatIcon><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></StatIcon>}
          />
          <StatCard
            label={t('stats.maintenance')}
            value={stats.maintenanceCount}
            tone="warning"
            icon={<StatIcon><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></StatIcon>}
          />
          <StatCard
            label={t('stats.pendingMigrations')}
            value={stats.pendingMigrationsCount}
            tone="danger"
            icon={<StatIcon><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></StatIcon>}
          />
          <StatCard
            label={t('stats.expiredSuspended')}
            value={stats.expiredCount}
            tone="success"
            icon={<StatIcon><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></StatIcon>}
          />
        </div>
      ) : (
        <p>{t('loading')}</p>
      )}
    </div>
  )
}

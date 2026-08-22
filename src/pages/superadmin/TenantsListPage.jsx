import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import TenantStatusBadge from '../../components/TenantStatusBadge'

export default function TenantsListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/api/superadmin/tenants')
      .then((data) => setTenants(data.tenants))
      .catch((err) => setError(err.message))
  }, [])

  const columns = [
    { key: 'slug', label: t('table.slug') },
    {
      key: 'baseUrl',
      label: t('table.url'),
      render: (row) => (
        <a href={row.baseUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          {row.baseUrl}
        </a>
      ),
    },
    {
      key: 'status',
      label: t('table.status'),
      render: (row) => <TenantStatusBadge snapshot={row.snapshot?.payload} />,
    },
    {
      key: 'maintenance',
      label: t('table.maintenance'),
      render: (row) =>
        row.snapshot?.payload?.maintenanceMode ? (
          <span className="badge badge-maintenance">{t('table.on')}</span>
        ) : (
          t('table.off')
        ),
    },
    {
      key: 'syncedAt',
      label: t('table.lastSync'),
      render: (row) =>
        row.snapshot?.syncedAt
          ? new Date(row.snapshot.syncedAt).toLocaleString('es-ES')
          : '-',
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('nav.tenants')}
        actions={
          <Link to="/superadmin/tenants/new">
            <Button>{t('nav.newTenant')}</Button>
          </Link>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="card card--flat">
        {tenants.length === 0 ? (
          <EmptyState
            title={t('noTenants')}
            description={t('noTenantsDescription')}
            actionLabel={t('nav.newTenant')}
            actionTo="/superadmin/tenants/new"
            LinkComponent={Link}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={tenants}
            onRowClick={(row) => navigate(`/superadmin/tenants/${row.id}`)}
          />
        )}
      </div>
    </div>
  )
}

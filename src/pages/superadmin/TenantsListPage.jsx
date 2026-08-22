import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import TenantStatusBadge from '../../components/TenantStatusBadge'

export default function TenantsListPage() {
  const { t } = useTranslation()
  const [tenants, setTenants] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/api/superadmin/tenants')
      .then((data) => setTenants(data.tenants))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1>{t('tenants')}</h1>
        <Link className="btn" to="/superadmin/tenants/new">{t('newTenant')}</Link>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        {tenants.length === 0 ? (
          <p>{t('noTenants')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>URL</th>
                <th>Estado</th>
                <th>Mantenimiento</th>
                <th>Última sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td>{tenant.slug}</td>
                  <td>
                    <a href={tenant.baseUrl} target="_blank" rel="noreferrer">
                      {tenant.baseUrl}
                    </a>
                  </td>
                  <td>
                    <TenantStatusBadge snapshot={tenant.snapshot?.payload} />
                  </td>
                  <td>
                    {tenant.snapshot?.payload?.maintenanceMode ? (
                      <span className="badge badge-maintenance">ON</span>
                    ) : (
                      'OFF'
                    )}
                  </td>
                  <td>
                    {tenant.snapshot?.syncedAt
                      ? new Date(tenant.snapshot.syncedAt).toLocaleString('es-ES')
                      : '-'}
                  </td>
                  <td>
                    <Link to={`/superadmin/tenants/${tenant.id}`}>Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import Alert from '../ui/Alert'
import Button from '../ui/Button'

export default function TenantDomains({ tenantId, onTenantUpdated }) {
  const { t } = useTranslation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [customForm, setCustomForm] = useState({ kind: 'web', hostname: '' })

  async function loadDomains() {
    const result = await apiRequest(`/api/superadmin/tenants/${tenantId}/domains`)
    setData(result)
  }

  useEffect(() => {
    loadDomains().catch((err) => setError(err.message))
  }, [tenantId])

  async function handleProvision() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await apiRequest(`/api/superadmin/tenants/${tenantId}/domains/provision`, {
        method: 'POST',
      })
      setData(result.domains)
      setMessage(t('domains.provisionOk'))
      if (onTenantUpdated) await onTenantUpdated()
    } catch (err) {
      setError(err.message)
      await loadDomains().catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCustom(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await apiRequest(`/api/superadmin/tenants/${tenantId}/domains/custom`, {
        method: 'POST',
        body: customForm,
      })
      setMessage(
        t('domains.customAdded', {
          hostname: result.domain.hostname,
          target: result.instructions.cname.value,
        }),
      )
      setCustomForm({ kind: 'web', hostname: '' })
      await loadDomains()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(domainId) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await apiRequest(
        `/api/superadmin/tenants/${tenantId}/domains/custom/${domainId}/verify`,
        { method: 'POST' },
      )
      setData(result.domains)
      setMessage(t('domains.verifyOk'))
      if (onTenantUpdated) await onTenantUpdated()
    } catch (err) {
      setError(err.message)
      await loadDomains().catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(domainId) {
    if (!window.confirm(t('domains.confirmDelete'))) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await apiRequest(
        `/api/superadmin/tenants/${tenantId}/domains/custom/${domainId}`,
        { method: 'DELETE' },
      )
      setData(result.domains)
      setMessage(t('domains.deleteOk'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!data) return <p>{t('loading')}</p>

  const tenant = data.tenant
  const saas = data.saas

  return (
    <div className="card">
      <h2 className="card__title">{t('domains.title')}</h2>
      <p className="tenant-composition__lead">{t('domains.lead')}</p>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}
      <Alert variant="info">{t('domains.dnsManualLead')}</Alert>

      <div className="overview-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="overview-item">
          <p className="overview-item__label">{t('domains.status')}</p>
          <p className="overview-item__value">{tenant.domainStatus}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('domains.ingressIp')}</p>
          <p className="overview-item__value">{data.ingressIp || '-'}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('domains.provisionedAt')}</p>
          <p className="overview-item__value">
            {tenant.domainsProvisionedAt
              ? new Date(tenant.domainsProvisionedAt).toLocaleString()
              : '-'}
          </p>
        </div>
      </div>

      {tenant.domainError ? <Alert variant="error">{tenant.domainError}</Alert> : null}

      <h3 className="form-section__title">{t('domains.saasTitle')}</h3>
      <ul className="audit-list">
        <li>
          <strong>ERP</strong> —{' '}
          <a href={saas.erpUrl} target="_blank" rel="noreferrer">
            {saas.erpHost}
          </a>
        </li>
        <li>
          <strong>Web</strong> —{' '}
          <a href={saas.webUrl} target="_blank" rel="noreferrer">
            {saas.webHost}
          </a>
        </li>
      </ul>
      <p className="form-hint">{t('domains.saasHint')}</p>

      <h3 className="form-section__title">{t('domains.dnsManualTitle')}</h3>
      {data.dnsInstructions?.aRecords?.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('domains.dnsType')}</th>
              <th>{t('domains.dnsName')}</th>
              <th>{t('domains.dnsHostname')}</th>
              <th>{t('domains.dnsValue')}</th>
            </tr>
          </thead>
          <tbody>
            {data.dnsInstructions.aRecords.map((record) => (
              <tr key={record.hostname}>
                <td>{record.type}</td>
                <td>
                  <code>{record.name}</code>
                </td>
                <td>{record.hostname}</td>
                <td>
                  <code>{record.value}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="page-header__actions" style={{ margin: '1rem 0' }}>
        <Button disabled={loading} onClick={handleProvision}>
          {loading ? t('loading') : t('domains.provision')}
        </Button>
      </div>

      <h3 className="form-section__title">{t('domains.customTitle')}</h3>
      <p className="form-hint">{t('domains.customHint')}</p>

      <form className="form-grid" onSubmit={handleAddCustom} style={{ marginBottom: '1rem' }}>
        <label>
          {t('domains.customKind')}
          <select
            value={customForm.kind}
            onChange={(e) => setCustomForm((current) => ({ ...current, kind: e.target.value }))}
          >
            <option value="web">Web</option>
            <option value="erp">ERP</option>
          </select>
        </label>
        <label>
          {t('domains.customHostname')}
          <input
            required
            value={customForm.hostname}
            onChange={(e) =>
              setCustomForm((current) => ({ ...current, hostname: e.target.value }))
            }
            placeholder="www.cliente.com"
          />
        </label>
        <Button type="submit" disabled={loading}>
          {t('domains.addCustom')}
        </Button>
      </form>

      {(data.customDomains || []).length === 0 ? (
        <p className="form-hint">{t('domains.noCustom')}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('domains.customHostname')}</th>
              <th>{t('domains.customKind')}</th>
              <th>{t('domains.status')}</th>
              <th>{t('domains.cnameTarget')}</th>
              <th>{t('domains.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {data.customDomains.map((domain) => (
              <tr key={domain.id}>
                <td>{domain.hostname}</td>
                <td>{domain.kind}</td>
                <td>
                  {domain.status}
                  {domain.errorMessage ? (
                    <div className="form-hint">{domain.errorMessage}</div>
                  ) : null}
                </td>
                <td>
                  <code>{domain.verificationTarget}</code>
                </td>
                <td>
                  <div className="page-header__actions">
                    <Button
                      variant="secondary"
                      disabled={loading}
                      onClick={() => handleVerify(domain.id)}
                    >
                      {t('domains.verify')}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={loading}
                      onClick={() => handleDelete(domain.id)}
                    >
                      {t('domains.remove')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="form-section__title">{t('domains.jobs')}</h3>
      {(data.jobs || []).length === 0 ? (
        <p className="form-hint">{t('domains.noJobs')}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('versioning.jobAction')}</th>
              <th>{t('versioning.jobStatus')}</th>
              <th>{t('versioning.jobActor')}</th>
              <th>{t('versioning.jobWhen')}</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.action}</td>
                <td>{job.status}</td>
                <td>{job.actorEmail}</td>
                <td>{job.createdAt ? new Date(job.createdAt).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

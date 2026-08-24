import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'

const SAAS_BASE = 'findspo.com'

function normalizeSlug(slug) {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

export default function TenantCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    displayName: '',
    controlToken: '',
    databaseName: '',
    notes: '',
    customWebHostname: '',
    provisionDomains: true,
  })

  const preview = useMemo(() => {
    const slug = normalizeSlug(form.slug)
    if (!slug) return null
    return {
      erpHost: `erp.${slug}.${SAAS_BASE}`,
      webHost: `www.${slug}.${SAAS_BASE}`,
    }
  }, [form.slug])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await apiRequest('/api/superadmin/tenants', {
        method: 'POST',
        body: {
          slug: form.slug,
          displayName: form.displayName,
          controlToken: form.controlToken,
          databaseName: form.databaseName || `sige_${normalizeSlug(form.slug)}`,
          notes: form.notes,
          provisionDomains: form.provisionDomains,
        },
      })

      const tenantId = result.tenant.id

      if (form.customWebHostname.trim()) {
        try {
          await apiRequest(`/api/superadmin/tenants/${tenantId}/domains/custom`, {
            method: 'POST',
            body: { kind: 'web', hostname: form.customWebHostname.trim() },
          })
        } catch (customError) {
          navigate(`/superadmin/tenants/${tenantId}`, {
            state: { domainWarning: customError.message },
          })
          return
        }
      }

      if (result.domainsProvision?.failed) {
        navigate(`/superadmin/tenants/${tenantId}`, {
          state: { domainWarning: result.domainsProvision.error },
        })
        return
      }

      navigate(`/superadmin/tenants/${tenantId}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.newTenant')}
        breadcrumbs={
          <ol className="breadcrumbs">
            <li><Link to="/superadmin/tenants">{t('nav.tenants')}</Link></li>
            <li className="breadcrumbs__sep">/</li>
            <li>{t('nav.newTenant')}</li>
          </ol>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Alert variant="info">{t('domains.createIntro')}</Alert>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2 className="form-section__title">{t('form.identity')}</h2>
          <label>
            {t('form.slug')}
            <input
              required
              value={form.slug}
              onChange={(e) => updateField('slug', e.target.value)}
            />
          </label>
          <label>
            {t('form.displayName')}
            <input
              value={form.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
            />
          </label>
          <label>
            {t('form.controlToken')}
            <input
              required
              type="password"
              value={form.controlToken}
              onChange={(e) => updateField('controlToken', e.target.value)}
            />
            <span className="form-hint">{t('form.controlTokenHint')}</span>
          </label>
        </div>

        <div className="form-section">
          <h2 className="form-section__title">{t('domains.saasTitle')}</h2>
          <p className="form-hint">{t('domains.createPreviewHint')}</p>
          {preview ? (
            <ul className="audit-list">
              <li>
                <strong>ERP</strong> — <code>{preview.erpHost}</code>
              </li>
              <li>
                <strong>Web</strong> — <code>{preview.webHost}</code>
              </li>
            </ul>
          ) : (
            <p className="form-hint">{t('domains.slugPreviewPending')}</p>
          )}

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.provisionDomains}
              onChange={(e) => updateField('provisionDomains', e.target.checked)}
            />
            {t('domains.provisionOnCreate')}
          </label>
        </div>

        <div className="form-section">
          <h2 className="form-section__title">{t('domains.customOptional')}</h2>
          <label>
            {t('domains.customHostname')}
            <input
              value={form.customWebHostname}
              onChange={(e) => updateField('customWebHostname', e.target.value)}
              placeholder="www.cliente.com"
            />
            <span className="form-hint">
              {preview
                ? t('domains.customCreateHint', { target: preview.webHost })
                : t('domains.customHint')}
            </span>
          </label>
        </div>

        <div className="form-section">
          <h2 className="form-section__title">{t('form.notes')}</h2>
          <label>
            {t('form.databaseName')}
            <input
              value={form.databaseName}
              onChange={(e) => updateField('databaseName', e.target.value)}
              placeholder="sige_slug"
            />
          </label>
          <label>
            {t('form.notes')}
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </label>
        </div>

        <div className="page-header__actions">
          <Button type="submit" disabled={loading}>
            {loading ? t('loading') : t('domains.createSubmit')}
          </Button>
        </div>
      </form>
    </div>
  )
}

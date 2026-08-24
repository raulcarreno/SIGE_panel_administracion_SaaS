import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'
import PageHeader from '../../components/ui/PageHeader'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'

export default function TenantCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    displayName: '',
    baseUrl: '',
    webBaseUrl: '',
    controlToken: '',
    databaseName: '',
    notes: '',
  })

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
          ...form,
          databaseName: form.databaseName || `sige_${form.slug}`,
        },
      })
      navigate(`/superadmin/tenants/${result.tenant.id}`)
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

      <Alert variant="info">{t('composition.createIntro')}</Alert>

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
        </div>

        <div className="form-section">
          <h2 className="form-section__title">{t('composition.blockTitle')}</h2>
          <p className="form-hint" style={{ marginBottom: '1rem' }}>
            {t('composition.blockHint')}
          </p>

          <div className="tenant-composition__grid tenant-composition__grid--form">
            <div className="tenant-pod tenant-pod--form">
              <p className="tenant-pod__role">{t('composition.erpRole')}</p>
              <h3 className="tenant-pod__name">{t('composition.erpName')}</h3>
              <p className="tenant-pod__desc">{t('composition.erpDesc')}</p>
              <label>
                {t('form.baseUrl')}
                <input
                  required
                  type="url"
                  value={form.baseUrl}
                  onChange={(e) => updateField('baseUrl', e.target.value)}
                  placeholder="https://erp.cliente.example.com"
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

            <div className="tenant-pod tenant-pod--form">
              <p className="tenant-pod__role">{t('composition.webRole')}</p>
              <h3 className="tenant-pod__name">{t('composition.webName')}</h3>
              <p className="tenant-pod__desc">{t('composition.webDesc')}</p>
              <label>
                {t('form.webBaseUrl')}
                <input
                  required
                  type="url"
                  value={form.webBaseUrl}
                  onChange={(e) => updateField('webBaseUrl', e.target.value)}
                  placeholder="https://www.cliente.example.com"
                />
                <span className="form-hint">{t('form.webBaseUrlHint')}</span>
              </label>
            </div>
          </div>
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
            {loading ? t('loading') : t('save')}
          </Button>
        </div>
      </form>
    </div>
  )
}

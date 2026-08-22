import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { apiRequest } from '../../lib/api'

export default function TenantCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    slug: '',
    displayName: '',
    baseUrl: '',
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
    }
  }

  return (
    <div>
      <h1>{t('newTenant')}</h1>
      {error ? <div className="alert alert-error">{error}</div> : null}
      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          Slug
          <input
            required
            value={form.slug}
            onChange={(e) => updateField('slug', e.target.value)}
          />
        </label>
        <label>
          Nombre
          <input
            value={form.displayName}
            onChange={(e) => updateField('displayName', e.target.value)}
          />
        </label>
        <label>
          Base URL
          <input
            required
            type="url"
            value={form.baseUrl}
            onChange={(e) => updateField('baseUrl', e.target.value)}
            placeholder="https://tenant.example.com"
          />
        </label>
        <label>
          Control API Token
          <input
            required
            type="password"
            value={form.controlToken}
            onChange={(e) => updateField('controlToken', e.target.value)}
          />
        </label>
        <label>
          Database name (informativo)
          <input
            value={form.databaseName}
            onChange={(e) => updateField('databaseName', e.target.value)}
            placeholder="sige_slug"
          />
        </label>
        <label>
          Notas
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
          />
        </label>
        <div className="actions">
          <button type="submit" className="btn">{t('save')}</button>
        </div>
      </form>
    </div>
  )
}

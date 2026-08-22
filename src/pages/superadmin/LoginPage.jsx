import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GoogleSignInButton from '../../components/GoogleSignInButton'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'
import { apiRequest, setToken } from '../../lib/api'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [config, setConfig] = useState(null)
  const [devEmail, setDevEmail] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiRequest('/api/superadmin/public-config')
      .then(setConfig)
      .catch((err) => setError(err.message))
  }, [])

  async function handleDevLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest('/api/superadmin/login/dev', {
        method: 'POST',
        body: { email: devEmail },
      })
      setToken(result.token)
      navigate('/superadmin')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-card__logo">{t('appTitle')}</h1>
        <p className="login-card__subtitle">{t('login')}</p>
        {error ? <Alert variant="error">{error}</Alert> : null}

        {config?.googleLoginEnabled ? (
          <GoogleSignInButton
            onSuccess={() => navigate('/superadmin')}
            onError={setError}
          />
        ) : null}

        {config?.googleLoginEnabled && config?.devLoginEnabled ? (
          <div className="login-divider">{t('orDivider')}</div>
        ) : null}

        {config?.devLoginEnabled ? (
          <form className="form-grid" onSubmit={handleDevLogin}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              {t('devLoginHint')}
            </p>
            <label>
              Email
              <input
                type="email"
                required
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="tu-email@ejemplo.com"
              />
            </label>
            <Button type="submit" disabled={loading}>
              {loading ? t('loading') : t('devLoginButton')}
            </Button>
          </form>
        ) : null}

        {config && !config.googleLoginEnabled && !config.devLoginEnabled ? (
          <Alert variant="error">{t('loginNotConfigured')}</Alert>
        ) : null}
      </div>
    </div>
  )
}

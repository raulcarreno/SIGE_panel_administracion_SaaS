import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import GoogleSignInButton from '../../components/GoogleSignInButton'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  return (
    <div className="login-page">
      <div className="card" style={{ width: 'min(420px, 92vw)' }}>
        <h1>{t('appTitle')}</h1>
        <p>{t('login')}</p>
        {error ? <div className="alert alert-error">{error}</div> : null}
        <GoogleSignInButton
          onSuccess={() => navigate('/superadmin')}
          onError={setError}
        />
      </div>
    </div>
  )
}

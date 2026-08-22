import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { clearToken } from '../lib/api'

export default function SuperadminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  function handleLogout() {
    clearToken()
    navigate('/superadmin/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>{t('appTitle')}</strong>
        <nav>
          <NavLink to="/superadmin" end>{t('dashboard')}</NavLink>
          <NavLink to="/superadmin/tenants">{t('tenants')}</NavLink>
        </nav>
        <button type="button" className="btn btn-secondary" onClick={handleLogout}>
          {t('logout')}
        </button>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

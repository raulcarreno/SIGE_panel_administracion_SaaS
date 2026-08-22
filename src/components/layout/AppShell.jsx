import { useState } from 'react'
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { clearToken } from '../../lib/api'
import { pageMeta } from '../../lib/navItems'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

function getUserEmail() {
  try {
    const token = localStorage.getItem('sige_superadmin_token')
    if (!token) return ''
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.email || payload.sub || ''
  } catch {
    return ''
  }
}

function resolvePageMeta(pathname, t) {
  if (pageMeta[pathname]) {
    const meta = pageMeta[pathname]
    return {
      title: t(meta.titleKey),
      breadcrumbs: meta.parentKey ? (
        <ol className="breadcrumbs">
          <li><Link to={meta.parentTo}>{t(meta.parentKey)}</Link></li>
          <li className="breadcrumbs__sep">/</li>
          <li>{t(meta.titleKey)}</li>
        </ol>
      ) : null,
    }
  }
  if (pathname.match(/^\/superadmin\/tenants\/[^/]+$/)) {
    return { title: t('nav.tenantDetail'), breadcrumbs: null }
  }
  return { title: t('appTitle'), breadcrumbs: null }
}

export default function AppShell() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { title } = resolvePageMeta(location.pathname, t)

  function closeSidebar() {
    setSidebarOpen(false)
  }

  function handleLogout() {
    clearToken()
    navigate('/superadmin/login')
  }

  return (
    <div className="app-shell">
      <div
        className={`app-shell__backdrop ${sidebarOpen ? 'is-visible' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />
      <Sidebar
        open={sidebarOpen}
        onNavigate={closeSidebar}
        userEmail={getUserEmail()}
        onLogout={handleLogout}
      />
      <div className="app-shell__main">
        <Topbar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="app-shell__content">
          <Outlet context={{ setTopbarTitle: () => {} }} />
        </main>
      </div>
    </div>
  )
}

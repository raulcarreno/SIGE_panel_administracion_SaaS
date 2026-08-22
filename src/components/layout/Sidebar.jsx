import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { mainNavItems } from '../../lib/navItems'
import { NavIcon } from '../icons/NavIcon'

export default function Sidebar({ open, onNavigate, userEmail, onLogout }) {
  const { t } = useTranslation()

  return (
    <aside className={`app-shell__sidebar ${open ? 'is-open' : ''}`} aria-label={t('nav.main')}>
      <div className="sidebar__brand">
        <p className="sidebar__brand-title">{t('appTitle')}</p>
        <p className="sidebar__brand-sub">{t('nav.subtitle')}</p>
      </div>
      <nav className="sidebar__nav">
        <ul className="sidebar__list">
          {mainNavItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
                }
                onClick={onNavigate}
              >
                <NavIcon name={item.icon} />
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar__footer">
        {userEmail ? <p className="sidebar__user">{userEmail}</p> : null}
        <button type="button" className="sidebar__logout" onClick={onLogout}>
          {t('logout')}
        </button>
      </div>
    </aside>
  )
}

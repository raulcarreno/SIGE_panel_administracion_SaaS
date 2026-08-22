import { useTranslation } from 'react-i18next'
import { tenantSections } from '../../lib/navItems'

export default function TenantSectionNav({ active, onChange }) {
  const { t } = useTranslation()

  return (
    <nav className="tenant-section-nav" aria-label={t('nav.tenantSections')}>
      {tenantSections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={
            active === section.id
              ? 'tenant-section-nav__link tenant-section-nav__link--active'
              : 'tenant-section-nav__link'
          }
          onClick={() => onChange(section.id)}
        >
          {t(section.labelKey)}
        </button>
      ))}
    </nav>
  )
}

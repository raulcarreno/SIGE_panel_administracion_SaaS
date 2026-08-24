import { useTranslation } from 'react-i18next'
import Button from '../ui/Button'

/**
 * Canonical tenant composition: ERP (billing CRM) + Web CMS.
 * One tenant registry row = both pods sharing platform config.
 */
export default function TenantComposition({ tenant, compact = false }) {
  const { t } = useTranslation()
  const erpUrl = tenant?.baseUrl || ''
  const webUrl = tenant?.webBaseUrl || ''

  if (compact) {
    return (
      <div className="tenant-composition tenant-composition--compact" onClick={(e) => e.stopPropagation()}>
        <a className="tenant-composition__chip" href={erpUrl} target="_blank" rel="noreferrer">
          {t('composition.erpShort')}
        </a>
        {webUrl ? (
          <a className="tenant-composition__chip" href={webUrl} target="_blank" rel="noreferrer">
            {t('composition.webShort')}
          </a>
        ) : (
          <span className="tenant-composition__chip tenant-composition__chip--missing">
            {t('composition.webMissing')}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="tenant-composition">
      <div className="tenant-composition__header">
        <h2 className="card__title">{t('composition.title')}</h2>
        <p className="tenant-composition__lead">{t('composition.lead')}</p>
      </div>

      <div className="tenant-composition__grid">
        <article className="tenant-pod">
          <p className="tenant-pod__role">{t('composition.erpRole')}</p>
          <h3 className="tenant-pod__name">{t('composition.erpName')}</h3>
          <p className="tenant-pod__desc">{t('composition.erpDesc')}</p>
          {erpUrl ? (
            <>
              <a className="tenant-pod__url" href={erpUrl} target="_blank" rel="noreferrer">
                {erpUrl}
              </a>
              <div className="tenant-pod__actions">
                <Button variant="secondary" as="a" href={`${erpUrl}/admin`} target="_blank" rel="noreferrer">
                  {t('adminErp')}
                </Button>
              </div>
            </>
          ) : (
            <p className="tenant-pod__missing">{t('composition.erpMissing')}</p>
          )}
        </article>

        <article className="tenant-pod">
          <p className="tenant-pod__role">{t('composition.webRole')}</p>
          <h3 className="tenant-pod__name">{t('composition.webName')}</h3>
          <p className="tenant-pod__desc">{t('composition.webDesc')}</p>
          {webUrl ? (
            <>
              <a className="tenant-pod__url" href={webUrl} target="_blank" rel="noreferrer">
                {webUrl}
              </a>
              <div className="tenant-pod__actions">
                <Button variant="secondary" as="a" href={webUrl} target="_blank" rel="noreferrer">
                  {t('openWebSite')}
                </Button>
                <Button variant="secondary" as="a" href={`${webUrl}/admin`} target="_blank" rel="noreferrer">
                  {t('adminWebCms')}
                </Button>
              </div>
            </>
          ) : (
            <p className="tenant-pod__missing">{t('composition.webMissing')}</p>
          )}
        </article>
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import Button from '../ui/Button'

function publicTenantUrl(host, fallbackUrl) {
  const hostname = String(host || '').trim()
  if (hostname) return `https://${hostname.replace(/^https?:\/\//, '')}`
  const fallback = String(fallbackUrl || '').trim()
  // Never expose in-cluster Service DNS (sige-erp, sige-web-*) as browser links.
  if (!fallback || /^https?:\/\/sige-[a-z0-9-]+(\/|$)/i.test(fallback)) return ''
  return fallback
}

/** www.<domain> → https://cms.<domain>/admin (CMS admin is never on public www). */
function cmsAdminUrl(webHost, webUrl) {
  const host = String(webHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  if (host) {
    if (host.startsWith('cms.')) return `https://${host}/admin`
    if (host.startsWith('www.')) return `https://cms.${host.slice(4)}/admin`
    return `https://cms.${host}/admin`
  }
  const base = String(webUrl || '').replace(/\/$/, '')
  if (!base) return ''
  try {
    const url = new URL(base)
    if (url.hostname.startsWith('www.')) {
      url.hostname = `cms.${url.hostname.slice(4)}`
    } else if (!url.hostname.startsWith('cms.')) {
      url.hostname = `cms.${url.hostname}`
    }
    url.pathname = '/admin'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return `${base}/admin`
  }
}

/**
 * Canonical tenant composition: ERP (billing CRM) + Web CMS.
 * One tenant registry row = both pods sharing platform config.
 * UI links always use public hosts (erpHost / webHost), not Control API baseUrl.
 */
export default function TenantComposition({ tenant, compact = false }) {
  const { t } = useTranslation()
  const erpUrl = publicTenantUrl(tenant?.erpHost, tenant?.baseUrl)
  const webUrl = publicTenantUrl(tenant?.webHost, tenant?.webBaseUrl)

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
                <Button
                  variant="secondary"
                  as="a"
                  href={cmsAdminUrl(tenant?.webHost, webUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
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

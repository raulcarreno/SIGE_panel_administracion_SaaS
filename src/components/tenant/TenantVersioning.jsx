import { useTranslation } from 'react-i18next'
import Button from '../ui/Button'
import Alert from '../ui/Alert'

function shortSha(sha) {
  if (!sha) return '—'
  return String(sha).slice(0, 7)
}

function ComponentCard({ title, data, t }) {
  if (!data) return null
  return (
    <div className="card versioning-card">
      <h3 className="card__title">{title}</h3>
      <div className="overview-grid">
        <div className="overview-item">
          <p className="overview-item__label">{t('versioning.branch')}</p>
          <p className="overview-item__value">
            <code>{data.branch || '—'}</code>
          </p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('versioning.deployedSha')}</p>
          <p className="overview-item__value">
            <code>{shortSha(data.deployedSha)}</code>
          </p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('versioning.headSha')}</p>
          <p className="overview-item__value">
            <code>{data.headShortSha || shortSha(data.headSha)}</code>
          </p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('versioning.version')}</p>
          <p className="overview-item__value">{data.deployedVersion || '—'}</p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('versioning.vsMain')}</p>
          <p className="overview-item__value">
            {data.behindMain == null && data.aheadOfMain == null
              ? '—'
              : t('versioning.aheadBehind', {
                  behind: data.behindMain ?? 0,
                  ahead: data.aheadOfMain ?? 0,
                })}
          </p>
        </div>
        <div className="overview-item">
          <p className="overview-item__label">{t('versioning.image')}</p>
          <p className="overview-item__value overview-item__value--wrap">
            <code>{data.imageHint || '—'}</code>
          </p>
        </div>
      </div>
      {data.headMessage ? (
        <p className="muted versioning-card__message">{data.headMessage}</p>
      ) : null}
      {data.githubError ? <Alert variant="error">{data.githubError}</Alert> : null}
    </div>
  )
}

export default function TenantVersioning({
  status,
  loading,
  onPromote,
  onDeploy,
  onRefresh,
}) {
  const { t } = useTranslation()

  if (!status) {
    return <p className="muted">{t('loading')}</p>
  }

  const jobs = status.jobs || []

  return (
    <div className="tenant-versioning">
      <div className="card">
        <div className="card__header-row">
          <h2 className="card__title">{t('versioning.title')}</h2>
          <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
            {t('versioning.refresh')}
          </Button>
        </div>
        <p className="muted">{t('versioning.lead')}</p>
        {!status.githubConfigured ? (
          <Alert variant="warning">{t('versioning.githubMissing')}</Alert>
        ) : null}
        <div className="overview-grid">
          <div className="overview-item">
            <p className="overview-item__label">{t('versioning.podVersion')}</p>
            <p className="overview-item__value">{status.pod?.appVersion || '—'}</p>
          </div>
          <div className="overview-item">
            <p className="overview-item__label">{t('versioning.podSha')}</p>
            <p className="overview-item__value">
              <code>{shortSha(status.pod?.gitSha)}</code>
            </p>
          </div>
          <div className="overview-item">
            <p className="overview-item__label">{t('versioning.lastStatus')}</p>
            <p className="overview-item__value">{status.tenant?.lastDeployStatus || '—'}</p>
          </div>
        </div>
        {status.pod?.error ? <Alert variant="error">{status.pod.error}</Alert> : null}
        {status.tenant?.lastDeployError ? (
          <Alert variant="error">{status.tenant.lastDeployError}</Alert>
        ) : null}
      </div>

      <div className="versioning-grid">
        <ComponentCard title={t('versioning.erp')} data={status.erp} t={t} />
        <ComponentCard title={t('versioning.web')} data={status.web} t={t} />
      </div>

      <div className="card">
        <h3 className="card__title">{t('versioning.actions')}</h3>
        <div className="versioning-actions">
          <Button
            type="button"
            disabled={loading || !status.githubConfigured}
            onClick={() => onPromote('erp')}
          >
            {t('versioning.promoteErp')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !status.githubConfigured}
            onClick={() => onPromote('web')}
          >
            {t('versioning.promoteWeb')}
          </Button>
          <Button
            type="button"
            disabled={loading || !status.githubConfigured}
            onClick={() => onDeploy('erp')}
          >
            {t('versioning.deployErp')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !status.githubConfigured}
            onClick={() => onDeploy('web')}
          >
            {t('versioning.deployWeb')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !status.githubConfigured}
            onClick={() => onDeploy('both')}
          >
            {t('versioning.deployBoth')}
          </Button>
        </div>
        <p className="muted">{t('versioning.webDivergeHint')}</p>
      </div>

      <div className="card">
        <h3 className="card__title">{t('versioning.jobs')}</h3>
        {!jobs.length ? (
          <p className="muted">{t('versioning.noJobs')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('versioning.jobAction')}</th>
                  <th>{t('versioning.jobComponent')}</th>
                  <th>{t('versioning.jobStatus')}</th>
                  <th>{t('versioning.jobActor')}</th>
                  <th>{t('versioning.jobWhen')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.action}</td>
                    <td>{job.component}</td>
                    <td>
                      {job.status}
                      {job.errorMessage ? (
                        <div className="muted">{job.errorMessage}</div>
                      ) : null}
                    </td>
                    <td>{job.actorEmail}</td>
                    <td>
                      {job.createdAt ? new Date(job.createdAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

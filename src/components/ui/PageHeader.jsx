export default function PageHeader({ title, subtitle, breadcrumbs, actions }) {
  return (
    <header className="page-header">
      {breadcrumbs ? <nav aria-label="Breadcrumb">{breadcrumbs}</nav> : null}
      <div className="page-header__row">
        <div>
          <h1 className="page-header__title">{title}</h1>
          {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
    </header>
  )
}

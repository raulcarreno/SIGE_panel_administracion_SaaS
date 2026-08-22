export default function Topbar({ title, subtitle, actions, onMenuClick }) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="topbar__menu-btn"
          onClick={onMenuClick}
          aria-label="Abrir menú"
        >
          <span className="topbar__menu-icon" />
        </button>
        <div>
          <h1 className="topbar__title">{title}</h1>
          {subtitle ? <p className="topbar__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="topbar__actions">{actions}</div> : null}
    </header>
  )
}

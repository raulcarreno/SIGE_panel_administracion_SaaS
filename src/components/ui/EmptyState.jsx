import Button from './Button'

export default function EmptyState({ title, description, actionLabel, onAction, actionTo, LinkComponent }) {
  return (
    <div className="empty-state">
      <h3 className="empty-state__title">{title}</h3>
      {description ? <p className="empty-state__text">{description}</p> : null}
      {actionLabel && actionTo && LinkComponent ? (
        <LinkComponent to={actionTo}>
          <Button variant="primary">{actionLabel}</Button>
        </LinkComponent>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="primary" onClick={onAction}>{actionLabel}</Button>
      ) : null}
    </div>
  )
}

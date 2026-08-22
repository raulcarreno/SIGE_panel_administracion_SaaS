export default function Alert({ variant = 'error', children }) {
  return <div className={`alert alert--${variant}`}>{children}</div>
}

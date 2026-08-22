export default function StatCard({ label, value, tone = 'primary', icon }) {
  return (
    <div className="stat-card">
      {icon ? <div className={`stat-card__icon stat-card__icon--${tone}`}>{icon}</div> : null}
      <div>
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
      </div>
    </div>
  )
}

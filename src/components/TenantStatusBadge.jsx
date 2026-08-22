const LABELS = {
  active: 'Activo',
  suspended: 'Suspendido',
  expired: 'Expirado',
  future: 'Futuro',
  unknown: 'Desconocido',
}

function getTenantLifecycleStatus(snapshot) {
  if (!snapshot) return 'unknown'
  if (snapshot.suspendedAt) return 'suspended'
  const now = new Date()
  if (snapshot.validFrom && now < new Date(snapshot.validFrom)) return 'future'
  if (snapshot.validUntil && now > new Date(snapshot.validUntil)) return 'expired'
  return 'active'
}

export default function TenantStatusBadge({ snapshot }) {
  const status = getTenantLifecycleStatus(snapshot)
  return <span className={`badge badge-${status}`}>{LABELS[status] || status}</span>
}

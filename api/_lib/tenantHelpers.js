export function isTenantActive(config, now = new Date()) {
  if (!config) return false
  if (config.suspendedAt) return false
  if (config.validFrom && now < new Date(config.validFrom)) return false
  if (config.validUntil && now > new Date(config.validUntil)) return false
  return true
}

export function getTenantLifecycleStatus(snapshot) {
  if (!snapshot) return 'unknown'
  if (snapshot.suspendedAt) return 'suspended'
  const now = new Date()
  if (snapshot.validFrom && now < new Date(snapshot.validFrom)) return 'future'
  if (snapshot.validUntil && now > new Date(snapshot.validUntil)) return 'expired'
  return 'active'
}

export const MAX_REQUEST_BODY_BYTES = 3 * 1024 * 1024

export function parseJsonBody(input) {
  const raw = typeof input === 'string' ? input : input?.body
  if (!raw || (typeof raw === 'string' && !raw.trim())) return null
  if (typeof raw === 'object') return raw
  return JSON.parse(raw)
}

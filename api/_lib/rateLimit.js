const memoryStores = new Map()

function getMemoryStore(namespace) {
  if (!memoryStores.has(namespace)) {
    memoryStores.set(namespace, new Map())
  }
  return memoryStores.get(namespace)
}

function consumeMemoryLimit(namespace, key, max, windowMs) {
  const store = getMemoryStore(namespace)
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    store.set(key, { windowStart: now, count: 1 })
    return true
  }

  if (entry.count >= max) return false
  entry.count += 1
  return true
}

export async function consumeRateLimit({ namespace, key, max, windowMs }) {
  return consumeMemoryLimit(namespace, key, max, windowMs)
}

export function resetMemoryRateLimit(namespace, key) {
  const store = memoryStores.get(namespace)
  if (!store) return
  store.delete(key)
}

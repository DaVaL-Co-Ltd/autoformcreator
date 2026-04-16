const STORAGE_KEY = 'scheduled_uploads'

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function save(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function getAll() {
  return load()
}

export function getById(id) {
  return load().find(item => item.id === id) || null
}

export function create(item) {
  const items = load()
  const newItem = {
    id: uuid(),
    platform: item.platform,
    content: item.content || {},
    scheduledAt: item.scheduledAt,
    status: 'pending',
    error: null,
    createdAt: new Date().toISOString(),
  }
  items.push(newItem)
  save(items)
  return newItem
}

export function update(id, patch) {
  const items = load()
  const idx = items.findIndex(item => item.id === id)
  if (idx === -1) return null
  items[idx] = { ...items[idx], ...patch }
  save(items)
  return items[idx]
}

export function remove(id) {
  const items = load().filter(item => item.id !== id)
  save(items)
}

export function getDue(now) {
  const nowIso = now instanceof Date ? now.toISOString() : now
  return load().filter(item => item.status === 'pending' && item.scheduledAt <= nowIso)
}

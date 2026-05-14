import { supabase } from '../services/supabase'

const STORAGE_KEY = 'platform_connections'
const TABLE_NAME = 'platform_connections'

export const PLATFORM_CONNECTIONS_UPDATED_EVENT = 'platform-connections-updated'

const DEFAULTS = {
  blog: {
    connected: false,
    account: null,
    displayName: '블로그 바로가기',
    url: 'https://m.blog.naver.com/PostList.naver?blogId=onlyjungdw',
    categoryPath: '',
    connectedAt: null,
  },
  newsletter: {
    connected: false,
    account: null,
    displayName: null,
    url: null,
    connectedAt: null,
  },
  instagram: {
    connected: false,
    account: null,
    displayName: '인스타그램 바로가기',
    url: 'https://instagram.com/jdongwan',
    connectedAt: null,
  },
  shorts: {
    connected: false,
    account: null,
    displayName: '유튜브 바로가기',
    url: 'https://www.youtube.com/@mybest-AI',
    connectedAt: null,
  },
}

const PLATFORM_KEYS = Object.keys(DEFAULTS)
const hasDbClient = () => Boolean(supabase && typeof supabase.from === 'function')

function cloneDefaults() {
  return {
    blog: { ...DEFAULTS.blog },
    newsletter: { ...DEFAULTS.newsletter },
    instagram: { ...DEFAULTS.instagram },
    shorts: { ...DEFAULTS.shorts },
  }
}

function mergeWithDefaults(parsed = {}) {
  const next = cloneDefaults()

  PLATFORM_KEYS.forEach((platform) => {
    next[platform] = {
      ...next[platform],
      ...(parsed?.[platform] || {}),
    }
  })

  return next
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function notifyChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PLATFORM_CONNECTIONS_UPDATED_EVENT))
}

function readLocal() {
  if (!canUseStorage()) return cloneDefaults()

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneDefaults()
    return mergeWithDefaults(JSON.parse(raw))
  } catch {
    return cloneDefaults()
  }
}

function writeLocal(value) {
  if (!canUseStorage()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeWithDefaults(value)))
}

function buildDbPayload(platform, connection) {
  return {
    platform,
    display_name: connection?.displayName || null,
    url: connection?.url || null,
  }
}

async function fetchDbRows() {
  if (!hasDbClient()) return []

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('platform, display_name, url')
    .in('platform', PLATFORM_KEYS)

  if (error) throw error
  return Array.isArray(data) ? data : []
}

function applyDbRows(base, rows) {
  const next = mergeWithDefaults(base)

  rows.forEach((row) => {
    const platform = row?.platform
    if (!platform || !next[platform]) return

    next[platform] = {
      ...next[platform],
      displayName: row.display_name ?? next[platform].displayName,
      url: row.url ?? next[platform].url,
    }
  })

  return next
}

export function subscribe(callback) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleCustomEvent = () => callback(getAll())
  const handleStorage = (event) => {
    if (!event || event.key === STORAGE_KEY) {
      callback(getAll())
    }
  }

  window.addEventListener(PLATFORM_CONNECTIONS_UPDATED_EVENT, handleCustomEvent)
  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener(PLATFORM_CONNECTIONS_UPDATED_EVENT, handleCustomEvent)
    window.removeEventListener('storage', handleStorage)
  }
}

export function getAll() {
  return readLocal()
}

export function get(platform) {
  return getAll()[platform] ?? { ...DEFAULTS[platform] }
}

export async function loadAll() {
  const local = readLocal()

  try {
    const rows = await fetchDbRows()
    const merged = applyDbRows(local, rows)
    writeLocal(merged)
    notifyChange()
    return merged
  } catch (error) {
    console.warn('[platformConnections] DB load failed, using local cache:', error.message)
    return local
  }
}

export async function connect(platform, accountOrPayload) {
  const all = readLocal()
  const prev = all[platform] || DEFAULTS[platform]
  const payload = typeof accountOrPayload === 'string'
    ? { account: accountOrPayload }
    : (accountOrPayload || {})

  all[platform] = {
    ...prev,
    ...payload,
    connected: true,
    connectedAt: prev.connected ? prev.connectedAt : new Date().toISOString(),
  }

  writeLocal(all)
  notifyChange()
  return all[platform]
}

export async function updateDisplay(platform, updates = {}) {
  const all = readLocal()
  const prev = all[platform] || DEFAULTS[platform]
  const { displayName, url, ...localOnlyUpdates } = updates

  all[platform] = {
    ...prev,
    ...(displayName !== undefined ? { displayName } : {}),
    ...(url !== undefined ? { url } : {}),
    ...localOnlyUpdates,
  }

  writeLocal(all)
  notifyChange()

  if (!hasDbClient()) {
    return { persisted: 'local', value: all[platform] }
  }

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(buildDbPayload(platform, all[platform]), { onConflict: 'platform' })

    if (error) throw error

    return { persisted: 'db', value: all[platform] }
  } catch (error) {
    console.warn('[platformConnections] DB save failed, local cache kept:', error.message)
    return { persisted: 'local', value: all[platform], error }
  }
}

export async function disconnect(platform) {
  const all = readLocal()
  const prev = all[platform] || DEFAULTS[platform]

  all[platform] = {
    ...prev,
    connected: false,
    account: null,
    connectedAt: null,
  }

  writeLocal(all)
  notifyChange()
  return all[platform]
}

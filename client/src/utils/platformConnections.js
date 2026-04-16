const STORAGE_KEY = 'platform_connections'

const DEFAULTS = {
  blog: { connected: false, account: null, connectedAt: null },
  band: { connected: false, account: null, connectedAt: null },
  kakao: { connected: false, account: null, connectedAt: null },
  instagram: { connected: false, account: null, connectedAt: null },
  shorts: { connected: false, account: null, connectedAt: null },
}

export function getAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      blog: { ...DEFAULTS.blog, ...parsed.blog },
      band: { ...DEFAULTS.band, ...parsed.band },
      kakao: { ...DEFAULTS.kakao, ...parsed.kakao },
      instagram: { ...DEFAULTS.instagram, ...parsed.instagram },
      shorts: { ...DEFAULTS.shorts, ...parsed.shorts },
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function get(platform) {
  return getAll()[platform] ?? { ...DEFAULTS[platform] }
}

export function connect(platform, account) {
  const all = getAll()
  all[platform] = { connected: true, account, connectedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function disconnect(platform) {
  const all = getAll()
  all[platform] = { connected: false, account: null, connectedAt: null }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

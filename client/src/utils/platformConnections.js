const STORAGE_KEY = 'platform_connections'

// 뉴스레터 풋터에 노출될 기본값 (사용자가 설정에서 수정 가능)
const DEFAULTS = {
  blog: {
    connected: false,
    account: null,
    displayName: '블로그 바로가기',
    url: 'https://m.blog.naver.com/PostList.naver?blogId=onlyjungdw',
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
    url: 'http://instagram.com/jdongwan',
    connectedAt: null,
  },
  shorts: {
    connected: false,
    account: null,
    displayName: '유튜브 바로가기',
    url: 'http://www.youtube.com/@mybest-AI',
    connectedAt: null,
  },
}

export function getAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return {
      blog: { ...DEFAULTS.blog, ...parsed.blog },
      newsletter: { ...DEFAULTS.newsletter, ...parsed.newsletter },
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

// account만 전달되면 기존 값 유지, 객체로 전달되면 부분 업데이트
export function connect(platform, accountOrPayload) {
  const all = getAll()
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

// 노출 정보(표시 이름, URL)만 업데이트 — 연결 상태 유지
export function updateDisplay(platform, { displayName, url } = {}) {
  const all = getAll()
  const prev = all[platform] || DEFAULTS[platform]
  all[platform] = {
    ...prev,
    ...(displayName !== undefined ? { displayName } : {}),
    ...(url !== undefined ? { url } : {}),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function disconnect(platform) {
  const all = getAll()
  const prev = all[platform] || DEFAULTS[platform]
  // 표시 이름/URL은 유지, 연결 상태만 해제
  all[platform] = {
    ...prev,
    connected: false,
    account: null,
    connectedAt: null,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const apiHeaders = (extra = {}) => ({ 'Content-Type': 'application/json', ...extra })

// 예약 목록 캐시 — 상세보기 왕복 등 짧은 재방문에서 재요청을 막는다.
// 예약 생성/수정/삭제 시 즉시 무효화하고, 그 외에는 TTL 동안 유지한다.
let _scheduledCache = null
const SCHEDULED_CACHE_TTL_MS = 60000

function invalidateScheduledCache() {
  _scheduledCache = null
}

export async function getAll() {
  if (_scheduledCache && Date.now() - _scheduledCache.ts < SCHEDULED_CACHE_TTL_MS) {
    return _scheduledCache.value
  }
  try {
    const res = await fetch(`${API_BASE}/api/scheduled/list`, { headers: apiHeaders() })
    if (!res.ok) throw new Error(`목록 조회 실패 (${res.status})`)
    const rows = await res.json()
    const value = rows.map(normalize)
    _scheduledCache = { value, ts: Date.now() }
    return value
  } catch (err) {
    console.error('[scheduledUploads] getAll 실패:', err)
    return []
  }
}

export async function getById(id) {
  const items = await getAll()
  return items.find(item => item.id === id) || null
}

export async function create({ platform, extractionId, content, scheduledAt, scheduledId, accountId, accountIds }) {
  const res = await fetch(`${API_BASE}/api/scheduled/create`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      platform,
      extractionId,
      scheduledId,
      accountId,
      accountIds,
      content: content || {},
      scheduledAt: scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `예약 생성 실패 (${res.status})`)
  }
  invalidateScheduledCache()
  return normalize(await res.json())
}

export async function update(id, patch) {
  const body = {}
  if (patch.scheduledAt) body.scheduledAt = patch.scheduledAt instanceof Date
    ? patch.scheduledAt.toISOString()
    : patch.scheduledAt
  if (patch.status) body.status = patch.status
  if (patch.content) body.content = patch.content

  const res = await fetch(`${API_BASE}/api/scheduled/${id}`, {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `예약 수정 실패 (${res.status})`)
  }
  invalidateScheduledCache()
  return normalize(await res.json())
}

export async function remove(id) {
  const res = await fetch(`${API_BASE}/api/scheduled/${id}`, { method: 'DELETE', headers: apiHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `예약 삭제 실패 (${res.status})`)
  }
  invalidateScheduledCache()
}

// Supabase snake_case → 프론트 camelCase
function normalize(row) {
  if (!row) return null
  return {
    id: row.id,
    platform: row.platform,
    extractionId: row.extraction_id,
    content: row.content || (row.content_title ? { title: row.content_title } : {}),
    scheduledAt: row.scheduled_at,
    status: row.status,
    uploadedUrl: row.uploaded_url,
    uploadedAt: row.uploaded_at,
    accountId: row.account_id,
    accountIds: row.account_ids || [],
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
  }
}

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const API_SECRET = import.meta.env.VITE_API_SECRET || ''
const apiHeaders = (extra = {}) => ({ 'Content-Type': 'application/json', 'x-app-secret': API_SECRET, ...extra })

export async function getAll() {
  try {
    const res = await fetch(`${API_BASE}/api/scheduled/list`, { headers: apiHeaders() })
    if (!res.ok) throw new Error(`목록 조회 실패 (${res.status})`)
    const rows = await res.json()
    return rows.map(normalize)
  } catch (err) {
    console.error('[scheduledUploads] getAll 실패:', err)
    return []
  }
}

export async function getById(id) {
  const items = await getAll()
  return items.find(item => item.id === id) || null
}

export async function create({ platform, extractionId, content, scheduledAt, scheduledId }) {
  const res = await fetch(`${API_BASE}/api/scheduled/create`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      platform,
      extractionId,
      scheduledId,
      content: content || {},
      scheduledAt: scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `예약 생성 실패 (${res.status})`)
  }
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
  return normalize(await res.json())
}

export async function remove(id) {
  const res = await fetch(`${API_BASE}/api/scheduled/${id}`, { method: 'DELETE', headers: apiHeaders() })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `예약 삭제 실패 (${res.status})`)
  }
}

// Supabase snake_case → 프론트 camelCase
function normalize(row) {
  if (!row) return null
  return {
    id: row.id,
    platform: row.platform,
    extractionId: row.extraction_id,
    content: row.content || {},
    scheduledAt: row.scheduled_at,
    status: row.status,
    uploadedUrl: row.uploaded_url,
    uploadedAt: row.uploaded_at,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
  }
}

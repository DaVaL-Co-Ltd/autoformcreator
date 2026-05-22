import { supabase, BUCKETS } from './supabase'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''

function buildChannels(data) {
  const channels = []
  if (data.blogContent) channels.push({ channel: 'blog', title: data.blogContent.title })
  if (data.newsletterContent) channels.push({ channel: 'newsletter', title: data.newsletterContent.subject })
  if (data.instagramContent) channels.push({
    channel: 'instagram',
    title: data.instagramContent.title || `카드뉴스 ${data.instagramContent.cardTopics?.length || data.instagramContent.cards?.length || 0}장`,
  })
  if (data.shortsScript) channels.push({ channel: 'shorts', title: data.shortsScript.title })
  return channels
}

function rowToItem(row) {
  if (!row) return null
  // 서버가 이미 가공한 아이템(목록 경량 아이템은 data 없이 channels 만 있음)은 그대로 통과.
  if (Array.isArray(row.channels)) return row

  const data = {
    fileName: row.file_name,
    summary: row.summary,
    blogContent: row.blog_content,
    newsletterContent: row.newsletter_content,
    instagramContent: row.instagram_content,
    shortsScript: row.shorts_script,
    blogImages: row.blog_images,
    instagramImages: row.instagram_images,
    shortsVideo: row.shorts_video,
    parsedText: row.parsed_text,
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    fileName: row.file_name,
    summary: row.summary,
    channels: buildChannels(data),
    data,
    uploadStatus: row.upload_status || {},
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`)
  }
  return data
}

function isLocalOutputUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('/output/')) return true
  try {
    const u = new URL(url)
    const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    return isLocalhost && u.pathname.startsWith('/output/')
  } catch {
    return false
  }
}

function resolveBrowserFetchUrl(url) {
  if (url.startsWith('/output/')) {
    if (API_BASE) return `${API_BASE}${url}`
    return url
  }
  return url
}

async function uploadShortsVideoIfLocal(shortsVideo) {
  if (!shortsVideo || typeof shortsVideo !== 'object') return shortsVideo
  const candidate = shortsVideo.url || shortsVideo.videoUrl || shortsVideo.combinedVideoUrl
  if (!candidate || !isLocalOutputUrl(candidate)) return shortsVideo

  if (!supabase) {
    console.warn('[saveExtraction] Supabase 클라이언트 미초기화로 로컬 영상을 업로드하지 못함. VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 환경변수를 설정하세요.')
    return null
  }

  try {
    const fetchUrl = resolveBrowserFetchUrl(candidate)
    const response = await fetch(fetchUrl)
    if (!response.ok) throw new Error(`로컬 영상 로드 실패 (${response.status})`)
    const blob = await response.blob()

    const extFromType = blob.type.split('/')[1] || ''
    const ext = (extFromType.replace('quicktime', 'mov') || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4'
    const objectPath = `shorts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error: uploadError } = await supabase.storage.from(BUCKETS.VIDEOS).upload(objectPath, blob, {
      contentType: blob.type || 'video/mp4',
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message)

    const { data: pub } = supabase.storage.from(BUCKETS.VIDEOS).getPublicUrl(objectPath)
    const publicUrl = pub?.publicUrl
    if (!publicUrl) throw new Error('Supabase Storage public URL을 가져오지 못했습니다.')

    return {
      ...shortsVideo,
      url: publicUrl,
      videoUrl: publicUrl,
      combinedVideoUrl: publicUrl,
    }
  } catch (err) {
    console.error('[saveExtraction] 영상 Supabase Storage 업로드 실패, 영상 제외:', err)
    return null
  }
}

export async function saveExtraction(data) {
  const payload = { ...(data || {}) }
  if (payload.shortsVideo) {
    payload.shortsVideo = await uploadShortsVideoIfLocal(payload.shortsVideo)
  }
  const item = await apiRequest('/api/extractions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  invalidateExtractionsCache()
  return item?.id
}

export async function updateExtractionMedia(id, media = {}) {
  const item = await apiRequest(`/api/extractions/${id}/media`, {
    method: 'PATCH',
    body: JSON.stringify(media),
  })
  invalidateExtractionsCache()
  return rowToItem(item)
}

// 본문(텍스트) 수정 저장. content 는 { blogContent?, newsletterContent?, instagramContent?, shortsScript? } 부분 업데이트.
export async function updateExtractionContent(id, content = {}) {
  const item = await apiRequest(`/api/extractions/${id}/content`, {
    method: 'PATCH',
    body: JSON.stringify(content),
  })
  invalidateExtractionsCache()
  return rowToItem(item)
}

// 콘텐츠 목록 캐시 — 상세보기 왕복 등 짧은 재방문에서 재요청을 막는다.
// 생성/수정/삭제 시 즉시 무효화하고, 그 외에는 TTL 동안 유지한다.
let _extractionsCache = null
// 페이지네이션 목록 캐시 — page/channel/status/search 조합별로 따로 저장한다.
const _extractionsPagedCache = new Map()
const EXTRACTIONS_CACHE_TTL_MS = 60000

export function invalidateExtractionsCache() {
  _extractionsCache = null
  _extractionsPagedCache.clear()
}

export async function getExtractions() {
  if (_extractionsCache && Date.now() - _extractionsCache.ts < EXTRACTIONS_CACHE_TTL_MS) {
    return _extractionsCache.value
  }
  const result = await apiRequest('/api/extractions')
  const value = {
    items: (result?.items || []).map(rowToItem),
    aggregateCounts: result?.aggregateCounts || null,
  }
  _extractionsCache = { value, ts: Date.now() }
  return value
}

export async function getExtractionsPaged({
  page = 1,
  pageSize = 10,
  channel = 'all',
  status = 'all',
  search = '',
} = {}) {
  const trimmedSearch = String(search || '').trim()
  // 캐시 키는 모든 파라미터를 포함해 조합별로 따로 캐싱한다.
  const cacheKey = `${page}|${pageSize}|${channel}|${status}|${trimmedSearch}`
  const cached = _extractionsPagedCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < EXTRACTIONS_CACHE_TTL_MS) {
    return cached.value
  }

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  if (channel && channel !== 'all') params.set('channel', channel)
  if (status && status !== 'all') params.set('status', status)
  if (trimmedSearch) params.set('search', trimmedSearch)

  const result = await apiRequest(`/api/extractions?${params.toString()}`)
  const value = {
    items: (result?.items || []).map(rowToItem),
    total: result?.total || 0,
    aggregateCounts: result?.aggregateCounts || null,
  }
  _extractionsPagedCache.set(cacheKey, { value, ts: Date.now() })
  return value
}

export async function getExtractionById(id) {
  const item = await apiRequest(`/api/extractions/${id}`)
  return rowToItem(item)
}

export async function deleteExtraction(id) {
  await apiRequest(`/api/extractions/${id}`, { method: 'DELETE' })
  invalidateExtractionsCache()
}

export async function updateUploadStatus(id, channel, info) {
  const item = await apiRequest(`/api/extractions/${id}/upload-status`, {
    method: 'PATCH',
    body: JSON.stringify({ channel, info }),
  })
  invalidateExtractionsCache()
  return rowToItem(item)
}

export async function deleteExtractionChannel(id, channel) {
  await apiRequest(`/api/extractions/${id}/channels/${channel}`, { method: 'DELETE' })
  invalidateExtractionsCache()
}

export async function saveImages() {}
export async function loadImages() { return null }

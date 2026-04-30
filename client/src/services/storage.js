import { supabase, BUCKETS } from './supabase'

const EXTRACTION_LIST_COLUMNS = 'id, created_at, file_name, summary, blog_content, newsletter_content, instagram_content, shorts_script, upload_status'
const API_BASE = import.meta.env.VITE_SERVER_URL || ''

// ===== Helpers =====
const b64ToBlob = (dataUrl) => {
  if (!dataUrl?.startsWith?.('data:')) return null
  const [meta, data] = dataUrl.split(',')
  const mime = /data:([^;]+);/.exec(meta)?.[1] || 'image/png'
  const bin = atob(data)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// data URL(base64)이면 Storage에 업로드하고 public URL 반환. http/https URL은 그대로.
async function uploadIfDataUrl(dataUrl, bucket, prefix) {
  if (!dataUrl || typeof dataUrl !== 'string') return dataUrl
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://') || dataUrl.startsWith('/output/')) {
    return dataUrl
  }
  const blob = b64ToBlob(dataUrl)
  if (!blob) return dataUrl
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data, error } = await supabase.storage.from(bucket).upload(fileName, blob, {
    contentType: blob.type,
    upsert: false,
  })
  if (error) {
    console.warn('[Storage upload 실패]', error.message)
    return dataUrl
  }
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return publicData.publicUrl
}

async function uploadImageArray(images, prefix) {
  if (!Array.isArray(images)) return images
  const results = []
  for (const img of images) {
    if (!img) { results.push(img); continue }
    const keys = ['imageUrl', 'url', 'renderedImageUrl', 'pngUrl'].filter(key => img[key])
    if (!keys.length) { results.push(img); continue }
    try {
      const uploadedImage = { ...img }
      const uploadedByValue = new Map()
      for (const key of keys) {
        const originalValue = uploadedImage[key]
        if (uploadedByValue.has(originalValue)) {
          uploadedImage[key] = uploadedByValue.get(originalValue)
          continue
        }

        const uploadedValue = await uploadIfDataUrl(originalValue, BUCKETS.IMAGES, prefix)
        uploadedByValue.set(originalValue, uploadedValue)
        uploadedImage[key] = uploadedValue
      }
      results.push(uploadedImage)
    } catch (err) {
      console.warn('[이미지 업로드 실패]', err.message)
      results.push(img)
    }
  }
  return results
}

function extractImageStoragePaths(images) {
  return (images || [])
    .flatMap(img => [img?.imageUrl, img?.url, img?.renderedImageUrl, img?.pngUrl])
    .map(url => extractStoragePath(url, BUCKETS.IMAGES))
    .filter(Boolean)
}

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

// ===== Public API (모두 async) =====

// 영상 URL(로컬 /output/ 경로 또는 외부 http URL)을 Supabase Storage에 업로드
async function uploadVideoToStorage(video) {
  if (!video || typeof video !== 'object') { console.log('[영상 업로드] video 없음'); return video }
  const url = video.url || video.videoUrl || video.combinedVideoUrl
  console.log('[영상 업로드 시작]', { url, video })
  if (!url) { console.log('[영상 업로드] URL 없음'); return video }
  if (url.includes('.supabase.co/storage/')) { console.log('[영상 업로드] 이미 Supabase URL'); return video }

  try {
    const fetchUrl = url.startsWith('/output/') ? `${API_BASE}${url}` : url
    console.log('[영상 fetch]', fetchUrl)
    const res = await fetch(fetchUrl)
    if (!res.ok) { console.warn('[영상 가져오기 실패]', res.status); return video }
    const blob = await res.blob()
    console.log('[영상 blob 크기]', blob.size, blob.type)
    const fileName = `shorts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
    const { data, error } = await supabase.storage.from(BUCKETS.VIDEOS).upload(fileName, blob, {
      contentType: 'video/mp4',
      upsert: false,
    })
    if (error) { console.warn('[영상 Supabase 업로드 실패]', error); return video }
    const { data: publicData } = supabase.storage.from(BUCKETS.VIDEOS).getPublicUrl(data.path)
    console.log('[영상 업로드 완료]', publicData.publicUrl)
    return { ...video, url: publicData.publicUrl, videoUrl: publicData.publicUrl }
  } catch (err) {
    console.warn('[영상 업로드 오류]', err)
    return video
  }
}

export async function saveExtraction(data) {
  const { parsedText, ...rest } = data

  // 이미지 Storage 업로드 (base64 → public URL)
  const blogImages = await uploadImageArray(rest.blogImages, 'blog')
  const instagramImages = await uploadImageArray(rest.instagramImages, 'insta')
  // 영상 Storage 업로드 (로컬 경로 또는 HeyGen CDN URL → Supabase URL)
  const shortsVideo = await uploadVideoToStorage(rest.shortsVideo)

  const row = {
    file_name: rest.fileName || null,
    summary: rest.summary || null,
    blog_content: rest.blogContent || null,
    newsletter_content: rest.newsletterContent || null,
    instagram_content: rest.instagramContent || null,
    shorts_script: rest.shortsScript || null,
    blog_images: blogImages || null,
    instagram_images: instagramImages || null,
    shorts_video: shortsVideo || null,
    upload_status: rest.uploadStatus || {},
    parsed_text: parsedText || null,
  }

  const { data: inserted, error } = await supabase
    .from('extractions')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[Supabase saveExtraction] 실패:', error)
    throw error
  }
  return inserted.id
}

export async function updateExtractionMedia(id, media = {}) {
  if (!id) throw new Error('extraction id is required')

  const row = {}
  if (Array.isArray(media.blogImages)) {
    row.blog_images = await uploadImageArray(media.blogImages, 'blog')
  }
  if (Array.isArray(media.instagramImages)) {
    row.instagram_images = await uploadImageArray(media.instagramImages, 'insta')
  }

  if (Object.keys(row).length === 0) return null

  const { data, error } = await supabase
    .from('extractions')
    .update(row)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[Supabase updateExtractionMedia] 실패:', error)
    throw error
  }
  return rowToItem(data)
}

// 기존 호환: 전체 목록 (작은 limit)
export async function getExtractions() {
  const { data, error } = await supabase
    .from('extractions')
    .select(EXTRACTION_LIST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[Supabase getExtractions] 실패:', error)
    return []
  }
  return data.map(rowToItem)
}

// 페이지네이션: 필요한 페이지만 조회
export async function getExtractionsPaged({ page = 1, pageSize = 10 } = {}) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const { data, error, count } = await supabase
    .from('extractions')
    .select(EXTRACTION_LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) {
    console.error('[Supabase getExtractionsPaged] 실패:', error)
    return { items: [], total: 0 }
  }
  return { items: data.map(rowToItem), total: count || 0 }
}

export async function getExtractionById(id) {
  const { data, error } = await supabase
    .from('extractions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[Supabase getExtractionById] 실패:', error)
    return null
  }
  return rowToItem(data)
}

// Supabase Storage URL에서 파일 경로 추출
function extractStoragePath(url, bucket) {
  if (!url || typeof url !== 'string') return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
}

async function removeStorageFilesFromExtraction(row) {
  if (!row) return
  const imagePaths = []
  const videoPaths = []

  ;(row.blog_images || []).forEach(img => {
    const p = extractStoragePath(img?.imageUrl || img?.url, BUCKETS.IMAGES)
    if (p) imagePaths.push(p)
  })
  ;(row.instagram_images || []).forEach(img => {
    const p = extractStoragePath(img?.imageUrl || img?.url, BUCKETS.IMAGES)
    if (p) imagePaths.push(p)
  })

  const video = row.shorts_video
  if (video) {
    const p = extractStoragePath(video.url || video.videoUrl, BUCKETS.VIDEOS)
    if (p) videoPaths.push(p)
  }

  if (imagePaths.length > 0) {
    await supabase.storage.from(BUCKETS.IMAGES).remove(imagePaths).catch(err => console.warn('[Storage 이미지 삭제 실패]', err))
  }
  if (videoPaths.length > 0) {
    await supabase.storage.from(BUCKETS.VIDEOS).remove(videoPaths).catch(err => console.warn('[Storage 영상 삭제 실패]', err))
  }
}

export async function deleteExtraction(id) {
  // 먼저 row 가져와서 Storage 파일들 삭제
  const { data: row } = await supabase.from('extractions').select('blog_images, instagram_images, shorts_video').eq('id', id).maybeSingle()
  if (row) await removeStorageFilesFromExtraction(row)

  const { error } = await supabase.from('extractions').delete().eq('id', id)
  if (error) console.error('[Supabase deleteExtraction] 실패:', error)
}

export async function updateUploadStatus(id, channel, info) {
  const { data, error: readErr } = await supabase
    .from('extractions')
    .select('upload_status')
    .eq('id', id)
    .maybeSingle()
  if (readErr || !data) return

  const uploadStatus = { ...(data.upload_status || {}), [channel]: info }
  const { error } = await supabase
    .from('extractions')
    .update({ upload_status: uploadStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[Supabase updateUploadStatus] 실패:', error)
}

export async function deleteExtractionChannel(id, channel) {
  const channelCol = {
    blog: 'blog_content',
    newsletter: 'newsletter_content',
    instagram: 'instagram_content',
    shorts: 'shorts_script',
  }[channel]
  if (!channelCol) return

  // 전체 row + 미디어 필드 읽기
  const { data, error: readErr } = await supabase
    .from('extractions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (readErr || !data) return

  // 채널에 해당하는 Storage 파일만 삭제
  if (channel === 'blog' && data.blog_images) {
    const paths = extractImageStoragePaths(data.blog_images)
    if (paths.length) await supabase.storage.from(BUCKETS.IMAGES).remove(paths).catch(() => {})
  }
  if (channel === 'instagram' && data.instagram_images) {
    const paths = extractImageStoragePaths(data.instagram_images)
    if (paths.length) await supabase.storage.from(BUCKETS.IMAGES).remove(paths).catch(() => {})
  }
  if (channel === 'shorts' && data.shorts_video) {
    const p = extractStoragePath(data.shorts_video.url || data.shorts_video.videoUrl, BUCKETS.VIDEOS)
    if (p) await supabase.storage.from(BUCKETS.VIDEOS).remove([p]).catch(() => {})
  }

  const updatedChannels = buildChannels({
    blogContent: channelCol === 'blog_content' ? null : data.blog_content,
    newsletterContent: channelCol === 'newsletter_content' ? null : data.newsletter_content,
    instagramContent: channelCol === 'instagram_content' ? null : data.instagram_content,
    shortsScript: channelCol === 'shorts_script' ? null : data.shorts_script,
  })

  if (updatedChannels.length === 0) {
    await supabase.from('extractions').delete().eq('id', id)
    return
  }

  // 채널 본문 + 연관 이미지/영상도 함께 null 처리
  const updatePayload = { [channelCol]: null, updated_at: new Date().toISOString() }
  if (channel === 'blog') updatePayload.blog_images = null
  if (channel === 'instagram') updatePayload.instagram_images = null
  if (channel === 'shorts') updatePayload.shorts_video = null

  const { error } = await supabase
    .from('extractions')
    .update(updatePayload)
    .eq('id', id)
  if (error) console.error('[Supabase deleteExtractionChannel] 실패:', error)
}

// Legacy no-ops (IndexedDB 이미지 저장은 Supabase Storage로 대체)
export async function saveImages() { /* no-op */ }
export async function loadImages() { return null }

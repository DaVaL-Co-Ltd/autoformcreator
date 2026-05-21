const EXTRACTION_LIST_COLUMNS = 'id,created_at,file_name,summary,blog_content,newsletter_content,instagram_content,shorts_script,upload_status,blog_images,instagram_images,shorts_video,parsed_text'
const IMAGE_BUCKET = 'extraction-images'
const VIDEO_BUCKET = 'extraction-videos'

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  return { url, serviceRoleKey }
}

function ensureSupabaseConfigured() {
  const { url, serviceRoleKey } = getSupabaseConfig()
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase is not configured on the server.')
  }
  return { url, serviceRoleKey }
}

function buildRestHeaders({ prefer, accept, contentType = 'application/json' } = {}) {
  const { serviceRoleKey } = ensureSupabaseConfigured()
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  }
  if (contentType) headers['Content-Type'] = contentType
  if (prefer) headers.Prefer = prefer
  if (accept) headers.Accept = accept
  return headers
}

function encodeObjectPath(objectPath) {
  return String(objectPath)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

function buildPublicStorageUrl(bucket, objectPath) {
  const { url } = ensureSupabaseConfigured()
  return `${url}/storage/v1/object/public/${bucket}/${encodeObjectPath(objectPath)}`
}

function buildRequestOrigin(req) {
  const origin = String(req.headers.origin || '').trim()
  if (origin) return origin
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()
  if (!host) return ''
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').trim()
  return `${protocol}://${host}`
}

async function readJsonSafe(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function getErrorMessage(data, fallback) {
  if (typeof data === 'string' && data) return data
  return data?.message || data?.error_description || data?.error || fallback
}

async function restRequest(path, { method = 'GET', headers = {}, body } = {}) {
  const { url } = ensureSupabaseConfigured()
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body,
  })
  const data = await readJsonSafe(response)
  if (!response.ok) {
    throw new Error(getErrorMessage(data, `Supabase request failed (${response.status})`))
  }
  return { data, response }
}

function buildSelectParams({ select = '*', orderBy, ascending = false, limit, offset } = {}) {
  const params = new URLSearchParams()
  params.set('select', select)
  if (orderBy) {
    params.set('order', `${orderBy}.${ascending ? 'asc' : 'desc'}`)
  }
  if (typeof limit === 'number') params.set('limit', String(limit))
  if (typeof offset === 'number') params.set('offset', String(offset))
  return params
}

function normalizeRemoteUrl(url, requestOrigin) {
  if (!url || typeof url !== 'string') return url
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) {
    return requestOrigin ? `${requestOrigin}${url}` : url
  }
  return url
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid data URL.')
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

async function uploadBufferToStorage({ buffer, mimeType, bucket, objectPath }) {
  const headers = buildRestHeaders({ contentType: mimeType })
  headers['x-upsert'] = 'false'

  await restRequest(`/storage/v1/object/${bucket}/${encodeObjectPath(objectPath)}`, {
    method: 'POST',
    headers,
    body: buffer,
  })

  return buildPublicStorageUrl(bucket, objectPath)
}

async function uploadDataUrlToStorage(dataUrl, bucket, prefix) {
  const { mimeType, buffer } = dataUrlToBuffer(dataUrl)
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  const objectPath = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  return uploadBufferToStorage({ buffer, mimeType, bucket, objectPath })
}

async function uploadIfNeeded(url, bucket, prefix, requestOrigin) {
  if (!url || typeof url !== 'string') return url
  if (url.startsWith('data:')) {
    return uploadDataUrlToStorage(url, bucket, prefix)
  }
  return normalizeRemoteUrl(url, requestOrigin)
}

async function uploadImageArray(images, prefix, requestOrigin) {
  if (!Array.isArray(images)) return images
  const results = []

  for (const image of images) {
    if (!image || typeof image !== 'object') {
      results.push(image)
      continue
    }

    const nextImage = { ...image }
    const fields = ['imageUrl', 'url', 'renderedImageUrl', 'pngUrl']
    for (const field of fields) {
      if (!nextImage[field]) continue
      nextImage[field] = await uploadIfNeeded(nextImage[field], IMAGE_BUCKET, prefix, requestOrigin)
    }

    results.push(nextImage)
  }

  return results
}

async function normalizeShortsVideo(video, requestOrigin) {
  if (!video || typeof video !== 'object') return video

  const resolvedUrl = normalizeRemoteUrl(video.url || video.videoUrl || video.combinedVideoUrl, requestOrigin)
  if (!resolvedUrl) return video

  return {
    ...video,
    url: resolvedUrl,
    videoUrl: resolvedUrl,
    combinedVideoUrl: video.combinedVideoUrl ? normalizeRemoteUrl(video.combinedVideoUrl, requestOrigin) : video.combinedVideoUrl,
    rawUrl: video.rawUrl ? normalizeRemoteUrl(video.rawUrl, requestOrigin) : video.rawUrl,
  }
}

function buildChannels(data) {
  const channels = []
  if (data.blogContent) channels.push({ channel: 'blog', title: data.blogContent.title })
  if (data.newsletterContent) channels.push({ channel: 'newsletter', title: data.newsletterContent.subject })
  if (data.instagramContent) {
    channels.push({
      channel: 'instagram',
      title: data.instagramContent.title || `카드뉴스 ${data.instagramContent.cardTopics?.length || data.instagramContent.cards?.length || 0}장`,
    })
  }
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

function extractStoragePath(url, bucket) {
  if (!url || typeof url !== 'string') return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const index = url.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0])
}

function extractImageStoragePaths(images) {
  return (images || [])
    .flatMap(image => [image?.imageUrl, image?.url, image?.renderedImageUrl, image?.pngUrl])
    .map(url => extractStoragePath(url, IMAGE_BUCKET))
    .filter(Boolean)
}

async function deleteStorageObject(bucket, objectPath) {
  if (!objectPath) return
  await restRequest(`/storage/v1/object/${bucket}/${encodeObjectPath(objectPath)}`, {
    method: 'DELETE',
    headers: buildRestHeaders({ contentType: null }),
  })
}

async function deleteStorageObjects(bucket, paths) {
  for (const objectPath of paths) {
    try {
      await deleteStorageObject(bucket, objectPath)
    } catch {}
  }
}

async function fetchExtractionRow(id, select = '*') {
  const params = buildSelectParams({ select, limit: 1, offset: 0 })
  params.set('id', `eq.${id}`)
  const { data } = await restRequest(`/rest/v1/extractions?${params.toString()}`, {
    headers: buildRestHeaders(),
  })
  return Array.isArray(data) ? data[0] || null : data
}

async function saveExtraction(data, req) {
  const requestOrigin = buildRequestOrigin(req)
  const { parsedText, ...rest } = data || {}

  const row = {
    file_name: rest.fileName || null,
    summary: rest.summary || null,
    blog_content: rest.blogContent || null,
    newsletter_content: rest.newsletterContent || null,
    instagram_content: rest.instagramContent || null,
    shorts_script: rest.shortsScript || null,
    blog_images: await uploadImageArray(rest.blogImages, 'blog', requestOrigin),
    instagram_images: await uploadImageArray(rest.instagramImages, 'insta', requestOrigin),
    shorts_video: await normalizeShortsVideo(rest.shortsVideo, requestOrigin),
    upload_status: rest.uploadStatus || {},
    parsed_text: parsedText || null,
  }

  const { data: inserted } = await restRequest('/rest/v1/extractions', {
    method: 'POST',
    headers: buildRestHeaders({ prefer: 'return=representation' }),
    body: JSON.stringify(row),
  })

  return rowToItem(Array.isArray(inserted) ? inserted[0] : inserted)
}

async function updateExtractionMedia(id, media, req) {
  const requestOrigin = buildRequestOrigin(req)
  const patch = {}

  if (Array.isArray(media?.blogImages)) {
    patch.blog_images = await uploadImageArray(media.blogImages, 'blog', requestOrigin)
  }
  if (Array.isArray(media?.instagramImages)) {
    patch.instagram_images = await uploadImageArray(media.instagramImages, 'insta', requestOrigin)
  }

  if (Object.keys(patch).length === 0) {
    return fetchExtractionById(id)
  }

  const params = new URLSearchParams()
  params.set('id', `eq.${id}`)
  params.set('select', '*')
  const { data } = await restRequest(`/rest/v1/extractions?${params.toString()}`, {
    method: 'PATCH',
    headers: buildRestHeaders({ prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })

  return rowToItem(Array.isArray(data) ? data[0] : data)
}

async function updateExtractionContent(id, content) {
  const patch = {}
  if (content?.blogContent !== undefined) patch.blog_content = content.blogContent
  if (content?.newsletterContent !== undefined) patch.newsletter_content = content.newsletterContent
  if (content?.instagramContent !== undefined) patch.instagram_content = content.instagramContent
  if (content?.shortsScript !== undefined) patch.shorts_script = content.shortsScript

  if (Object.keys(patch).length === 0) {
    return fetchExtractionById(id)
  }

  const params = new URLSearchParams()
  params.set('id', `eq.${id}`)
  params.set('select', '*')
  const { data } = await restRequest(`/rest/v1/extractions?${params.toString()}`, {
    method: 'PATCH',
    headers: buildRestHeaders({ prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })

  return rowToItem(Array.isArray(data) ? data[0] : data)
}

async function fetchContentStats() {
  try {
    const params = new URLSearchParams()
    params.set('select', 'channel,total_count,not_uploaded_count,scheduled_count,uploaded_count,updated_at')
    const { data } = await restRequest(`/rest/v1/content_stats?${params.toString()}`, {
      headers: buildRestHeaders(),
    })
    const rows = Array.isArray(data) ? data : []
    if (!rows.length) return null
    const stats = {}
    for (const row of rows) {
      if (!row?.channel) continue
      stats[row.channel] = {
        all: Number(row.total_count) || 0,
        not_uploaded: Number(row.not_uploaded_count) || 0,
        scheduled: Number(row.scheduled_count) || 0,
        uploaded: Number(row.uploaded_count) || 0,
      }
    }
    return stats
  } catch {
    return null
  }
}

async function listExtractions({ page, pageSize } = {}) {
  const paged = typeof page === 'number' && typeof pageSize === 'number'
  const params = buildSelectParams({
    select: EXTRACTION_LIST_COLUMNS,
    orderBy: 'created_at',
    ascending: false,
    limit: paged ? pageSize : 500,
    offset: paged ? (page - 1) * pageSize : 0,
  })

  const headers = buildRestHeaders(paged ? { prefer: 'count=exact' } : {})
  const [{ data, response }, aggregateCounts] = await Promise.all([
    restRequest(`/rest/v1/extractions?${params.toString()}`, { headers }),
    fetchContentStats(),
  ])

  if (!paged) {
    return {
      items: (data || []).map(rowToItem),
      aggregateCounts,
    }
  }

  const contentRange = response.headers.get('content-range') || ''
  const total = Number(contentRange.split('/')[1] || 0) || 0
  return {
    items: (data || []).map(rowToItem),
    total,
    aggregateCounts,
  }
}

async function fetchExtractionById(id) {
  const row = await fetchExtractionRow(id, '*')
  return rowToItem(row)
}

async function updateUploadStatus(id, channel, info) {
  const row = await fetchExtractionRow(id, 'id,upload_status')
  if (!row) return null

  const uploadStatus = { ...(row.upload_status || {}), [channel]: info }
  const params = new URLSearchParams()
  params.set('id', `eq.${id}`)
  params.set('select', '*')
  const { data } = await restRequest(`/rest/v1/extractions?${params.toString()}`, {
    method: 'PATCH',
    headers: buildRestHeaders({ prefer: 'return=representation' }),
    body: JSON.stringify({
      upload_status: uploadStatus,
      updated_at: new Date().toISOString(),
    }),
  })

  return rowToItem(Array.isArray(data) ? data[0] : data)
}

async function deleteExtraction(id) {
  const row = await fetchExtractionRow(id, 'id,blog_images,instagram_images,shorts_video')
  if (row) {
    await deleteStorageObjects(IMAGE_BUCKET, [
      ...extractImageStoragePaths(row.blog_images),
      ...extractImageStoragePaths(row.instagram_images),
    ])

    const videoPath = extractStoragePath(row.shorts_video?.url || row.shorts_video?.videoUrl, VIDEO_BUCKET)
    if (videoPath) {
      await deleteStorageObject(VIDEO_BUCKET, videoPath)
    }
  }

  const params = new URLSearchParams()
  params.set('id', `eq.${id}`)
  await restRequest(`/rest/v1/extractions?${params.toString()}`, {
    method: 'DELETE',
    headers: buildRestHeaders(),
  })
}

async function deleteExtractionChannel(id, channel) {
  const channelColumn = {
    blog: 'blog_content',
    newsletter: 'newsletter_content',
    instagram: 'instagram_content',
    shorts: 'shorts_script',
  }[channel]

  if (!channelColumn) return null

  const row = await fetchExtractionRow(id, '*')
  if (!row) return null

  if (channel === 'blog') {
    await deleteStorageObjects(IMAGE_BUCKET, extractImageStoragePaths(row.blog_images))
  }
  if (channel === 'instagram') {
    await deleteStorageObjects(IMAGE_BUCKET, extractImageStoragePaths(row.instagram_images))
  }
  if (channel === 'shorts') {
    const videoPath = extractStoragePath(row.shorts_video?.url || row.shorts_video?.videoUrl, VIDEO_BUCKET)
    if (videoPath) await deleteStorageObject(VIDEO_BUCKET, videoPath)
  }

  const remainingChannels = buildChannels({
    blogContent: channel === 'blog' ? null : row.blog_content,
    newsletterContent: channel === 'newsletter' ? null : row.newsletter_content,
    instagramContent: channel === 'instagram' ? null : row.instagram_content,
    shortsScript: channel === 'shorts' ? null : row.shorts_script,
  })

  if (remainingChannels.length === 0) {
    await deleteExtraction(id)
    return null
  }

  const patch = {
    [channelColumn]: null,
    updated_at: new Date().toISOString(),
  }
  if (channel === 'blog') patch.blog_images = null
  if (channel === 'instagram') patch.instagram_images = null
  if (channel === 'shorts') patch.shorts_video = null

  const params = new URLSearchParams()
  params.set('id', `eq.${id}`)
  params.set('select', '*')
  const { data } = await restRequest(`/rest/v1/extractions?${params.toString()}`, {
    method: 'PATCH',
    headers: buildRestHeaders({ prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })

  return rowToItem(Array.isArray(data) ? data[0] : data)
}

module.exports = {
  ensureSupabaseConfigured,
  saveExtraction,
  updateExtractionMedia,
  updateExtractionContent,
  listExtractions,
  fetchExtractionById,
  updateUploadStatus,
  deleteExtraction,
  deleteExtractionChannel,
}

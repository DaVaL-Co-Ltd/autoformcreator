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
  if (row.data && row.channels) return row

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

export async function saveExtraction(data) {
  const item = await apiRequest('/api/extractions', {
    method: 'POST',
    body: JSON.stringify(data || {}),
  })
  return item?.id
}

export async function updateExtractionMedia(id, media = {}) {
  const item = await apiRequest(`/api/extractions/${id}/media`, {
    method: 'PATCH',
    body: JSON.stringify(media),
  })
  return rowToItem(item)
}

export async function getExtractions() {
  const result = await apiRequest('/api/extractions')
  return (result?.items || []).map(rowToItem)
}

export async function getExtractionsPaged({ page = 1, pageSize = 10 } = {}) {
  const result = await apiRequest(`/api/extractions?page=${page}&pageSize=${pageSize}`)
  return {
    items: (result?.items || []).map(rowToItem),
    total: result?.total || 0,
  }
}

export async function getExtractionById(id) {
  const item = await apiRequest(`/api/extractions/${id}`)
  return rowToItem(item)
}

export async function deleteExtraction(id) {
  await apiRequest(`/api/extractions/${id}`, { method: 'DELETE' })
}

export async function updateUploadStatus(id, channel, info) {
  const item = await apiRequest(`/api/extractions/${id}/upload-status`, {
    method: 'PATCH',
    body: JSON.stringify({ channel, info }),
  })
  return rowToItem(item)
}

export async function deleteExtractionChannel(id, channel) {
  await apiRequest(`/api/extractions/${id}/channels/${channel}`, { method: 'DELETE' })
}

export async function saveImages() {}
export async function loadImages() { return null }

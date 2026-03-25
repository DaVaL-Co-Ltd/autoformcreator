const STORAGE_KEY = 'autocreator_contents'
const NOTION_API = 'http://localhost:3001/api/notion'
const IMG_DB_NAME = 'autocreator_images'
const IMG_STORE = 'images'

function openImgDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMG_DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IMG_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveImages(extractionId, blogImages) {
  try {
    const db = await openImgDB()
    const tx = db.transaction(IMG_STORE, 'readwrite')
    tx.objectStore(IMG_STORE).put(blogImages, `blog_${extractionId}`)
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
  } catch (err) {
    console.warn('[ImageDB] 저장 실패:', err.message)
  }
}

export async function loadImages(extractionId) {
  try {
    const db = await openImgDB()
    const tx = db.transaction(IMG_STORE, 'readonly')
    const req = tx.objectStore(IMG_STORE).get(`blog_${extractionId}`)
    return new Promise((res) => { req.onsuccess = () => res(req.result || null); req.onerror = () => res(null) })
  } catch {
    return null
  }
}

export function saveExtraction(data) {
  const { fileBase64, blogImages, instagramImages, shortsVideo, shortsNarration, longformNarration, parsedText, ...lightData } = data

  const channels = []
  if (data.blogContent) channels.push({ channel: 'blog', title: data.blogContent.title })
  if (data.newsletterContent) channels.push({ channel: 'newsletter', title: data.newsletterContent.subject })
  if (data.instagramContent) channels.push({ channel: 'instagram', title: `카드뉴스 ${data.instagramContent.cards?.length || 0}장` })
  if (data.shortsScript) channels.push({ channel: 'shorts', title: data.shortsScript.title })
  if (data.longformScript) channels.push({ channel: 'longform', title: data.longformScript.title })

  const item = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    fileName: data.fileName,
    summary: data.summary,
    channels,
    data: lightData,
  }

  // localStorage 저장 (로컬 캐시)
  const existing = getExtractions()
  existing.unshift(item)
  const trimmed = existing.slice(0, 20)
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)) } catch {}

  // IndexedDB에 이미지 저장 (용량 제한 없음)
  if (data.blogImages?.length) {
    saveImages(item.id, data.blogImages).catch(() => {})
  }

  // Notion 저장 (비동기, 실패해도 무시)
  fetch(`${NOTION_API}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: data.fileName, channels, summary: data.summary, data: lightData, blogImages: data.blogImages }),
  }).catch(err => console.warn('[Notion] 저장 실패:', err.message))

  return item.id
}

export function getExtractions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function getExtractionById(id) {
  const items = getExtractions()
  return items.find(i => i.id === id)
}

export function deleteExtraction(id) {
  const items = getExtractions().filter(i => i.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function deleteExtractionChannel(id, channel) {
  const items = getExtractions().map(item => {
    if (item.id !== id) return item

    // channels 목록에서 제거
    const updatedChannels = item.channels.filter(ch => ch.channel !== channel)

    // data에서 해당 채널 데이터 제거
    const channelDataKeys = {
      blog: 'blogContent',
      newsletter: 'newsletterContent',
      instagram: 'instagramContent',
      shorts: 'shortsScript',
      longform: 'longformScript',
    }
    const dataKey = channelDataKeys[channel]
    const updatedData = { ...item.data }
    if (dataKey) delete updatedData[dataKey]

    return { ...item, channels: updatedChannels, data: updatedData }
  }).filter(item => item.channels.length > 0) // 채널이 0개면 extraction 자체 제거

  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

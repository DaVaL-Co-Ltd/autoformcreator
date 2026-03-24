const STORAGE_KEY = 'autocreator_contents'
const NOTION_API = 'http://localhost:3001/api/notion'

export function saveExtraction(data) {
  const { fileBase64, blogImages, instagramImages, shortsVideo, shortsNarration, longformNarration, longformVideo, parsedText, ...lightData } = data

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

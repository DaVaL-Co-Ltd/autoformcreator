const STORAGE_KEY = 'autocreator_contents'

export function saveExtraction(data) {
  const existing = getExtractions()
  // fileBase64는 용량이 크므로 저장에서 제외
  const { fileBase64, ...dataWithoutFile } = data
  const item = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    fileName: data.fileName,
    summary: data.summary,
    channels: [],
    data: dataWithoutFile,
  }

  if (data.blogContent) item.channels.push({ channel: 'blog', title: data.blogContent.title })
  if (data.newsletterContent) item.channels.push({ channel: 'newsletter', title: data.newsletterContent.subject })
  if (data.instagramContent) item.channels.push({ channel: 'instagram', title: `카드뉴스 ${data.instagramContent.cards?.length || 0}장` })
  if (data.shortsScript) item.channels.push({ channel: 'shorts', title: data.shortsScript.title })
  if (data.longformScript) item.channels.push({ channel: 'longform', title: data.longformScript.title })

  existing.unshift(item)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
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

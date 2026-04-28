function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeInstagramCardStyle(value = '') {
  if (value === 'center-card' || value === 'center-focus') return 'center-card'
  return 'background-text'
}

function cleanCardText(text = '') {
  return String(text)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~`-]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateCardText(text, maxLength = 40) {
  const clean = cleanCardText(text)
  if (clean.length <= maxLength) return clean

  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return `${clean.slice(0, maxLength).trim()}...`

  let truncated = ''
  for (const word of words) {
    const next = truncated ? `${truncated} ${word}` : word
    if (next.length > maxLength) break
    truncated = next
  }

  return `${(truncated || clean.slice(0, maxLength)).trim()}...`
}

function deriveInstagramDetailLines(card) {
  const lines = []
  const contentText = cleanCardText(card?.content || '')
  const dataPointText = cleanCardText(card?.dataPoint || '')

  const contentSentences = contentText
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  for (const sentence of contentSentences) {
    if (lines.length >= 3) break
    lines.push(truncateCardText(sentence, 40))
  }

  if (dataPointText && lines.length < 3) {
    lines.push(truncateCardText(dataPointText, 34))
  }

  if (lines.length === 0 && contentText) {
    lines.push(truncateCardText(contentText, 40))
  }

  return lines.slice(0, 3)
}

function getCardSource(source = {}) {
  const instagramContent = source?.instagramContent || source?.content || source || {}
  const cards = ensureArray(instagramContent?.cards || instagramContent?.cardTopics)
  const renderedUrls = ensureArray(source?.instaPngUrls || source?.renderedImageUrls).filter(Boolean)
  const rawImages = ensureArray(source?.instagramImages || source?.imageUrls)

  return { instagramContent, cards, renderedUrls, rawImages }
}

function extractImageUrl(image) {
  if (typeof image === 'string') return image
  return image?.imageUrl || image?.url || null
}

function pickCardImageUrl(rawImages, card, index) {
  const cardNumber = Number(card?.cardNumber || card?.card_number) || index + 1
  const matched = rawImages.find((image, imageIndex) => {
    const imageCardNumber = Number(image?.cardNumber || image?.card_number) || imageIndex + 1
    return imageCardNumber === cardNumber
  })

  return extractImageUrl(matched) || extractImageUrl(rawImages[index]) || extractImageUrl(rawImages[0]) || null
}

function wrapText(ctx, text, maxWidth) {
  const words = cleanCardText(text).split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const lines = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(nextLine).width <= maxWidth || !currentLine) {
      currentLine = nextLine
      continue
    }

    lines.push(currentLine)
    currentLine = word
  }

  if (currentLine) lines.push(currentLine)
  return lines
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

async function loadImageElement(url) {
  if (!url) return null

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)

    try {
      const image = await new Promise((resolve, reject) => {
        const nextImage = new Image()
        nextImage.onload = () => resolve(nextImage)
        nextImage.onerror = reject
        nextImage.src = objectUrl
      })
      return image
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch (error) {
    console.warn('[scheduledPayloads] Failed to load instagram image:', error)
    return null
  }
}

function drawCoverImage(ctx, image, size) {
  if (!image) {
    const gradient = ctx.createLinearGradient(0, 0, size, size)
    gradient.addColorStop(0, '#f9a8d4')
    gradient.addColorStop(0.5, '#fdf2f8')
    gradient.addColorStop(1, '#fed7aa')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    return
  }

  const ratio = Math.max(size / image.width, size / image.height)
  const width = image.width * ratio
  const height = image.height * ratio
  const x = (size - width) / 2
  const y = (size - height) / 2
  ctx.drawImage(image, x, y, width, height)
}

function drawCenterCardOverlay(ctx, size, cardNumber, title, detailLines) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
  ctx.fillRect(0, 0, size, size)

  const panelWidth = size * 0.7
  const panelHeight = size * 0.46
  const panelX = (size - panelWidth) / 2
  const panelY = (size - panelHeight) / 2

  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 36)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)'
  ctx.lineWidth = 2
  ctx.stroke()

  const badgeWidth = 180
  const badgeHeight = 46
  drawRoundedRect(ctx, panelX + (panelWidth - badgeWidth) / 2, panelY + 36, badgeWidth, badgeHeight, 23)
  ctx.fillStyle = 'rgba(99, 102, 241, 0.12)'
  ctx.fill()

  ctx.fillStyle = '#4338ca'
  ctx.font = '800 22px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`CARD ${String(cardNumber).padStart(2, '0')}`, size / 2, panelY + 59)

  ctx.fillStyle = '#1f2937'
  ctx.font = '900 64px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  const titleLines = wrapText(ctx, title, panelWidth - 120).slice(0, 3)
  const titleStartY = panelY + 140
  titleLines.forEach((line, index) => {
    ctx.fillText(line, size / 2, titleStartY + (index * 78))
  })

  ctx.fillStyle = '#4b5563'
  ctx.font = '600 34px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  const detailStartY = titleStartY + (titleLines.length * 78) + 30
  detailLines.slice(0, 3).forEach((line, index) => {
    const wrapped = wrapText(ctx, line, panelWidth - 140).slice(0, 2)
    wrapped.forEach((wrappedLine, lineIndex) => {
      ctx.fillText(wrappedLine, size / 2, detailStartY + (index * 58) + (lineIndex * 40))
    })
  })
}

function drawBottomCardOverlay(ctx, size, cardNumber, title, detailLines) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  ctx.fillRect(0, 0, size, size)

  const badgeWidth = 88
  const badgeHeight = 48
  const badgeX = size - badgeWidth - 72
  const badgeY = 72
  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 24)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.64)'
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 30px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(cardNumber), badgeX + (badgeWidth / 2), badgeY + (badgeHeight / 2))

  const panelWidth = size - 140
  const panelHeight = size * 0.34
  const panelX = 70
  const panelY = size - panelHeight - 70

  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 30)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
  ctx.fill()

  ctx.fillStyle = '#1f2937'
  ctx.font = '900 58px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  ctx.textAlign = 'left'
  const titleLines = wrapText(ctx, title, panelWidth - 100).slice(0, 2)
  const textX = panelX + 50
  const titleStartY = panelY + 76
  titleLines.forEach((line, index) => {
    ctx.fillText(line, textX, titleStartY + (index * 70))
  })

  ctx.fillStyle = '#4b5563'
  ctx.font = '600 32px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  let nextY = titleStartY + (titleLines.length * 70) + 18
  detailLines.slice(0, 3).forEach((line) => {
    const wrapped = wrapText(ctx, line, panelWidth - 100).slice(0, 2)
    wrapped.forEach((wrappedLine) => {
      ctx.fillText(wrappedLine, textX, nextY)
      nextY += 40
    })
    nextY += 10
  })
}

async function renderInstagramCardDataUrl({ imageUrl, card, cardIndex, cardStyle }) {
  const size = 1080
  const title = truncateCardText(card?.title || card?.heading || card?.headline || `인스타 카드 ${cardIndex + 1}`, 28)
  const detailLines = deriveInstagramDetailLines(card)
  const image = await loadImageElement(imageUrl)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  drawCoverImage(ctx, image, size)

  if (cardStyle === 'center-card') {
    drawCenterCardOverlay(ctx, size, card?.cardNumber || cardIndex + 1, title, detailLines)
  } else {
    drawBottomCardOverlay(ctx, size, card?.cardNumber || cardIndex + 1, title, detailLines)
  }

  return canvas.toDataURL('image/png')
}

export function buildInstagramScheduledContent(source = {}) {
  const { instagramContent, renderedUrls, rawImages } = getCardSource(source)
  const fallbackUrls = rawImages.map(extractImageUrl).filter(Boolean)
  const imageUrls = renderedUrls.length > 0 ? renderedUrls : fallbackUrls

  const baseCaption = String(instagramContent?.caption || '').trim()
  const hashtagText = ensureArray(instagramContent?.hashtags)
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  const caption = hashtagText ? `${baseCaption}\n\n${hashtagText}`.trim() : baseCaption

  const title = instagramContent?.title || instagramContent?.headline || instagramContent?.summary || ''

  return {
    title,
    caption,
    imageUrls,
  }
}

export async function buildInstagramScheduledUploadContent(source = {}) {
  const baseContent = buildInstagramScheduledContent(source)
  const { instagramContent, cards, renderedUrls, rawImages } = getCardSource(source)

  if (renderedUrls.length > 0 || cards.length === 0 || rawImages.length === 0 || typeof document === 'undefined') {
    return baseContent
  }

  const cardStyle = normalizeInstagramCardStyle(instagramContent?.cardStyle)
  const renderedCards = []

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    const imageUrl = pickCardImageUrl(rawImages, card, index)

    if (!imageUrl) {
      renderedCards.push(null)
      continue
    }

    try {
      const renderedUrl = await renderInstagramCardDataUrl({ imageUrl, card, cardIndex: index, cardStyle })
      renderedCards.push(renderedUrl)
    } catch (error) {
      console.warn(`[scheduledPayloads] Failed to render instagram card ${index + 1}:`, error)
      renderedCards.push(imageUrl)
    }
  }

  const imageUrls = renderedCards.filter(Boolean)
  return {
    ...baseContent,
    imageUrls: imageUrls.length > 0 ? imageUrls : baseContent.imageUrls,
  }
}

import {
  cleanCardText as sharedCleanCardText,
  deriveInstagramDetailLines as sharedDeriveInstagramDetailLines,
  wrapCardTextLines,
} from './contentImageOverlay'

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeInstagramCardStyle(value = '') {
  if (value === 'center-card' || value === 'center-focus') return 'center-card'
  return 'background-text'
}

function deriveInstagramDetailLines(card) {
  return sharedDeriveInstagramDetailLines(card)
}

const INSTAGRAM_CAPTION_MAX_LENGTH = 2200
const CARD_CAPTION_ICONS = ['📌', '📊', '💡', '✅', '🔎', '🧭', '✨', '📍', '📝', '🚀']

function getCardSource(source = {}) {
  const instagramContent = source?.instagramContent || source?.content || source || {}
  const cards = ensureArray(instagramContent?.cards || instagramContent?.cardTopics)
  const rawImages = ensureArray(source?.instagramImages || source?.imageUrls)
  const renderedUrls = [
    ...ensureArray(source?.instaPngUrls || source?.renderedImageUrls),
    ...rawImages.map((image) => image?.renderedImageUrl || image?.pngUrl),
  ].filter(Boolean)

  return { instagramContent, cards, renderedUrls, rawImages }
}

function extractImageUrl(image) {
  if (typeof image === 'string') return image
  return image?.renderedImageUrl || image?.pngUrl || image?.imageUrl || image?.url || null
}

function truncateText(value = '', maxLength = 64) {
  const text = sharedCleanCardText(value)
  if (text.length <= maxLength) return text

  const words = text.split(/\s+/).filter(Boolean)
  let output = ''
  for (const word of words) {
    const next = output ? `${output} ${word}` : word
    if (next.length > maxLength && output) break
    output = next
    if (next.length >= maxLength) break
  }

  return output || text.slice(0, maxLength)
}

function getCardCaptionParts(card = {}, index = 0) {
  const cardNumber = Number(card?.cardNumber || card?.card_number) || index + 1
  const headline = sharedCleanCardText(card?.title || card?.heading || card?.headline || `카드 ${cardNumber}`)
  const detailLines = deriveInstagramDetailLines(card)
  const detail = sharedCleanCardText(card?.dataPoint || detailLines[0] || card?.content || card?.subtitle || '')
  return {
    cardNumber,
    headline,
    detail,
  }
}

function isCardCoveredByCaption(caption = '', card = {}, index = 0) {
  const lowerCaption = sharedCleanCardText(caption).toLowerCase()
  if (!lowerCaption) return false

  const { headline, detail } = getCardCaptionParts(card, index)
  const candidates = [
    headline,
    detail,
    card?.dataPoint,
    card?.content,
  ]
    .map((value) => sharedCleanCardText(value).toLowerCase())
    .filter((value) => value.length >= 3)

  return candidates.some((value) => lowerCaption.includes(value))
}

function buildCardCaptionLine(card = {}, index = 0) {
  const { cardNumber, headline, detail } = getCardCaptionParts(card, index)
  const icon = CARD_CAPTION_ICONS[index % CARD_CAPTION_ICONS.length]
  const title = truncateText(headline, 26)
  const body = truncateText(detail, 58)

  if (title && body && title !== body) return `${icon} ${cardNumber}. ${title}: ${body}`
  if (title || body) return `${icon} ${cardNumber}. ${title || body}`
  return ''
}

export function buildInstagramCaption(instagramContent = {}) {
  const cards = ensureArray(instagramContent?.cards || instagramContent?.cardTopics)
  const baseCaption = String(instagramContent?.caption || instagramContent?.body || instagramContent?.title || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
  if (!cards.length) return baseCaption.slice(0, INSTAGRAM_CAPTION_MAX_LENGTH)

  const missingLines = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card, index }) => !isCardCoveredByCaption(baseCaption, card, index))
    .map(({ card, index }) => buildCardCaptionLine(card, index))
    .filter(Boolean)

  if (!missingLines.length) return baseCaption.slice(0, INSTAGRAM_CAPTION_MAX_LENGTH)

  const cardBlock = ['카드별 핵심', ...missingLines].join('\n')
  const separator = baseCaption ? '\n\n' : ''
  const nextCaption = `${baseCaption}${separator}${cardBlock}`.trim()

  return nextCaption.slice(0, INSTAGRAM_CAPTION_MAX_LENGTH).trim()
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
  return wrapCardTextLines(text, (line) => ctx.measureText(line).width, maxWidth)
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
  const titleLines = wrapText(ctx, title, panelWidth - 120)
  const titleStartY = panelY + 140
  titleLines.forEach((line, index) => {
    ctx.fillText(line, size / 2, titleStartY + (index * 78))
  })

  ctx.fillStyle = '#4b5563'
  ctx.font = '600 34px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  const detailStartY = titleStartY + (titleLines.length * 78) + 30
  detailLines.forEach((line, index) => {
    const wrapped = wrapText(ctx, line, panelWidth - 140)
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
  const titleLines = wrapText(ctx, title, panelWidth - 100)
  const textX = panelX + 50
  const titleStartY = panelY + 76
  titleLines.forEach((line, index) => {
    ctx.fillText(line, textX, titleStartY + (index * 70))
  })

  ctx.fillStyle = '#4b5563'
  ctx.font = '600 32px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif'
  let nextY = titleStartY + (titleLines.length * 70) + 18
  detailLines.forEach((line) => {
    const wrapped = wrapText(ctx, line, panelWidth - 100)
    wrapped.forEach((wrappedLine) => {
      ctx.fillText(wrappedLine, textX, nextY)
      nextY += 40
    })
    nextY += 10
  })
}

async function renderInstagramCardDataUrl({ imageUrl, card, cardIndex, cardStyle }) {
  const size = 1080
  const title = sharedCleanCardText(card?.title || card?.heading || card?.headline || `?몄뒪? 移대뱶 ${cardIndex + 1}`)
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

  const baseCaption = buildInstagramCaption(instagramContent)
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

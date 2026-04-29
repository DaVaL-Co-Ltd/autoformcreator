import {
  cleanCardText,
  deriveBlogHeadline,
  deriveBlogImageDescription,
  deriveInstagramDetailLines,
  wrapCardTextLines,
} from './contentImageOverlay'

const FALLBACK_SIZE = 1536
const BLOG_ACCENT_COLORS = ['#e57a00', '#2e7d32', '#1565c0', '#7b1fa2']

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getBaseSize(width, height) {
  return Math.min(width || FALLBACK_SIZE, height || FALLBACK_SIZE)
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
    console.warn('[uploadImageComposite] Failed to load image:', error)
    return null
  }
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

function drawCoverImage(ctx, image, width, height) {
  if (!image) {
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, '#f8fafc')
    gradient.addColorStop(0.55, '#eef2ff')
    gradient.addColorStop(1, '#fdf2f8')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    return
  }

  const ratio = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * ratio
  const drawHeight = image.height * ratio
  const x = (width - drawWidth) / 2
  const y = (height - drawHeight) / 2
  ctx.drawImage(image, x, y, drawWidth, drawHeight)
}

function wrapText(ctx, text, maxWidth) {
  return wrapCardTextLines(text, (line) => ctx.measureText(line).width, maxWidth)
}

function normalizeInstagramLayout(value = '') {
  if (value === 'center-card' || value === 'center-focus') return 'center-card'
  if (value && typeof value === 'object') {
    return value.layout || value.cardStyle || 'background-text'
  }
  return 'background-text'
}

function getImageUrl(image) {
  if (!image) return null
  if (typeof image === 'string') return image
  return image.imageUrl || image.url || image.renderedImageUrl || image.pngUrl || null
}

function findBlogImageSource(images, section, index) {
  const list = Array.isArray(images) ? images : []
  return list.find((image) => image?.heading === section?.heading && getImageUrl(image)) || list[index] || null
}

function findInstagramImageSource(images, card, index) {
  const list = Array.isArray(images) ? images : []
  const cardNumber = Number(card?.cardNumber || card?.card_number) || index + 1
  return list.find((image, imageIndex) => {
    const imageCardNumber = Number(image?.cardNumber || image?.card_number) || imageIndex + 1
    return imageCardNumber === cardNumber
  }) || list[index] || list[0] || null
}

function renderCenteredText(ctx, lines, x, startY, lineHeight) {
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + (index * lineHeight))
  })
}

function drawBlogCircleOverlay(ctx, width, height, headline, description, accentColor) {
  const size = getBaseSize(width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.10)'
  ctx.fillRect(0, 0, width, height)

  const circleSize = size * 0.52
  const circleY = (height - circleSize) / 2

  ctx.save()
  ctx.beginPath()
  ctx.arc(width / 2, height / 2, circleSize / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
  ctx.fill()
  ctx.restore()

  ctx.fillStyle = '#1f2937'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  const headlineFontSize = Math.max(32, Math.round(size * 0.05))
  ctx.font = `900 ${headlineFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const headlineLines = wrapText(ctx, headline, circleSize * 0.68)
  const headlineLineHeight = Math.round(headlineFontSize * 1.18)
  const headlineStartY = circleY + circleSize * 0.27 - ((headlineLines.length - 1) * headlineLineHeight) / 2
  renderCenteredText(ctx, headlineLines, width / 2, headlineStartY, headlineLineHeight)

  const barWidth = circleSize * 0.22
  const barHeight = Math.max(4, Math.round(size * 0.006))
  const barY = headlineStartY + (headlineLines.length * headlineLineHeight) + size * 0.018
  drawRoundedRect(ctx, width / 2 - (barWidth / 2), barY, barWidth, barHeight, barHeight / 2)
  ctx.fillStyle = accentColor
  ctx.fill()

  if (!description) return

  ctx.fillStyle = '#4b5563'
  const bodyFontSize = Math.max(18, Math.round(size * 0.026))
  ctx.font = `600 ${bodyFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const descriptionLines = wrapText(ctx, description, circleSize * 0.62)
  const bodyLineHeight = Math.round(bodyFontSize * 1.35)
  const bodyStartY = barY + barHeight + size * 0.02
  renderCenteredText(ctx, descriptionLines, width / 2, bodyStartY, bodyLineHeight)
}

function drawInstagramBottomOverlay(ctx, width, height, cardNumber, title, detailLines) {
  const size = getBaseSize(width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.10)'
  ctx.fillRect(0, 0, width, height)

  const badgeWidth = size * 0.081
  const badgeHeight = size * 0.044
  const badgeX = width - badgeWidth - size * 0.067
  const badgeY = size * 0.067
  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const badgeFontSize = Math.max(18, Math.round(size * 0.028))
  ctx.font = `700 ${badgeFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  ctx.fillText(String(cardNumber), badgeX + (badgeWidth / 2), badgeY + (badgeHeight / 2))

  const panelWidth = width - size * 0.13
  const panelHeight = size * 0.34
  const panelX = (width - panelWidth) / 2
  const panelY = height - panelHeight - size * 0.065
  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, size * 0.028)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.90)'
  ctx.fill()

  const titleFontSize = Math.max(32, Math.round(size * 0.047))
  const bodyFontSize = Math.max(18, Math.round(size * 0.026))
  const textX = panelX + size * 0.046
  const titleMaxWidth = panelWidth - size * 0.09

  ctx.fillStyle = '#1f2937'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `900 ${titleFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const titleLines = wrapText(ctx, title, titleMaxWidth)
  const titleLineHeight = Math.round(titleFontSize * 1.18)
  let nextY = panelY + size * 0.07
  titleLines.forEach((line) => {
    ctx.fillText(line, textX, nextY)
    nextY += titleLineHeight
  })

  ctx.fillStyle = '#4b5563'
  ctx.font = `600 ${bodyFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const bodyLineHeight = Math.round(bodyFontSize * 1.28)
  nextY += size * 0.015
  detailLines.forEach((line) => {
    const wrappedLines = wrapText(ctx, line, titleMaxWidth)
    wrappedLines.forEach((wrappedLine) => {
      ctx.fillText(wrappedLine, textX, nextY)
      nextY += bodyLineHeight
    })
    nextY += Math.round(size * 0.006)
  })
}

function drawInstagramCenterOverlay(ctx, width, height, cardNumber, title, detailLines) {
  const size = getBaseSize(width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
  ctx.fillRect(0, 0, width, height)

  const panelWidth = size * 0.7
  const panelHeight = size * 0.46
  const panelX = (width - panelWidth) / 2
  const panelY = (height - panelHeight) / 2

  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, size * 0.033)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)'
  ctx.lineWidth = Math.max(2, Math.round(size * 0.002))
  ctx.stroke()

  const badgeWidth = size * 0.17
  const badgeHeight = size * 0.043
  const badgeX = panelX + (panelWidth - badgeWidth) / 2
  const badgeY = panelY + size * 0.033
  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2)
  ctx.fillStyle = 'rgba(99, 102, 241, 0.12)'
  ctx.fill()

  ctx.fillStyle = '#4338ca'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const badgeFontSize = Math.max(18, Math.round(size * 0.02))
  ctx.font = `800 ${badgeFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  ctx.fillText(`CARD ${String(cardNumber).padStart(2, '0')}`, width / 2, badgeY + (badgeHeight / 2))

  ctx.fillStyle = '#1f2937'
  const titleFontSize = Math.max(34, Math.round(size * 0.052))
  ctx.font = `900 ${titleFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const titleLines = wrapText(ctx, title, panelWidth - size * 0.1)
  const titleLineHeight = Math.round(titleFontSize * 1.22)
  const titleStartY = panelY + size * 0.11
  renderCenteredText(ctx, titleLines, width / 2, titleStartY, titleLineHeight)

  ctx.fillStyle = '#4b5563'
  const bodyFontSize = Math.max(18, Math.round(size * 0.028))
  ctx.font = `600 ${bodyFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const bodyLineHeight = Math.round(bodyFontSize * 1.25)
  let nextY = titleStartY + (titleLines.length * titleLineHeight) + size * 0.02
  detailLines.forEach((line) => {
    const wrappedLines = wrapText(ctx, line, panelWidth - size * 0.12)
    wrappedLines.forEach((wrappedLine) => {
      ctx.fillText(wrappedLine, width / 2, nextY)
      nextY += bodyLineHeight
    })
    nextY += Math.round(size * 0.008)
  })
}

export async function renderBlogUploadImageDataUrl({
  imageUrl,
  headline,
  description,
  accentColor = '#6366f1',
  variant = 'circle',
}) {
  if (typeof document === 'undefined' || !imageUrl) return imageUrl

  const image = await loadImageElement(imageUrl)
  const width = image?.naturalWidth || image?.width || FALLBACK_SIZE
  const height = image?.naturalHeight || image?.height || FALLBACK_SIZE
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  drawCoverImage(ctx, image, width, height)

  if (variant === 'plain') {
    // Keep blog uploads aligned with the circle overlay variant currently used in the UI.
    drawBlogCircleOverlay(ctx, width, height, headline, description, accentColor)
  } else {
    drawBlogCircleOverlay(ctx, width, height, headline, description, accentColor)
  }

  return canvas.toDataURL('image/png')
}

export async function buildBlogUploadImageDataUrls({ blogImages = [], sections = [] }) {
  if (typeof document === 'undefined') {
    return (Array.isArray(blogImages) ? blogImages : []).map((image) => getImageUrl(image)).filter(Boolean)
  }

  const uploads = []

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index] || {}
    const image = findBlogImageSource(blogImages, section, index)
    const sourceUrl = getImageUrl(image)
    if (!sourceUrl) {
      uploads.push(null)
      continue
    }

    const keyPhrase = cleanCardText(image?.keyPhrase || section?.keyPhrase || '')
    const headingText = cleanCardText(section?.heading || '')
    const headline = deriveBlogHeadline(keyPhrase, headingText)
    const description = deriveBlogImageDescription(keyPhrase, headingText, section?.content || '')
    const accentColor = BLOG_ACCENT_COLORS[index % BLOG_ACCENT_COLORS.length] || '#6366f1'

    try {
      const renderedUrl = await renderBlogUploadImageDataUrl({
        imageUrl: sourceUrl,
        headline,
        description,
        accentColor,
        variant: 'circle',
      })
      uploads.push(renderedUrl)
    } catch (error) {
      console.warn(`[uploadImageComposite] Failed to render blog image ${index + 1}:`, error)
      uploads.push(sourceUrl)
    }
  }

  return uploads.filter(Boolean)
}

export async function renderInstagramUploadImageDataUrl({
  imageUrl,
  card,
  cardIndex,
  cardStyle = 'background-text',
}) {
  if (typeof document === 'undefined' || !imageUrl) return imageUrl

  const image = await loadImageElement(imageUrl)
  const width = image?.naturalWidth || image?.width || FALLBACK_SIZE
  const height = image?.naturalHeight || image?.height || FALLBACK_SIZE
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  drawCoverImage(ctx, image, width, height)

  const title = cleanCardText(card?.title || card?.heading || card?.headline || `인스타 카드 ${cardIndex + 1}`)
  const detailLines = deriveInstagramDetailLines(card).filter(Boolean)
  const layout = normalizeInstagramLayout(cardStyle)
  const cardNumber = card?.cardNumber || card?.card_number || cardIndex + 1

  if (layout === 'center-card') {
    drawInstagramCenterOverlay(ctx, width, height, cardNumber, title, detailLines)
  } else {
    drawInstagramBottomOverlay(ctx, width, height, cardNumber, title, detailLines)
  }

  return canvas.toDataURL('image/png')
}

export async function buildInstagramUploadImageUrls({
  instagramContent = {},
  instagramImages = [],
}) {
  const cards = Array.isArray(instagramContent?.cards || instagramContent?.cardTopics)
    ? (instagramContent.cards || instagramContent.cardTopics)
    : []

  if (!cards.length) {
    return (Array.isArray(instagramImages) ? instagramImages : []).map((image) => getImageUrl(image)).filter(Boolean)
  }

  const cardStyle = normalizeInstagramLayout(instagramContent?.cardStyle)
  const uploads = []

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    const image = findInstagramImageSource(instagramImages, card, index)
    const sourceUrl = getImageUrl(image)
    if (!sourceUrl) {
      uploads.push(null)
      continue
    }

    try {
      const renderedUrl = await renderInstagramUploadImageDataUrl({
        imageUrl: sourceUrl,
        card,
        cardIndex: index,
        cardStyle,
      })
      uploads.push(renderedUrl)
    } catch (error) {
      console.warn(`[uploadImageComposite] Failed to render instagram image ${index + 1}:`, error)
      uploads.push(sourceUrl)
    }
  }

  return uploads.filter(Boolean)
}

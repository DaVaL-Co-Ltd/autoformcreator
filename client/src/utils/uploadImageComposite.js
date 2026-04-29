import {
  cleanCardText,
  deriveBlogHeadline,
  deriveBlogImageDescription,
  wrapCardTextLines,
} from './contentImageOverlay'
import {
  buildInstagramDisplayCards,
  getInstagramCardNumber,
  getInstagramOverlayLines,
  getInstagramOverlayTitle,
  isInstagramCaptionCtaCard,
} from './instagramCarousel'

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

function buildWrappedParagraphs(ctx, lines, maxWidth) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => wrapText(ctx, line, maxWidth))
    .filter((wrapped) => wrapped.length > 0)
}

function getParagraphLineCount(paragraphs) {
  return paragraphs.reduce((total, paragraph) => total + paragraph.length, 0)
}

function measureInstagramBottomOverlay(ctx, size, title, detailLines, titleFontSize, bodyFontSize, panelWidth) {
  const titleMaxWidth = panelWidth - size * 0.09
  const topPadding = size * 0.07
  const bottomPadding = size * 0.06
  const titleBodyGap = size * 0.015
  const paragraphGap = Math.round(size * 0.006)

  ctx.font = `900 ${titleFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const titleLines = wrapText(ctx, title, titleMaxWidth)
  const titleLineHeight = Math.round(titleFontSize * 1.18)

  ctx.font = `600 ${bodyFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const detailParagraphs = buildWrappedParagraphs(ctx, detailLines, titleMaxWidth)
  const bodyLineHeight = Math.round(bodyFontSize * 1.28)
  const detailLineCount = getParagraphLineCount(detailParagraphs)
  const detailGapCount = detailParagraphs.length > 0 ? detailParagraphs.length - 1 : 0
  const detailHeight = detailLineCount > 0
    ? (detailLineCount * bodyLineHeight) + (detailGapCount * paragraphGap)
    : 0

  const requiredHeight =
    topPadding +
    (titleLines.length * titleLineHeight) +
    (detailHeight > 0 ? titleBodyGap + detailHeight : 0) +
    bottomPadding

  return {
    titleLines,
    titleLineHeight,
    detailParagraphs,
    bodyLineHeight,
    requiredHeight,
    titleMaxWidth,
    topPadding,
    titleBodyGap,
    paragraphGap,
  }
}

function fitInstagramBottomOverlay(ctx, size, title, detailLines, panelWidth) {
  const minTitleFontSize = Math.max(26, Math.round(size * 0.038))
  const minBodyFontSize = Math.max(16, Math.round(size * 0.022))
  const basePanelHeight = size * 0.34
  const maxPanelHeight = size * 0.54
  let titleFontSize = Math.max(32, Math.round(size * 0.047))
  let bodyFontSize = Math.max(18, Math.round(size * 0.026))
  let layout = measureInstagramBottomOverlay(ctx, size, title, detailLines, titleFontSize, bodyFontSize, panelWidth)

  while (
    layout.requiredHeight > maxPanelHeight &&
    (titleFontSize > minTitleFontSize || bodyFontSize > minBodyFontSize)
  ) {
    titleFontSize = Math.max(minTitleFontSize, titleFontSize - Math.max(1, Math.round(size * 0.003)))
    bodyFontSize = Math.max(minBodyFontSize, bodyFontSize - Math.max(1, Math.round(size * 0.0025)))
    layout = measureInstagramBottomOverlay(ctx, size, title, detailLines, titleFontSize, bodyFontSize, panelWidth)
  }

  return {
    ...layout,
    panelHeight: Math.max(basePanelHeight, Math.min(layout.requiredHeight, maxPanelHeight)),
    titleFontSize,
    bodyFontSize,
  }
}

function measureInstagramCenterOverlay(ctx, size, title, detailLines, titleFontSize, bodyFontSize, panelWidth) {
  const contentWidth = panelWidth - size * 0.1
  const bodyWidth = panelWidth - size * 0.12
  const badgeHeight = size * 0.043
  const badgeOffsetTop = size * 0.033
  const titleTopGap = size * 0.034
  const bodyTopGap = size * 0.02
  const paragraphGap = Math.round(size * 0.008)
  const bottomPadding = size * 0.05

  ctx.font = `900 ${titleFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const titleLines = wrapText(ctx, title, contentWidth)
  const titleLineHeight = Math.round(titleFontSize * 1.22)

  ctx.font = `600 ${bodyFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const detailParagraphs = buildWrappedParagraphs(ctx, detailLines, bodyWidth)
  const bodyLineHeight = Math.round(bodyFontSize * 1.25)
  const detailLineCount = getParagraphLineCount(detailParagraphs)
  const detailGapCount = detailParagraphs.length > 0 ? detailParagraphs.length - 1 : 0
  const detailHeight = detailLineCount > 0
    ? (detailLineCount * bodyLineHeight) + (detailGapCount * paragraphGap)
    : 0

  const titleStartOffset = badgeOffsetTop + badgeHeight + titleTopGap
  const requiredHeight =
    titleStartOffset +
    (titleLines.length * titleLineHeight) +
    (detailHeight > 0 ? bodyTopGap + detailHeight : 0) +
    bottomPadding

  return {
    titleLines,
    titleLineHeight,
    detailParagraphs,
    bodyLineHeight,
    requiredHeight,
    titleStartOffset,
    bodyTopGap,
    badgeOffsetTop,
    badgeHeight,
    paragraphGap,
  }
}

function fitInstagramCenterOverlay(ctx, size, title, detailLines, panelWidth) {
  const minTitleFontSize = Math.max(28, Math.round(size * 0.04))
  const minBodyFontSize = Math.max(16, Math.round(size * 0.022))
  const basePanelHeight = size * 0.46
  const maxPanelHeight = size * 0.66
  let titleFontSize = Math.max(34, Math.round(size * 0.052))
  let bodyFontSize = Math.max(18, Math.round(size * 0.028))
  let layout = measureInstagramCenterOverlay(ctx, size, title, detailLines, titleFontSize, bodyFontSize, panelWidth)

  while (
    layout.requiredHeight > maxPanelHeight &&
    (titleFontSize > minTitleFontSize || bodyFontSize > minBodyFontSize)
  ) {
    titleFontSize = Math.max(minTitleFontSize, titleFontSize - Math.max(1, Math.round(size * 0.0035)))
    bodyFontSize = Math.max(minBodyFontSize, bodyFontSize - Math.max(1, Math.round(size * 0.0025)))
    layout = measureInstagramCenterOverlay(ctx, size, title, detailLines, titleFontSize, bodyFontSize, panelWidth)
  }

  return {
    ...layout,
    panelHeight: Math.max(basePanelHeight, Math.min(layout.requiredHeight, maxPanelHeight)),
    titleFontSize,
    bodyFontSize,
  }
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
  if (isInstagramCaptionCtaCard(card)) {
    return list[list.length - 1] || list[0] || null
  }

  const cardNumber = getInstagramCardNumber(card, index)
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
  const fittedLayout = fitInstagramBottomOverlay(ctx, size, title, detailLines, panelWidth)
  const panelHeight = fittedLayout.panelHeight
  const panelX = (width - panelWidth) / 2
  const panelY = height - panelHeight - size * 0.065
  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, size * 0.028)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.90)'
  ctx.fill()

  const titleFontSize = fittedLayout.titleFontSize
  const bodyFontSize = fittedLayout.bodyFontSize
  const textX = panelX + size * 0.046
  ctx.fillStyle = '#1f2937'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `900 ${titleFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  let nextY = panelY + fittedLayout.topPadding
  fittedLayout.titleLines.forEach((line) => {
    ctx.fillText(line, textX, nextY)
    nextY += fittedLayout.titleLineHeight
  })

  ctx.fillStyle = '#4b5563'
  ctx.font = `600 ${bodyFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  if (fittedLayout.detailParagraphs.length > 0) {
    nextY += fittedLayout.titleBodyGap
  }
  fittedLayout.detailParagraphs.forEach((wrappedLines, paragraphIndex) => {
    wrappedLines.forEach((wrappedLine) => {
      ctx.fillText(wrappedLine, textX, nextY)
      nextY += fittedLayout.bodyLineHeight
    })
    if (paragraphIndex < fittedLayout.detailParagraphs.length - 1) {
      nextY += fittedLayout.paragraphGap
    }
  })
}

function drawInstagramCenterOverlay(ctx, width, height, cardNumber, title, detailLines) {
  const size = getBaseSize(width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)'
  ctx.fillRect(0, 0, width, height)

  const panelWidth = size * 0.7
  const fittedLayout = fitInstagramCenterOverlay(ctx, size, title, detailLines, panelWidth)
  const panelHeight = fittedLayout.panelHeight
  const panelX = (width - panelWidth) / 2
  const panelY = (height - panelHeight) / 2

  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, size * 0.033)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)'
  ctx.lineWidth = Math.max(2, Math.round(size * 0.002))
  ctx.stroke()

  const badgeWidth = size * 0.17
  const badgeHeight = fittedLayout.badgeHeight
  const badgeX = panelX + (panelWidth - badgeWidth) / 2
  const badgeY = panelY + fittedLayout.badgeOffsetTop
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
  const titleFontSize = fittedLayout.titleFontSize
  ctx.font = `900 ${titleFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  const titleStartY = panelY + fittedLayout.titleStartOffset
  renderCenteredText(ctx, fittedLayout.titleLines, width / 2, titleStartY, fittedLayout.titleLineHeight)

  ctx.fillStyle = '#4b5563'
  const bodyFontSize = fittedLayout.bodyFontSize
  ctx.font = `600 ${bodyFontSize}px Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`
  let nextY = titleStartY + (fittedLayout.titleLines.length * fittedLayout.titleLineHeight)
  if (fittedLayout.detailParagraphs.length > 0) {
    nextY += fittedLayout.bodyTopGap
  }
  fittedLayout.detailParagraphs.forEach((wrappedLines, paragraphIndex) => {
    wrappedLines.forEach((wrappedLine) => {
      ctx.fillText(wrappedLine, width / 2, nextY)
      nextY += fittedLayout.bodyLineHeight
    })
    if (paragraphIndex < fittedLayout.detailParagraphs.length - 1) {
      nextY += fittedLayout.paragraphGap
    }
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

  const title = getInstagramOverlayTitle(card, cardIndex)
  const detailLines = getInstagramOverlayLines(card)
  const layout = normalizeInstagramLayout(cardStyle)
  const cardNumber = getInstagramCardNumber(card, cardIndex)

  if (layout === 'center-card' || isInstagramCaptionCtaCard(card)) {
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
  const cards = buildInstagramDisplayCards(instagramContent)

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

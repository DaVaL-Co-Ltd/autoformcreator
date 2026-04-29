import {
  cleanCardText as sharedCleanCardText,
  deriveInstagramDetailLines as sharedDeriveInstagramDetailLines,
} from './contentImageOverlay'
import { buildInstagramUploadImageUrls } from './uploadImageComposite'

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

const INSTAGRAM_CAPTION_MAX_LENGTH = 2200
const CARD_CAPTION_ICONS = ['📌', '📊', '💡', '✅', '🔎', '🧭', '✨', '📍', '📝', '🚀']
const INSTAGRAM_CAPTION_LIST_THRESHOLD = 7
const INSTAGRAM_CAPTION_FORCE_ALL_THRESHOLD = 10

function deriveInstagramDetailLines(card) {
  return sharedDeriveInstagramDetailLines(card)
}

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
  return image?.imageUrl || image?.url || image?.renderedImageUrl || image?.pngUrl || null
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

function buildCardCaptionLine(card = {}, index = 0, options = {}) {
  const { cardNumber, headline, detail } = getCardCaptionParts(card, index)
  const {
    titleMax = 26,
    bodyMax = 58,
    includeIcon = true,
  } = options
  const icon = includeIcon ? `${CARD_CAPTION_ICONS[index % CARD_CAPTION_ICONS.length]} ` : ''
  const title = truncateText(headline, titleMax)
  const body = truncateText(detail, bodyMax)

  if (title && body && title !== body) return `${icon}${cardNumber}. ${title}: ${body}`
  if (title || body) return `${icon}${cardNumber}. ${title || body}`
  return ''
}

function buildInstagramCaptionIntro(baseCaption = '', maxLength = 420) {
  if (maxLength <= 0) return ''
  const paragraphs = String(baseCaption || '')
    .split(/\n{2,}|\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const intro = paragraphs.slice(0, 2).join('\n')
  return intro.length <= maxLength ? intro : `${intro.slice(0, maxLength - 1).trim()}…`
}

function buildFullCardCaption(instagramContent = {}, cards = []) {
  const baseCaption = String(instagramContent?.caption || instagramContent?.body || instagramContent?.title || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
  const heading = cards.length >= INSTAGRAM_CAPTION_FORCE_ALL_THRESHOLD ? '카드별 핵심 전체' : '카드별 핵심'

  const profiles = cards.length >= INSTAGRAM_CAPTION_FORCE_ALL_THRESHOLD
    ? [
        { introMax: 280, titleMax: 18, bodyMax: 28, includeIcon: true },
        { introMax: 180, titleMax: 16, bodyMax: 22, includeIcon: false },
        { introMax: 100, titleMax: 14, bodyMax: 16, includeIcon: false },
        { introMax: 0, titleMax: 12, bodyMax: 10, includeIcon: false },
      ]
    : [
        { introMax: 420, titleMax: 24, bodyMax: 42, includeIcon: true },
        { introMax: 280, titleMax: 20, bodyMax: 30, includeIcon: true },
        { introMax: 180, titleMax: 18, bodyMax: 22, includeIcon: false },
        { introMax: 0, titleMax: 14, bodyMax: 14, includeIcon: false },
      ]

  for (const profile of profiles) {
    const intro = buildInstagramCaptionIntro(baseCaption, profile.introMax)
    const lines = cards
      .map((card, index) => buildCardCaptionLine(card, index, profile))
      .filter(Boolean)
    const cardBlock = [heading, ...lines].join('\n')
    const separator = intro ? '\n\n' : ''
    const nextCaption = `${intro}${separator}${cardBlock}`.trim()
    if (nextCaption.length <= INSTAGRAM_CAPTION_MAX_LENGTH) return nextCaption
  }

  const minimalLines = cards.map((card, index) => {
    const { cardNumber, headline, detail } = getCardCaptionParts(card, index)
    const text = truncateText(headline || detail, 10)
    return `${cardNumber}. ${text}`
  })

  return [heading, ...minimalLines].join('\n').slice(0, INSTAGRAM_CAPTION_MAX_LENGTH).trim()
}

export function buildInstagramCaption(instagramContent = {}) {
  const cards = ensureArray(instagramContent?.cards || instagramContent?.cardTopics)
  const baseCaption = String(instagramContent?.caption || instagramContent?.body || instagramContent?.title || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
  if (!cards.length) return baseCaption.slice(0, INSTAGRAM_CAPTION_MAX_LENGTH)

  if (cards.length >= INSTAGRAM_CAPTION_LIST_THRESHOLD) {
    return buildFullCardCaption(instagramContent, cards)
  }

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
  const { instagramContent, cards, rawImages } = getCardSource(source)

  if (cards.length === 0 || rawImages.length === 0 || typeof document === 'undefined') {
    return baseContent
  }

  const imageUrls = await buildInstagramUploadImageUrls({
    instagramContent,
    instagramImages: rawImages,
  })

  return {
    ...baseContent,
    imageUrls: imageUrls.length > 0 ? imageUrls : baseContent.imageUrls,
  }
}

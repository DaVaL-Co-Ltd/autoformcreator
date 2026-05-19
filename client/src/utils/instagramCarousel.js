import { cleanCardText, deriveInstagramDetailLines } from './contentImageOverlay'

const CTA_TITLE = '자세한 내용은'
const CTA_LINE = '캡션 확인해주세요.'

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function truncateText(value = '', maxLength = 26) {
  const text = cleanCardText(value)
  if (text.length <= maxLength) return text

  const words = text.split(/\s+/).filter(Boolean)
  let output = ''
  for (const word of words) {
    const next = output ? `${output} ${word}` : word
    if (next.length > maxLength && output) break
    output = next
    if (next.length >= maxLength) break
  }

  return (output || text.slice(0, maxLength)).trim()
}

export function getInstagramBaseCards(instagramContent = {}) {
  return ensureArray(instagramContent?.cards || instagramContent?.cardTopics)
}

export function buildInstagramCaptionCtaCard(cards = []) {
  return {
    cardNumber: cards.length + 1,
    title: CTA_TITLE,
    headline: CTA_TITLE,
    content: CTA_LINE,
    dataPoint: CTA_LINE,
    kicker: 'CAPTION',
    isCaptionCta: true,
  }
}

export function buildInstagramDisplayCards(instagramContent = {}) {
  const cards = getInstagramBaseCards(instagramContent)
  if (!cards.length) return []
  return [...cards, buildInstagramCaptionCtaCard(cards)]
}

export function isInstagramCaptionCtaCard(card = {}) {
  return Boolean(card?.isCaptionCta)
}

export function getInstagramCardNumber(card = {}, index = 0) {
  return Number(card?.cardNumber || card?.card_number) || index + 1
}

export function getInstagramOverlayTitle(card = {}, index = 0) {
  if (isInstagramCaptionCtaCard(card)) return CTA_TITLE
  return truncateText(
    card?.title || card?.heading || card?.headline || `카드 ${getInstagramCardNumber(card, index)}`,
    18,
  )
}

export function buildInstagramKnowledgeBullets(card = {}) {
  if (Array.isArray(card?.bullets) && card.bullets.length > 0) {
    return card.bullets.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 4)
  }
  const collected = []
  const pushUnique = (value) => {
    const trimmed = String(value || '').trim()
    if (!trimmed) return
    if (collected.includes(trimmed)) return
    collected.push(trimmed)
  }
  pushUnique(card?.dataPoint)
  String(card?.content || '')
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .forEach((piece) => pushUnique(piece))
  pushUnique(card?.subtitle)
  pushUnique(card?.summary)
  return collected.slice(0, 4)
}

export function getInstagramOverlayLines(card = {}) {
  if (isInstagramCaptionCtaCard(card)) return [CTA_LINE]

  const candidates = [
    card?.dataPoint,
    ...deriveInstagramDetailLines(card),
    card?.content,
    card?.subtitle,
  ]
    .map((value) => cleanCardText(value))
    .filter(Boolean)

  const uniqueLines = []
  for (const candidate of candidates) {
    const truncated = truncateText(candidate, 18)
    if (!truncated) continue
    if (uniqueLines.includes(truncated)) continue
    uniqueLines.push(truncated)
    if (uniqueLines.length >= 1) break
  }

  return uniqueLines
}

const EMPTY_TEXT = ''

const asText = (value) => {
  if (value === null || value === undefined) return EMPTY_TEXT
  return String(value)
}

export const cleanCardText = (value) => asText(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/[#*_`~>|[\](){}]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export const truncateCardText = (value, maxLength = 40) => {
  const text = cleanCardText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`
}

export const deriveBlogHeadline = (keyPhrase, heading) => {
  const source = cleanCardText(keyPhrase) || cleanCardText(heading)
  return truncateCardText(source, 24)
}

export const deriveBlogImageDescription = (keyPhrase, heading, content) => {
  const primary = cleanCardText(keyPhrase)
  const secondary = cleanCardText(heading)
  const body = cleanCardText(content)

  if (primary && secondary && primary !== secondary) {
    return `${primary} - ${secondary}`
  }

  return primary || secondary || body
}

export const deriveInstagramDetailLines = (card = {}) => {
  const candidates = [
    card.subtitle,
    card.summary,
    card.description,
    card.body,
    card.content,
    card.text,
  ]

  return candidates
    .flatMap((value) => cleanCardText(value).split(/(?:\n| {2,})/))
    .map((line) => truncateCardText(line, 36))
    .filter(Boolean)
    .slice(0, 3)
}

export const normalizeInstagramCardStyle = (style = {}) => {
  if (!style || typeof style !== 'object') {
    return {
      accentColor: '#ec4899',
      backgroundColor: '#fff7fb',
      textColor: '#111827',
    }
  }

  return {
    accentColor: style.accentColor || style.accent || style.primaryColor || '#ec4899',
    backgroundColor: style.backgroundColor || style.background || '#fff7fb',
    textColor: style.textColor || style.foreground || '#111827',
  }
}

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

export const IMAGE_TEXT_WRAP_STYLE = {
  wordBreak: 'keep-all',
  overflowWrap: 'break-word',
  textWrap: 'balance',
}

export const BLOG_IMAGE_FONT_PRESETS = {
  pretendard: {
    family: 'Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif',
    weight: 900,
  },
  knowledge: {
    family: "'SBAggro', 'Pretendard', Apple SD Gothic Neo, Malgun Gothic, sans-serif",
    weight: 900,
  },
  bold: {
    family: 'A2z, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif',
    weight: 700,
  },
  dongle: {
    family: 'TmoneyRoundWind, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif',
    weight: 800,
  },
  handwriting: {
    family: 'Maplestory, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif',
    weight: 700,
  },
  gothic: {
    family: 'KBODiaGothic, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif',
    weight: 700,
  },
}

export const getBlogImageFontPreset = (value = 'pretendard') => (
  BLOG_IMAGE_FONT_PRESETS[value] || BLOG_IMAGE_FONT_PRESETS.pretendard
)

const BLOG_HEADLINE_MAX_LENGTH = 28
const BLOG_DESCRIPTION_MAX_LENGTH = 34
const BLOG_TITLE_KEYWORD_MAX_LENGTH = 22
const VALUE_TOKEN_PATTERN = /(?:[$]\s?\d|\d[\d,]*(?:\.\d+)?\s?%)/
const WEAK_BLOG_KEYPHRASES = new Set([
  '중요성',
  '핵심내용',
  '핵심',
  '변화',
  '활용',
  '전망',
  '필요성',
  '효과',
  '의미',
  '개요',
])

const trimCardTitleEnding = (value = '') => (
  asText(value).replace(/[\s,.:;!?/\\]+$/g, '').trim()
)

const escapeRegExp = (value = '') => (
  asText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
)

const limitBlogOverlayText = (value = '', maxLength = BLOG_DESCRIPTION_MAX_LENGTH) => {
  const clean = trimCardTitleEnding(cleanCardText(value))
  if (!clean || clean.length <= maxLength) return clean

  const tokens = clean.split(/\s+/).filter(Boolean)
  let limited = ''

  for (const token of tokens) {
    const next = limited ? `${limited} ${token}` : token
    if (next.length > maxLength && limited) break
    limited = next
    if (next.length >= maxLength) break
  }

  return trimCardTitleEnding(limited || clean)
}

const normalizeBlogKeyword = (value = '') => (
  trimCardTitleEnding(cleanCardText(value)).replace(/\s+/g, '').toLowerCase()
)

const deriveHeadingKeywordFallback = (heading = '') => {
  const cleanHeading = trimCardTitleEnding(cleanCardText(heading))
  if (!cleanHeading) return ''

  let candidate = cleanHeading
    .split(/[:\-–—,/]/)[0]
    .replace(/(입니다|합니다|됩니다|있습니다|해야 합니다|할 수 있습니다|하는 방법)$/u, '')
    .trim()

  const tokens = candidate.split(/\s+/).filter(Boolean)
  if (tokens.length > 3) {
    candidate = tokens.slice(0, 3).join(' ')
  }

  return limitBlogOverlayText(candidate || cleanHeading, BLOG_HEADLINE_MAX_LENGTH)
}

const isWeakBlogKeyPhrase = (keyPhrase = '', heading = '') => {
  const clean = trimCardTitleEnding(cleanCardText(keyPhrase))
  if (!clean) return true
  if (clean.length > 16) return true
  if (clean.split(/\s+/).filter(Boolean).length > 4) return true
  if (/[.!?]/.test(clean)) return true
  if (/(입니다|합니다|됩니다|있습니다|할 수|하는 방법)$/u.test(clean)) return true

  const normalized = normalizeBlogKeyword(clean)
  if (WEAK_BLOG_KEYPHRASES.has(normalized)) return true

  const normalizedHeading = normalizeBlogKeyword(heading)
  if (normalizedHeading && normalized === normalizedHeading) return true

  return false
}

const getHeadingRemainder = (heading = '', headline = '') => {
  const cleanHeading = trimCardTitleEnding(cleanCardText(heading))
  const cleanHeadline = trimCardTitleEnding(cleanCardText(headline))
  if (!cleanHeading || !cleanHeadline || cleanHeading === cleanHeadline) return ''

  const remainder = cleanHeading
    .replace(new RegExp(`^${escapeRegExp(cleanHeadline)}(은|는|이|가|을|를|와|과|도)?\\s*`), '')
    .trim()

  return remainder && remainder !== cleanHeading ? trimCardTitleEnding(remainder) : ''
}

const pickRepresentativeContentPhrase = (content = '') => {
  const clean = trimCardTitleEnding(cleanCardText(content))
  if (!clean) return ''

  const candidates = clean
    .split(/(?<=[.!?。！？])\s+|\n+| {2,}/)
    .map((line) => trimCardTitleEnding(line))
    .filter(Boolean)

  const source = candidates.find((line) => line.length <= BLOG_DESCRIPTION_MAX_LENGTH) || candidates[0] || clean
  return limitBlogOverlayText(source, BLOG_DESCRIPTION_MAX_LENGTH)
}

const shouldPreserveValueToken = (word = '') => VALUE_TOKEN_PATTERN.test(word)

const splitOversizedWord = (word, measureTextWidth, maxWidth) => {
  if (measureTextWidth(word) <= maxWidth) return [word]
  if (shouldPreserveValueToken(word)) return [word]

  const chunks = []
  let chunk = ''

  for (const char of word) {
    const nextChunk = chunk + char
    if (measureTextWidth(nextChunk) <= maxWidth || !chunk) {
      chunk = nextChunk
      continue
    }

    chunks.push(chunk)
    chunk = char
  }

  if (chunk) chunks.push(chunk)
  return chunks
}

const getLineWidth = (words, start, end, measureTextWidth) => (
  measureTextWidth(words.slice(start, end).join(' '))
)

const findBalancedLines = (words, lineCount, measureTextWidth, maxWidth) => {
  const totalWidth = measureTextWidth(words.join(' '))
  const idealWidth = totalWidth / lineCount
  const memo = new Map()

  const solve = (start, remainingLines) => {
    const key = `${start}:${remainingLines}`
    if (memo.has(key)) return memo.get(key)

    const wordsLeft = words.length - start
    if (remainingLines === 1) {
      const width = getLineWidth(words, start, words.length, measureTextWidth)
      const result = width <= maxWidth
        ? { score: Math.abs(width - idealWidth), lines: [words.slice(start).join(' ')] }
        : null
      memo.set(key, result)
      return result
    }

    if (wordsLeft < remainingLines) {
      memo.set(key, null)
      return null
    }

    let best = null
    const maxEnd = words.length - remainingLines + 1

    for (let end = start + 1; end <= maxEnd; end += 1) {
      const width = getLineWidth(words, start, end, measureTextWidth)
      if (width > maxWidth) break

      const rest = solve(end, remainingLines - 1)
      if (!rest) continue

      const score = Math.abs(width - idealWidth) + rest.score
      if (!best || score < best.score) {
        best = {
          score,
          lines: [words.slice(start, end).join(' '), ...rest.lines],
        }
      }
    }

    memo.set(key, best)
    return best
  }

  return solve(0, lineCount)?.lines || null
}

const findPreferredBalancedLines = (words, fallbackLineCount, measureTextWidth, maxWidth) => {
  if (measureTextWidth(words.join(' ')) <= maxWidth) return [words.join(' ')]

  const twoLineResult = findBalancedLines(words, 2, measureTextWidth, maxWidth)
  if (twoLineResult) return twoLineResult

  const threeLineResult = findBalancedLines(words, 3, measureTextWidth, maxWidth)
  if (threeLineResult) return threeLineResult

  return findBalancedLines(words, fallbackLineCount, measureTextWidth, maxWidth)
}

export const wrapCardTextLines = (value, measureTextWidth, maxWidth, options = {}) => {
  const { splitLongWords = true } = options
  const words = cleanCardText(value)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitLongWords ? splitOversizedWord(word, measureTextWidth, maxWidth) : word)

  if (!words.length) return []

  const lines = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (measureTextWidth(nextLine) <= maxWidth || !currentLine) {
      currentLine = nextLine
      continue
    }

    lines.push(currentLine)
    currentLine = word
  }

  if (currentLine) lines.push(currentLine)

  return findPreferredBalancedLines(words, lines.length, measureTextWidth, maxWidth) || lines
}

export const deriveBlogHeadline = (keyPhrase, heading) => {
  const preferredKeyPhrase = cleanCardText(keyPhrase)
  const source = preferredKeyPhrase
    || (isWeakBlogKeyPhrase(keyPhrase, heading)
      ? deriveHeadingKeywordFallback(heading)
      : deriveHeadingKeywordFallback(heading))

  return limitBlogOverlayText(source, BLOG_HEADLINE_MAX_LENGTH)
}

export const deriveBlogTitleKeywordHeadline = (title = '') => {
  const cleanTitle = trimCardTitleEnding(cleanCardText(title))
  if (!cleanTitle) return ''

  const primaryChunk = cleanTitle
    .split(/[:|·•,/\\-]/)
    .map((chunk) => trimCardTitleEnding(chunk))
    .find(Boolean) || cleanTitle

  const preferredTokens = primaryChunk
    .split(/\s+/)
    .map((token) => trimCardTitleEnding(token))
    .filter(Boolean)
    .filter((token) => token.length > 1 || /[A-Za-z0-9]/.test(token))

  let keywordText = ''
  for (const token of preferredTokens) {
    const next = keywordText ? `${keywordText} ${token}` : token
    if (next.length > BLOG_TITLE_KEYWORD_MAX_LENGTH && keywordText) break
    keywordText = next
    if (keywordText.length >= BLOG_TITLE_KEYWORD_MAX_LENGTH) break
  }

  return limitBlogOverlayText(
    keywordText || primaryChunk,
    BLOG_TITLE_KEYWORD_MAX_LENGTH,
  )
}

const CLOSING_SECTION_PATTERNS = [
  /(^|\s)마무리($|\s|하며|하기|하면서)/,
  /^생각해\s?봅시다$/,
  /^열린\s?마무리/,
  /^맺음말/,
  /^닫는\s?글/,
  /^끝맺음/,
  /^마지막으로/,
]

export function isClosingBlogSection(heading = '') {
  const clean = String(heading || '').replace(/[\s,.:;!?/\\]+$/g, '').trim()
  if (!clean) return false
  return CLOSING_SECTION_PATTERNS.some((re) => re.test(clean))
}

export const deriveBlogImageDescription = (keyPhrase, heading, content) => {
  const subtitle = cleanCardText(heading)
    || getHeadingRemainder(heading, deriveBlogHeadline(keyPhrase, heading))
    || cleanCardText(keyPhrase)
    || pickRepresentativeContentPhrase(content)

  return limitBlogOverlayText(subtitle, BLOG_DESCRIPTION_MAX_LENGTH)
}

const BLOG_SUPPLEMENT_MAX_LENGTH = 18
const SUPPLEMENT_STOPWORDS = new Set([
  '그리고', '하지만', '그러나', '또한', '또는', '예를', '들어', '이것', '저것', '그것',
  '이번', '저번', '한번', '바로', '대해', '대한', '관련', '있는', '있다', '있습니다',
  '합니다', '됩니다', '같은', '같이', '많은', '많이', '여러', '다양한', '주요', '핵심',
])

const isMeaningfulNounToken = (token = '') => {
  if (!token) return false
  if (token.length < 2 || token.length > 8) return false
  if (SUPPLEMENT_STOPWORDS.has(token)) return false
  if (/^[0-9.,]+$/.test(token)) return false
  if (!/[가-힣A-Za-z]/.test(token)) return false
  return true
}

const extractSupplementKeywordsFromText = (text = '', exclude = '') => {
  const excludeNormalized = normalizeBlogKeyword(exclude)
  const tokens = cleanCardText(text)
    .replace(/[()[\]{}"'`~!@#$%^&*+=|\\<>?]/g, ' ')
    .split(/[\s,./:;]+/)
    .map((token) => trimCardTitleEnding(token))
    .filter((token) => isMeaningfulNounToken(token))
    .filter((token) => {
      const normalized = normalizeBlogKeyword(token)
      if (!normalized) return false
      if (excludeNormalized && excludeNormalized.includes(normalized)) return false
      if (excludeNormalized && normalized.includes(excludeNormalized)) return false
      return true
    })

  const seen = new Set()
  const unique = []
  for (const token of tokens) {
    const normalized = normalizeBlogKeyword(token)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    unique.push(token)
    if (unique.length >= 2) break
  }
  return unique
}

export const deriveBlogImageSupplement = (keyPhrase, heading, content) => {
  const headline = deriveBlogHeadline(keyPhrase, heading)
  const remainder = getHeadingRemainder(heading, headline)
  if (remainder && remainder.length <= BLOG_SUPPLEMENT_MAX_LENGTH) {
    return remainder
  }

  const sources = [keyPhrase, heading, content].map((value) => cleanCardText(value)).filter(Boolean)
  for (const source of sources) {
    const keywords = extractSupplementKeywordsFromText(source, headline)
    if (keywords.length) {
      const joined = keywords.join(' · ')
      return limitBlogOverlayText(joined, BLOG_SUPPLEMENT_MAX_LENGTH)
    }
  }

  return ''
}

export const deriveInstagramDetailLines = (card = {}) => {
  const candidates = [
    card.subtitle,
    card.summary,
    card.description,
    card.body,
    card.content,
    card.dataPoint,
    card.text,
  ]

  return candidates
    .flatMap((value) => cleanCardText(value).split(/(?<=[.!?。！？])\s+|\n+| {2,}/))
    .filter(Boolean)
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

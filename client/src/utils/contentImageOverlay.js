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

const splitOversizedWord = (word, measureTextWidth, maxWidth) => {
  if (measureTextWidth(word) <= maxWidth) return [word]

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

export const wrapCardTextLines = (value, measureTextWidth, maxWidth) => {
  const words = cleanCardText(value)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => splitOversizedWord(word, measureTextWidth, maxWidth))

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

  return findBalancedLines(words, lines.length, measureTextWidth, maxWidth) || lines
}

export const deriveBlogHeadline = (keyPhrase, heading) => {
  const source = cleanCardText(keyPhrase) || cleanCardText(heading)
  return source
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

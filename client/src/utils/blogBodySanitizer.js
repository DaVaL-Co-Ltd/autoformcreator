function stripBlogRawHtmlFormatting(raw = '') {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:p|div|section|article|li|ul|ol|blockquote|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/?(?:del|s|strike|em|i|u|ins|mark|small|sub|sup)[^>]*>/gi, '')
    .replace(/<\/?[^>]+>/g, '')
}

export function stripBlogAutoFormatMarkers(raw = '') {
  return stripBlogRawHtmlFormatting(raw)
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/--([^-\n]+)--/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\s][^_]*[^_\s])_/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*[^*\s])\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~/g, '')
}

const EXPLICIT_LABELS = [
  '예시',
  '준비물',
  '활동 방법',
  '미션',
  '생각해 봅시다',
  '학습 포인트',
  '강의 일시',
  '라이브 강의 시간',
  '영상 송출 시간',
  '강사 소개',
  '강의 내용',
  '참여 기대 효과',
]

const FORCE_BLOCK_LABELS = new Set([
  '예시',
  '준비물',
  '활동 방법',
  '미션',
  '생각해 봅시다',
  '학습 포인트',
])

const SENTENCE_BREAK_LABELS = new Set([
  '강의 일시',
  '라이브 강의 시간',
  '영상 송출 시간',
  '강사 소개',
  '강의 내용',
  '참여 기대 효과',
])

const INLINE_ORDINAL_MARKER_RE = /(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째:/gu
const KEYCAP_NUMBER_MARKER_RE = /[1-9]\uFE0F?\u20E3/gu
const ARABIC_LIST_MARKER_RE = /(?:^|[\s([])\d{1,2}[.)](?=\s*\S)/gu
const SYMBOL_LIST_MARKER_RE = /[✔✅☑✓📌🔹▪▫•◦◾◽➡➤👉](?=\s*\S)/gu
const SENTENCE_BREAK_RE = /(?:[.!?]|니다|어요|아요|습니다|됐다|된다|했다|한다)\s+[가-힣A-Za-z]/u
const COMMA_SPLIT_RE = /\s*,\s*/u
const BROKEN_EXPR_END_RE = /[+\-×x*\/=]\s*$/u
const BROKEN_EXPR_START_RE = /^\s*[)\]]/u

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const LABEL_ALTERNATION = EXPLICIT_LABELS
  .slice()
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|')

const INLINE_LABEL_RE = new RegExp(`(?:^|\\s)(${LABEL_ALTERNATION}):(?!//)`, 'gu')
const LINE_START_LABEL_RE = new RegExp(`^(\\s*)(${LABEL_ALTERNATION}):\\s*(.+)$`, 'u')

function normalizeInlineSpaces(text = '') {
  return String(text || '')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function reflowBrokenExpressions(raw = '') {
  const lines = String(raw || '').split('\n')
  const merged = []

  for (const current of lines) {
    const prev = merged.length ? merged[merged.length - 1] : null
    if (
      prev !== null &&
      (BROKEN_EXPR_END_RE.test(prev) || (current && BROKEN_EXPR_START_RE.test(current)))
    ) {
      merged[merged.length - 1] = `${prev.replace(/\s+$/, '')} ${current.replace(/^\s+/, '')}`.trim()
      continue
    }
    merged.push(current)
  }

  return merged.join('\n')
}

function countMatches(regex, text = '') {
  return [...String(text || '').matchAll(regex)].length
}

function splitBeforeRepeatedMarkers(text = '', regex) {
  if (countMatches(regex, text) < 2) return text
  const source = regex.source
  const flags = regex.flags.replace(/g/g, '')
  const splitter = new RegExp(`(\\S)\\s+(${source})(?=\\s*\\S)`, `${flags}g`)
  return text.replace(splitter, '$1\n$2')
}

function splitInlineListMarkers(text = '') {
  let next = String(text || '')
  next = splitBeforeRepeatedMarkers(next, INLINE_ORDINAL_MARKER_RE)
  next = splitBeforeRepeatedMarkers(next, KEYCAP_NUMBER_MARKER_RE)
  next = splitBeforeRepeatedMarkers(next, ARABIC_LIST_MARKER_RE)
  next = splitBeforeRepeatedMarkers(next, SYMBOL_LIST_MARKER_RE)
  return next
}

function shouldBreakAfterColon(label, body = '') {
  const normalizedBody = normalizeInlineSpaces(body)
  if (!normalizedBody) return false

  if (FORCE_BLOCK_LABELS.has(label)) return true
  if (SENTENCE_BREAK_LABELS.has(label)) return true

  if (
    countMatches(INLINE_ORDINAL_MARKER_RE, normalizedBody) >= 2 ||
    countMatches(KEYCAP_NUMBER_MARKER_RE, normalizedBody) >= 2 ||
    countMatches(ARABIC_LIST_MARKER_RE, normalizedBody) >= 2 ||
    countMatches(SYMBOL_LIST_MARKER_RE, normalizedBody) >= 2
  ) {
    return true
  }

  if (SENTENCE_BREAK_RE.test(normalizedBody)) return true

  const commaItems = normalizedBody
    .split(COMMA_SPLIT_RE)
    .map((item) => item.trim())
    .filter(Boolean)

  if (commaItems.length >= 3) return true

  return normalizedBody.length > 36
}

function applyItemsSplitRule(line = '') {
  const match = String(line || '').match(LINE_START_LABEL_RE)
  if (!match) return line

  const [, indent, label, restRaw] = match
  const rest = splitInlineListMarkers(normalizeInlineSpaces(restRaw))

  if (!shouldBreakAfterColon(label, rest)) {
    return `${indent}${label}: ${rest}`
  }

  return `${indent}${label}:\n${rest}`
}

function findExplicitLabelStarts(line = '') {
  return [...String(line || '').matchAll(INLINE_LABEL_RE)].map((match) => {
    const leadingSpace = match[0].length - match[0].trimStart().length
    return match.index + leadingSpace
  })
}

export function splitNumberedListItems(raw = '') {
  return String(raw || '')
    .split('\n')
    .map((line) => splitInlineListMarkers(line))
    .join('\n')
}

export function splitLabeledLines(raw = '') {
  const reflowed = reflowBrokenExpressions(raw)
  const lines = reflowed.split('\n')

  return lines.map((line) => {
    if (!line || !line.includes(':')) return line
    if (line.trim().endsWith(':')) return line

    const labelStarts = findExplicitLabelStarts(line)
    if (labelStarts.length === 0) return line

    const uniqueStarts = [...new Set(labelStarts)].sort((a, b) => a - b)
    const needsSplit = uniqueStarts.length >= 2 || uniqueStarts[0] > 0
    if (!needsSplit) {
      return applyItemsSplitRule(line)
    }

    const pieces = []
    let prev = 0

    if (uniqueStarts[0] > 0) {
      const preamble = line.slice(0, uniqueStarts[0]).replace(/\s+$/, '')
      if (preamble) pieces.push(preamble)
      prev = uniqueStarts[0]
    }

    for (let i = 1; i < uniqueStarts.length; i += 1) {
      pieces.push(line.slice(prev, uniqueStarts[i]).replace(/\s+$/, ''))
      prev = uniqueStarts[i]
    }
    pieces.push(line.slice(prev))

    return pieces
      .filter(Boolean)
      .map((piece) => applyItemsSplitRule(piece))
      .join('\n')
  }).join('\n')
}

export function sanitizeBlogBodyForDisplay(raw = '') {
  return splitLabeledLines(splitNumberedListItems(stripBlogAutoFormatMarkers(raw)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function sanitizeBlogBodyForUpload(raw = '') {
  return splitLabeledLines(splitNumberedListItems(stripBlogAutoFormatMarkers(raw)))
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 입시 및 학습 전략(글 위주) 카테고리에서 문장 단위로 빈 줄을 넣어 가독성을 높인다.
export function splitSentencesForBlogProse(raw = '') {
  return String(raw || '')
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed) return []
      return trimmed
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
    })
    .join('\n\n')
}

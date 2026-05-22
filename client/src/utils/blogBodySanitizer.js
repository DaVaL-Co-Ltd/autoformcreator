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

// 날짜 토큰("2026. 04. 14.", "3. 24.(화)") 내부의 공백을 제거한다.
// 월·일 숫자("04.", "24.")가 번호 매기기 리스트 마커(ARABIC_LIST_MARKER_RE)로
// 오인되어 줄바꿈으로 토막나는 것을 막는다. 공백을 없애면 마침표 앞이 숫자가 되어
// 리스트 마커 패턴(앞이 공백/괄호여야 함)에 더 이상 걸리지 않는다.
export function normalizeDateTokens(raw = '') {
  return String(raw || '')
    // "YYYY. MM. DD." → "YYYY.MM.DD."
    .replace(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\./g, '$1.$2.$3.')
    // "MM. DD.(요일)" → "MM.DD.(요일)" — 요일 표기가 뒤따르는 날짜만 대상으로 안전하게 처리
    .replace(/(?<![\d.])(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(?=\()/g, '$1.$2.')
}

// 줄 맨 앞 불릿 기호(체크마크·점 등 + 하이픈) 판별용.
const BULLET_LINE_PREFIX_RE = /^[✔✅☑✓📌🔹▪▫•◦◾◽➡➤👉-]\s/u

// "한글단어:" 형태의 라벨 콜론 패턴. 한 줄에 몇 개 들어있는지 세어
// 그 줄이 다중 라벨 목록(하위 목록)인지 판별하는 데 쓴다.
const INLINE_LABEL_COLON_RE = /[가-힣][가-힣\d·/]*:/g

function countInlineLabelColons(text = '') {
  return (String(text || '').match(INLINE_LABEL_COLON_RE) || []).length
}

// "✔ 인문계열:" 처럼 불릿 + 라벨 + 콜론만 있는 줄은, 바로 다음 줄의 설명을 끌어올려
// 한 줄로 합친다. Gemini 가 불릿 항목마다 콜론 뒤 줄바꿈을 들쭉날쭉 넣어 같은 목록의
// 항목들이 어떤 건 한 줄, 어떤 건 두 줄로 갈리는 문제를 통일한다.
// 불릿이 없는 일반 "항목:" 라벨(예: "강의 일시:")은 대상이 아니므로 다음 줄 내용을 유지한다.
// 다음 줄이 "국어: ... 수학: ..."처럼 다중 라벨 목록이면 헤더로 보고 합치지 않는다.
export function reflowBulletLabelLines(raw = '') {
  const lines = String(raw || '').split('\n')
  const out = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    const isBulletLabelOnly = BULLET_LINE_PREFIX_RE.test(trimmed) && trimmed.endsWith(':')

    if (isBulletLabelOnly) {
      const nextLine = lines[index + 1]
      const nextTrimmed = (nextLine || '').trim()
      // 다음 줄에 내용이 있고, 또 다른 불릿 항목이 아니며,
      // 다중 라벨 목록(라벨 콜론 2개 이상)이 아닐 때만 끌어올려 합친다.
      if (
        nextTrimmed &&
        !BULLET_LINE_PREFIX_RE.test(nextTrimmed) &&
        countInlineLabelColons(nextTrimmed) < 2
      ) {
        out.push(`${line.replace(/\s+$/, '')} ${nextTrimmed}`)
        index += 1
        continue
      }
    }

    out.push(line)
  }

  return out.join('\n')
}

// 마크다운 표 구분행 셀("---", ":-", ": -", ":---:" 등) 판별. 콜론·하이픈·공백만으로 이뤄진다.
function isTableSeparatorCell(cell = '') {
  const value = String(cell || '').trim()
  return value.length > 0 && /^[:\s-]+$/u.test(value) && /[:-]/u.test(value)
}

// 표 행 후보 줄: 파이프로 시작하거나 파이프가 4개 이상이면 마크다운 표의 일부로 본다.
function isTableRowCandidate(line = '') {
  const trimmed = String(line || '').trim()
  if (!trimmed.includes('|')) return false
  if (trimmed.startsWith('|')) return true
  return (trimmed.match(/\|/gu) || []).length >= 4
}

// 파이프로 이어진 표 블록을 평문 줄로 변환한다.
// "| 등급 | 비율 | 누적 | |:-|:-|:-| | 1등급 | 10% | 10% | ..." →
//   "1등급: 비율 10%, 누적 10%" 처럼 행마다 한 줄. 변환 불가 시 null.
function convertPipeBlock(text = '') {
  const cells = String(text || '')
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
  if (cells.length < 4) return null

  // 헤더 직후의 연속된 구분행 셀 구간을 찾는다.
  let separatorStart = -1
  let separatorEnd = -1
  for (let index = 0; index < cells.length; index += 1) {
    if (isTableSeparatorCell(cells[index])) {
      if (separatorStart === -1) separatorStart = index
      separatorEnd = index
    } else if (separatorStart !== -1) {
      break
    }
  }
  if (separatorStart === -1) return null

  const columnCount = separatorEnd - separatorStart + 1
  if (columnCount < 2 || separatorStart < columnCount) return null

  const header = cells.slice(separatorStart - columnCount, separatorStart)
  const dataCells = cells.slice(separatorEnd + 1)
  if (dataCells.length < columnCount) return null

  const rows = []
  for (let index = 0; index + columnCount <= dataCells.length; index += columnCount) {
    const row = dataCells.slice(index, index + columnCount)
    if (columnCount === 2) {
      rows.push(`${row[0]}: ${row[1]}`)
    } else {
      const rest = header
        .slice(1)
        .map((headerName, restIndex) => `${headerName} ${row[restIndex + 1]}`)
        .join(', ')
      rows.push(`${row[0]}: ${rest}`)
    }
  }

  return rows.length > 0 ? rows.join('\n') : null
}

// 본문에 섞인 마크다운 표를 평문 줄로 바꾼다. 네이버 블로그 에디터는 마크다운 표를
// 렌더링하지 못하므로 "| 열 | 열 |" 가 날것으로 노출되는 것을 막는다.
// 표 중간에 빈 줄이 끼어 있어도 같은 표로 이어 붙여 처리한다.
export function convertMarkdownTables(raw = '') {
  const lines = String(raw || '').split('\n')
  const out = []
  let tableLines = []

  const flushTable = () => {
    if (tableLines.length === 0) return
    const converted = convertPipeBlock(tableLines.join(' '))
    if (converted) {
      out.push(converted)
    } else {
      out.push(...tableLines)
    }
    tableLines = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (isTableRowCandidate(line)) {
      tableLines.push(line)
      continue
    }

    // 표 수집 중 빈 줄은, 다음 비어있지 않은 줄도 표 행이면 표가 이어지는 것으로 본다.
    if (line.trim() === '' && tableLines.length > 0) {
      let lookahead = index + 1
      while (lookahead < lines.length && lines[lookahead].trim() === '') lookahead += 1
      if (lookahead < lines.length && isTableRowCandidate(lines[lookahead])) {
        continue
      }
    }

    flushTable()
    out.push(line)
  }

  flushTable()
  return out.join('\n')
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
  '학력',
  '이력',
  '경력',
  '전문 분야',
  '대상',
  '국어',
  '수학',
  '영어',
  '한국사',
  '사회·과학 탐구',
  '사회탐구',
  '과학탐구',
  '직업',
  '제2외국어/한문',
  '제2외국어',
  '한문',
]

// 라벨과 내용을 항상 같은 줄에 유지하는 라벨(콜론 뒤 줄바꿈 금지).
// 수능 과목별 출제범위처럼 "과목: 범위" 한 줄이 자연스러운 항목에 사용한다.
const KEEP_INLINE_LABELS = new Set([
  '국어',
  '수학',
  '영어',
  '한국사',
  '사회·과학 탐구',
  '사회탐구',
  '과학탐구',
  '직업',
  '제2외국어/한문',
  '제2외국어',
  '한문',
])

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

  // 과목별 출제범위처럼 "라벨: 내용"을 한 줄로 유지해야 하는 라벨은 콤마 항목이 많아도 줄바꿈하지 않는다.
  if (KEEP_INLINE_LABELS.has(label)) return false

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

// prefix 는 라벨 앞 명사구 머리말("면접 문항 " 등)을 라벨에 붙여 한 줄로 유지할 때 쓴다.
function applyItemsSplitRule(line = '', prefix = '') {
  const match = String(line || '').match(LINE_START_LABEL_RE)
  if (!match) return prefix ? `${prefix}${line}` : line

  const [, indent, label, restRaw] = match
  const rest = splitInlineListMarkers(normalizeInlineSpaces(restRaw))
  const labelText = prefix ? `${prefix}${label}` : label

  if (!shouldBreakAfterColon(label, rest)) {
    return `${indent}${labelText}: ${rest}`
  }

  // 콜론 뒤 본문을 블록으로 내릴 때 문장 단위(. ! ?)로도 줄을 나눠,
  // 여러 문장(질문 등)이 한 줄에 뭉치지 않게 한다.
  const restBySentence = rest.replace(/([.!?])[ \t]+(?=\S)/gu, '$1\n')
  return `${indent}${labelText}:\n${restBySentence}`
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

// 라벨 앞 머리말이 문장/절이 아니라 명사구 수식어인지 판별한다.
// (예: "면접 문항 예시:" 의 "면접 문항" — 라벨에서 떼지 않고 붙여 한 줄로 유지)
function isModifierPreamble(text = '') {
  const trimmed = String(text || '').trim()
  if (!trimmed) return false
  if (/[.!?]/u.test(trimmed)) return false              // 문장부호 → 별도 문장/절
  if (countInlineLabelColons(trimmed) > 0) return false  // 다른 라벨 콜론 포함
  return trimmed.length <= 20                            // 짧은 명사구만 대상
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

    // 단일 라벨 앞에 짧은 명사구 머리말이 있으면(예: "면접 문항" + "예시:"),
    // 머리말을 별도 줄로 떼지 않고 라벨에 붙여 "면접 문항 예시:" 한 줄로 유지한다.
    if (uniqueStarts.length === 1 && uniqueStarts[0] > 0) {
      const preamble = line.slice(0, uniqueStarts[0])
      if (isModifierPreamble(preamble)) {
        return applyItemsSplitRule(line.slice(uniqueStarts[0]), preamble)
      }
    }

    const needsSplit = uniqueStarts.length >= 2 || uniqueStarts[0] > 0
    if (!needsSplit) {
      return applyItemsSplitRule(line)
    }

    const pieces = []
    let prev = 0

    // 라벨 앞에 붙은 구분 기호(" - 대상:" 의 하이픈 등)는 줄을 나눌 때 함께 제거한다.
    const stripTrailingSeparator = (text) => String(text).replace(/\s*[-–—]?\s*$/u, '')

    if (uniqueStarts[0] > 0) {
      const preamble = stripTrailingSeparator(line.slice(0, uniqueStarts[0]))
      if (preamble) pieces.push(preamble)
      prev = uniqueStarts[0]
    }

    for (let i = 1; i < uniqueStarts.length; i += 1) {
      pieces.push(stripTrailingSeparator(line.slice(prev, uniqueStarts[i])))
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
  return splitLabeledLines(splitNumberedListItems(reflowBulletLabelLines(normalizeDateTokens(convertMarkdownTables(stripBlogAutoFormatMarkers(raw))))))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function sanitizeBlogBodyForUpload(raw = '') {
  return splitLabeledLines(splitNumberedListItems(reflowBulletLabelLines(normalizeDateTokens(convertMarkdownTables(stripBlogAutoFormatMarkers(raw))))))
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

import { callGeminiWithFallback, parseJSON } from './gemini-core'
import { normalizeBlogTags } from '../utils/blogTags'

function stripMarkdownEmphasis(text = '') {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

function stripUnsupportedBlogFormatting(text = '') {
  return String(text || '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/--([^-\n]+)--/g, '$1')
    .trim()
}

function escapeRegExp(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const BLOG_BOLD_TOKEN_STOPWORDS = new Set([
  '안내', '준비', '전략', '방법', '내용', '정보', '확인', '체크', '진행', '일정', '관련',
  '중요', '전달', '대비', '필요', '발표', '접수', '지원', '날짜', '학생', '수험생',
])

const BLOG_PRIORITY_KEYWORDS = [
  '논술',
  '면접',
  '수능',
  '원서접수',
  '최저학력기준',
  '학생부종합전형',
  '학생부교과전형',
  '교과전형',
  '종합전형',
  '정시',
  '수시',
  '학기',
  '자소서',
  '지원전략',
  '경쟁률',
  '충원율',
  '합격선',
  '모집인원',
  '내신',
  '모의고사',
  '추가합격',
  '상향지원',
  '안정지원',
]

function trimBlogBoldCandidate(text = '') {
  return stripMarkdownEmphasis(String(text || ''))
    .replace(/[\s,.:;!?/\\]+$/g, '')
    .trim()
}

const WEAK_BLOG_KEYPHRASE_TERMS = new Set([
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

const WEAK_BLOG_HEADING_TERMS = new Set([
  '핵심 내용',
  '핵심 정리',
  '주요 내용',
  '활용 방안',
  '참고 사항',
  '유의 사항',
  '기본 개요',
  '주요 변화',
])

function normalizeBlogLabel(text = '') {
  return trimBlogBoldCandidate(text)
    .replace(/\s+/g, '')
    .toLowerCase()
}

function isWeakBlogKeyPhraseValue(keyPhrase = '', heading = '') {
  const clean = trimBlogBoldCandidate(keyPhrase)
  if (!clean) return true
  if (clean.length > 16) return true
  if (clean.split(/\s+/).filter(Boolean).length > 4) return true
  if (/[.!?]/.test(clean)) return true
  if (/(입니다|합니다|됩니다|있습니다|하는 방법)$/u.test(clean)) return true

  const normalized = normalizeBlogLabel(clean)
  if (WEAK_BLOG_KEYPHRASE_TERMS.has(normalized)) return true

  const normalizedHeading = normalizeBlogLabel(heading)
  if (normalizedHeading && normalizedHeading === normalized) return true

  return false
}

function isWeakBlogHeadingValue(heading = '', keyPhrase = '') {
  const clean = trimBlogBoldCandidate(heading)
  if (!clean) return true
  if (clean.length > 34) return true
  if (/[.!?]/.test(clean)) return true
  if (clean.split(/\s+/).filter(Boolean).length < 2) return true
  if (/(입니다|합니다|됩니다|있습니다)$/u.test(clean)) return true

  const normalized = normalizeBlogLabel(clean)
  if (WEAK_BLOG_HEADING_TERMS.has(clean) || WEAK_BLOG_KEYPHRASE_TERMS.has(normalized)) return true

  const normalizedKeyPhrase = normalizeBlogLabel(keyPhrase)
  if (normalizedKeyPhrase && normalizedKeyPhrase === normalized) return true

  return false
}

function shouldReanalyzeBlogSectionLabels(section = {}) {
  const keyPhrase = trimBlogBoldCandidate(section?.keyPhrase || '')
  const heading = trimBlogBoldCandidate(section?.heading || '')
  return isWeakBlogKeyPhraseValue(keyPhrase, heading) || isWeakBlogHeadingValue(heading, keyPhrase)
}

async function reanalyzeBlogSectionLabels(section = {}, blogContext = {}) {
  const content = String(section?.content || '').trim()
  if (!content) return section

  const prompt = `?뱀떊? 釉붾줈洹??뱀뀡 ?쇰꺼 ?몄쭛?먯엯?덈떎. ?꾨옒 蹂몃Ц???쎄퀬 ?대?吏?????쒕ぉ????keyPhrase? 蹂몃Ц ?뱀뀡 ?쒕ぉ?쇰줈 ??heading???ㅼ떆 ?뺥븯?몄슂.

洹쒖튃:
- keyPhrase???대?吏 ???쒕ぉ?⑹엯?덈떎.
- keyPhrase??2~10???댁쇅??吏㏃? 紐낆궗援щ줈 ?묒꽦?섏꽭??
- heading? 蹂몃Ц ?뱀뀡 ?쒕ぉ?⑹엯?덈떎.
- heading? keyPhrase蹂대떎 ?ㅻ챸??議곌툑 ???덈뒗 10~26???댁쇅 ?쒕ぉ?쇰줈 ?묒꽦?섏꽭??
- keyPhrase? heading? ?꾩쟾??媛숈? 臾멸뎄瑜??곗? 留덉꽭??
- 異붿긽?곸씤 ?⑥뼱(以묒슂?? 蹂?? ?쒖슜, 媛쒖슂, ?④낵)留??⑤룆?쇰줈 ?곗? 留덉꽭??
- 臾몄옣???쒗쁽(~?낅땲?? ~?⑸땲??? ?쇳븯?몄슂.
- ?덈줈???ъ떎??異붽??섏? 留먭퀬 蹂몃Ц ?덉쓽 ?듭떖留??ш뎄?깊븯?몄슂.
- JSON留?異쒕젰?섏꽭??

釉붾줈洹??쒕ぉ: ${String(blogContext.title || '').trim() || '?놁쓬'}
釉붾줈洹??붿빟: ${String(blogContext.summary || '').trim() || '?놁쓬'}
?꾩옱 heading: ${String(section?.heading || '').trim() || '?놁쓬'}
?꾩옱 keyPhrase: ${String(section?.keyPhrase || '').trim() || '?놁쓬'}

蹂몃Ц:
${content.slice(0, 1800)}

異쒕젰 ?ㅽ궎留?
{"heading":"?뱀뀡 ?쒕ぉ","keyPhrase":"?듭떖 ?ㅼ썙??}`

  try {
    const result = await callGeminiWithFallback(prompt, {
      temperature: 0.2,
      maxOutputTokens: 512,
      jsonMode: true,
    })
    const parsed = parseJSON(result, null)
    const nextHeading = trimBlogBoldCandidate(parsed?.heading || '')
    const nextKeyPhrase = trimBlogBoldCandidate(parsed?.keyPhrase || '')

    return {
      ...section,
      heading: nextHeading || section?.heading || '',
      keyPhrase: nextKeyPhrase || section?.keyPhrase || '',
    }
  } catch {
    return section
  }
}

function extractPriorityBlogTokens(text = '') {
  return trimBlogBoldCandidate(text)
    .split(/[\s,()[\]{}"'?,.:;!?/\\|-]+/)
    .map((token) => token.trim())
    .filter((token) => (
      token.length >= 2 &&
      token.length <= 10 &&
      !/^\d+$/.test(token) &&
      !BLOG_BOLD_TOKEN_STOPWORDS.has(token)
    ))
}
function derivePriorityKeywordCandidates(section = {}) {
  const haystack = [
    section?.keyPhrase || '',
    section?.heading || '',
    section?.content || '',
  ].join(' ')
  const candidates = []
  for (const keyword of BLOG_PRIORITY_KEYWORDS) {
    if (haystack.includes(keyword) && !candidates.includes(keyword)) {
      candidates.push(keyword)
    }
  }
  return candidates
}

function deriveBlogBoldCandidates(section = {}) {
  const keyPhrase = trimBlogBoldCandidate(section?.keyPhrase || '')
  const heading = trimBlogBoldCandidate(section?.heading || '')
  const candidates = []
  for (const keyword of derivePriorityKeywordCandidates(section)) {
    if (!candidates.includes(keyword)) candidates.push(keyword)
  }
  for (const token of extractPriorityBlogTokens(keyPhrase)) {
    if (!candidates.includes(token)) candidates.push(token)
  }
  if (keyPhrase && !candidates.includes(keyPhrase)) candidates.push(keyPhrase)
  for (const token of extractPriorityBlogTokens(heading)) {
    if (!candidates.includes(token)) candidates.push(token)
  }
  if (heading && heading !== keyPhrase && !candidates.includes(heading)) candidates.push(heading)
  for (const value of [keyPhrase, heading]) {
    if (!value) continue
    const tokens = value.split(/\s+/).filter(Boolean)
    if (tokens.length >= 2) {
      const compact = tokens.slice(0, 2).join(' ')
      if (compact && !candidates.includes(compact)) candidates.push(compact)
    }
    if (tokens[0] && !candidates.includes(tokens[0])) candidates.push(tokens[0])
  }
  return candidates.filter(Boolean)
}

function deriveCompactBlogPhraseCandidate(text = '') {
  const clean = trimBlogBoldCandidate(text)
  if (!clean) return ''

  const tokens = clean
    .split(/[\s,()[\]{}"'?.:;!/\\|-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 12)

  if (!tokens.length) return ''
  if (tokens.length === 1) return tokens[0]

  const joined = tokens.slice(0, 2).join(' ')
  return joined.length <= 12 ? joined : tokens[0]
}

function strengthenBlogKeyPhrase(section = {}) {
  const currentKeyPhrase = trimBlogBoldCandidate(section?.keyPhrase || '')
  const currentHeading = trimBlogBoldCandidate(section?.heading || '')

  if (!isWeakBlogKeyPhraseValue(currentKeyPhrase, currentHeading)) {
    return section
  }

  const prioritizedCandidates = [
    ...derivePriorityKeywordCandidates(section),
    ...extractPriorityBlogTokens(currentHeading),
    deriveCompactBlogPhraseCandidate(currentHeading),
    ...extractPriorityBlogTokens(section?.content || ''),
    deriveCompactBlogPhraseCandidate(section?.content || ''),
  ]

  const nextKeyPhrase = prioritizedCandidates
    .map((candidate) => trimBlogBoldCandidate(candidate))
    .find((candidate) => candidate && !isWeakBlogKeyPhraseValue(candidate, currentHeading))

  if (!nextKeyPhrase) return section

  return {
    ...section,
    keyPhrase: nextKeyPhrase,
  }
}

function applyRegexBold(content = '', regex) {
  return String(content || '').replace(regex, (match, ...args) => {
    const source = args[args.length - 1]
    const offset = args[args.length - 2]
    const before = String(source).slice(Math.max(0, offset - 2), offset)
    const after = String(source).slice(offset + match.length, offset + match.length + 2)
    if (before === '**' && after === '**') return match
    return `**${match.trim()}**`
  })
}

function applyBlogScheduleAndDateBold(content = '') {
  const slashDatePattern = String.raw`\d{1,4}[./-]\d{1,2}(?:[./-]\d{1,2})?`
  const koreanDatePattern = String.raw`\d{1,4}\s*??s*\d{1,2}\s*???:\s*\d{1,2}\s*???`
  const weekdayPattern = String.raw`(?:\s*(?:\([^)]+\)|\[[^\]]+\]|[?뷀솕?섎ぉ湲덊넗???붿씪?))?`
  const rangePattern = String.raw`(?:\s*(?:~|遺??\s*(?:${slashDatePattern}|${koreanDatePattern})${weekdayPattern})?`
  const datePattern = String.raw`(?:${slashDatePattern}|${koreanDatePattern})${weekdayPattern}${rangePattern}`
  const labelPattern = String.raw`[\p{Script=Hangul}A-Za-z0-9쨌??+]{2,20}`
  const schedulePattern = new RegExp(
    String.raw`(${labelPattern}\s*(?:[:竊?\s*|\s+)?${datePattern})`,
    'gu',
  )
  const bareDatePattern = new RegExp(String.raw`(?<!\*)(${datePattern})(?!\*)`, 'gu')

  let nextContent = applyRegexBold(content, schedulePattern)
  nextContent = applyRegexBold(nextContent, bareDatePattern)
  return nextContent
}

function applySingleBold(content = '', candidate = '') {
  const cleanCandidate = trimBlogBoldCandidate(candidate)
  if (!cleanCandidate) return content
  if (String(content).includes(`**${cleanCandidate}**`)) return content

  const escapedCandidate = escapeRegExp(cleanCandidate)
  const regex = new RegExp(`(^|[\\s("'])(${escapedCandidate})(?=($|[\\s,.:;!?)'"]))`)
  if (!regex.test(content)) return content

  return content.replace(regex, (_, prefix, match) => `${prefix}**${match}**`)
}

function ensureBlogSectionBold(section = {}) {
  const content = stripUnsupportedBlogFormatting(section?.content || '')
  if (!content.trim()) return section

  let nextContent = applyBlogScheduleAndDateBold(content)
  let appliedKeywords = 0
  for (const candidate of deriveBlogBoldCandidates(section)) {
    const updated = applySingleBold(nextContent, candidate)
    if (updated !== nextContent) {
      nextContent = updated
      appliedKeywords += 1
      if (appliedKeywords >= 2) break
    }
  }

  return {
    ...section,
    content: nextContent,
  }
}

function normalizeInlineSpaces(text = '') {
  return String(text || '')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitColonStatement(text = '') {
  const match = String(text || '').match(/^(.{2,28}?)\s*[:\uff1a]\s*(.+)$/)
  if (!match) return null

  const label = match[1].trim()
  const body = normalizeInlineSpaces(match[2])
  if (!label || !body) return null

  return { label, body }
}

function shouldBreakAfterColon(body = '') {
  const items = String(body || '')
    .split(/\s*[,\uff0c]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (items.length < 3) return false
  if (body.length <= 48 && items.every((item) => item.length <= 14)) return false
  return true
}

function normalizeBlogParagraphLineBreaks(paragraph = '') {
  const compact = normalizeInlineSpaces(paragraph)
  if (!compact) return ''

  const labeledLines = compact
    .replace(
      /([.!?\u3002\uff01\uff1f]|\ub2e4|\uc694|\uc8e0|\ud568|\uc74c|\ub428|\uc784)\s+(?=.{2,28}?\s*[:\uff1a])/g,
      '$1\n',
    )
    .split('\n')
    .map((line) => {
      const colonStatement = splitColonStatement(line)
      if (!colonStatement) return line

      const { label, body } = colonStatement
      return shouldBreakAfterColon(body) ? `${label}:\n${body}` : `${label}: ${body}`
    })

  return labeledLines.join('\n')
}

export function normalizeBlogSectionLineBreaks(content = '') {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(normalizeBlogParagraphLineBreaks)
    .filter(Boolean)
    .join('\n\n')
  /*
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph
      .replace(
        /(^|\n|[.!??귨펯竊?\s+)([^.!??귨펯竊?n:竊?{2,28}[:竊?)\s*(?=\S)/g,
        (_, prefix, label) => {
          const before = prefix && !prefix.endsWith('\n') ? `${prefix.trimEnd()}\n` : prefix
          return `${before}${label}\n`
        },
      )
      .replace(
        /([.!??귨펯竊?)\s+(?=(癒쇱?|?ㅼ쓬?쇰줈|?먰븳|諛섎㈃|?덈? ?ㅼ뼱|援ъ껜?곸쑝濡??뱁엳|?쒗렪|?댁? ?④퍡|留덉?留됱쑝濡?)/g,
        '$1\n',
      )
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .trim())
    .filter(Boolean)
    .join('\n\n')
  */
}

function ensureBlogSectionLineBreaks(section = {}) {
  const content = stripUnsupportedBlogFormatting(section?.content || '')
  if (!content.trim()) return section

  return {
    ...section,
    content: normalizeBlogSectionLineBreaks(content),
  }
}

async function finalizeBlogSection(section = {}, blogContext = {}) {
  const relabeledSection = shouldReanalyzeBlogSectionLabels(section)
    ? await reanalyzeBlogSectionLabels(section, blogContext)
    : section

  const refinedSection = strengthenBlogKeyPhrase(relabeledSection)
  return ensureBlogSectionBold(ensureBlogSectionLineBreaks(refinedSection))
}

async function finalizeBlogContent(content) {
  if (!content) return content
  const nextContent = {
    ...content,
    sections: Array.isArray(content.sections)
      ? await Promise.all(content.sections.map((section) => finalizeBlogSection(section, {
          title: content.title,
          summary: content.summary,
        })))
      : [],
  }
  return {
    ...nextContent,
    tags: normalizeBlogTags(nextContent),
  }
}

const UNIVERSITY_ADMISSIONS_KEYWORDS = [
  '대학교',
  '대학',
  '수시',
  '정시',
  '전형',
  '수능',
  '최저',
  '학생부',
  '교과',
  '종합',
  '면접',
  '서류',
  '논술',
]

const UNIVERSITY_NAME_STOPWORDS = new Set([
  '상위권대',
  '지방대',
  '수도권대',
  '전문대',
])

function extractUniversityNames(text = '') {
  const matches = String(text || '').match(/[가-힣]{2,12}(?:대학교|대학|대)/g) || []
  const seen = new Set()
  return matches.filter((name) => {
    const clean = String(name || '').trim()
    if (!clean || UNIVERSITY_NAME_STOPWORDS.has(clean) || seen.has(clean)) return false
    seen.add(clean)
    return true
  })
}

function hasUniversityAdmissionsContext(summary, rawText, content) {
  const summaryText = [
    summary?.title || '',
    summary?.summary || '',
    ...(Array.isArray(summary?.keywords) ? summary.keywords : []),
    ...(Array.isArray(summary?.insights) ? summary.insights : []),
  ].join(' ')
  const cardText = Array.isArray(content?.cardTopics)
    ? content.cardTopics.map((topic) => [topic?.headline, topic?.content, topic?.dataPoint].join(' ')).join(' ')
    : ''
  const combined = `${summaryText} ${String(rawText || '').slice(0, 3000)} ${cardText}`
  const universityCount = extractUniversityNames(combined).length
  const keywordHits = UNIVERSITY_ADMISSIONS_KEYWORDS.filter((keyword) => combined.includes(keyword)).length
  return universityCount >= 3 && keywordHits >= 2
}

function normalizeUniversityConditionText(text = '') {
  return String(text || '')
    .replace(/[가-힣]{2,12}(?:대학교|대학|대)/g, ' ')
    .replace(/\s*(?:대|과|별)\s*/g, ' ')
    .replace(/[[\](){}'"“”’]/g, ' ')
    .replace(/[·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:대|각 대학|각 학교에서|우선|학교별 기준|경우)\s+/u, '')
    .replace(/\s+(?:대|각 대학|각 학교에서|우선|학교별)\s+/gu, ' ')
    .replace(/^[,.:;!?/-]+\s*/g, '')
    .replace(/\s*[,.:;!?/-]+\s*$/g, '')
    .trim()
}

function buildUniversityConditionInfo(topic = {}) {
  const headline = stripMarkdownEmphasis(topic?.headline || '')
  const content = stripMarkdownEmphasis(topic?.content || '')
  const dataPoint = stripMarkdownEmphasis(topic?.dataPoint || '')
  const combined = `${headline} ${content} ${dataPoint}`
  const universities = extractUniversityNames(combined)
  if (universities.length !== 1) return null

  const conditionSource = [content, dataPoint, headline].filter(Boolean).join(' ')
  const displayCondition = normalizeUniversityConditionText(conditionSource)
  if (!displayCondition || displayCondition.length < 4) return null

  const compactKey = displayCondition
    .replace(/\s+/g, '')
    .replace(/[,:;!?/\\-]/g, '')
    .toLowerCase()

  if (!compactKey || compactKey.length < 4) return null

  return {
    universities,
    displayCondition,
    key: compactKey,
    dataPoint,
  }
}

function buildGroupedUniversityHeadline(displayCondition = '') {
  if (displayCondition.includes('수능')) return '수능 최저 공통'
  if (displayCondition.includes('면접')) return '면접 공통 체크'
  if (displayCondition.includes('학생부')) return '학생부 반영 공통'
  if (displayCondition.includes('서류')) return '서류 준비 공통'
  if (displayCondition.includes('논술')) return '논술 전형 공통'
  if (displayCondition.includes('교과')) return '교과 전형 공통'
  if (displayCondition.includes('종합')) return '종합 전형 공통'
  return '공통 준비 체크'
}

function formatUniversityGroupNames(names = []) {
  const uniqueNames = [...new Set(names.filter(Boolean))]
  if (uniqueNames.length <= 3) return uniqueNames.join(', ')
  return `${uniqueNames.slice(0, 3).join(', ')} 외`
}

function regroupUniversityInstagramCardTopics(cardTopics = []) {
  const grouped = new Map()
  const passthrough = []

  ensureArray(cardTopics).forEach((topic, index) => {
    const info = buildUniversityConditionInfo(topic)
    if (!info) {
      passthrough.push({
        type: 'single',
        index,
        topic,
      })
      return
    }

    const existing = grouped.get(info.key) || {
      type: 'group',
      index,
      key: info.key,
      displayCondition: info.displayCondition,
      universities: [],
      topics: [],
    }

    existing.index = Math.min(existing.index, index)
    existing.displayCondition = existing.displayCondition.length >= info.displayCondition.length
      ? existing.displayCondition
      : info.displayCondition
    existing.universities.push(...info.universities)
    existing.topics.push(topic)
    grouped.set(info.key, existing)
  })

  const mergedEntries = [
    ...passthrough,
    ...Array.from(grouped.values()).map((entry) => {
      const uniqueUniversities = [...new Set(entry.universities)]
      if (uniqueUniversities.length < 2) {
        return {
          type: 'single',
          index: entry.index,
          topic: entry.topics[0],
        }
      }

      const universityLabel = formatUniversityGroupNames(uniqueUniversities)
      const displayCondition = entry.displayCondition
      const nextTopic = {
        ...entry.topics[0],
        headline: buildGroupedUniversityHeadline(displayCondition),
        content: `${universityLabel}는 ${displayCondition}`,
        dataPoint: `${uniqueUniversities.length}개 대학 공통`,
      }

      return {
        type: 'group',
        index: entry.index,
        topic: nextTopic,
      }
    }),
  ]

  return mergedEntries
    .sort((a, b) => a.index - b.index)
    .map((entry, index) => ({
      ...entry.topic,
      cardNumber: index + 1,
    }))
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function sanitizeInstagramContent(content, context = {}) {
  if (!content) return content
  const sanitizedCardTopics = Array.isArray(content.cardTopics)
    ? content.cardTopics.map((topic) => ({
        ...topic,
        headline: stripMarkdownEmphasis(topic?.headline || ''),
        content: stripMarkdownEmphasis(topic?.content || ''),
        dataPoint: stripMarkdownEmphasis(topic?.dataPoint || ''),
      }))
    : []

  const sanitizedContent = {
    ...content,
    title: stripMarkdownEmphasis(content.title || ''),
    body: stripMarkdownEmphasis(content.body || ''),
    caption: stripMarkdownEmphasis(content.caption || ''),
    cardTopics: sanitizedCardTopics,
  }

  if (!hasUniversityAdmissionsContext(context.summary, context.rawText, sanitizedContent)) {
    return sanitizedContent
  }

  return {
    ...sanitizedContent,
    cardTopics: regroupUniversityInstagramCardTopics(sanitizedCardTopics),
  }
}

function sanitizeShortsContent(content) {
  if (!content) return content
  return {
    ...content,
    title: stripMarkdownEmphasis(content.title || ''),
    hook: stripMarkdownEmphasis(content.hook || ''),
    cta: stripMarkdownEmphasis(content.cta || ''),
    uploadTitle: stripMarkdownEmphasis(content.uploadTitle || ''),
    uploadDescription: stripMarkdownEmphasis(content.uploadDescription || ''),
    scenes: Array.isArray(content.scenes)
      ? content.scenes.map((scene) => ({
          ...scene,
          narration: stripMarkdownEmphasis(scene?.narration || ''),
          textOverlay: stripMarkdownEmphasis(scene?.textOverlay || ''),
        }))
      : [],
  }
}

function buildEmphasisInstruction(emphasis) {
  if (!emphasis || emphasis.trim() === '') return ''
  return `
## 강조 요청
사용자가 다음 내용을 중요하게 다뤄달라고 요청했습니다: "${emphasis.trim()}"
- 이 내용은 모든 채널의 핵심 메시지에 자연스럽게 반영하세요.
- 없는 사실은 추가하지 말고, 제공된 요약과 원문 범위 안에서만 강조하세요.
`
}

function buildOptionsInstruction(options = {}) {
  const parts = []
  const toneMap = {
    friendly: '친근하고 읽기 쉬운 톤',
    professional: '전문적이고 신뢰감 있는 톤',
    humorous: '가볍고 재치 있는 톤',
    formal: '정중하고 공식적인 톤',
  }

  if (options.tone && options.tone !== 'auto' && toneMap[options.tone]) {
    parts.push(`- ?꾩껜 ?? ${toneMap[options.tone]}`)
  }
  if (options.commonExtra) parts.push(`- 怨듯넻 異붽? 吏?? ${options.commonExtra}`)
  if (options.blogExtra) parts.push(`- 釉붾줈洹?異붽? 吏?? ${options.blogExtra}`)
  if (options.newsletterExtra) parts.push(`- ?댁뒪?덊꽣 異붽? 吏?? ${options.newsletterExtra}`)
  if (options.instaExtra) parts.push(`- ?몄뒪?洹몃옩 異붽? 吏?? ${options.instaExtra}`)
  if (options.shortsExtra) parts.push(`- ?륂뤌 異붽? 吏?? ${options.shortsExtra}`)

  if (!parts.length) return ''

  return `
## ?ъ슜???ㅼ젙
?꾨옒 ?ㅼ젙? 湲곕낯 洹쒖튃蹂대떎 ?곗꽑?댁꽌 諛섏쁺?섏꽭??
${parts.join('\n')}
`
}

function buildBlogTitleRules() {
  return `
## 釉붾줈洹??쒕ぉ 洹쒖튃
- ?뺤떇: "?듭떖 ?ㅼ썙?? ?ㅻ챸 臾몄옣"
- 寃?됰웾???믪쓣 ?듭떖 ?ㅼ썙??1~2媛쒕? ?쒕ぉ 留??욎뿉 諛곗튂?섏꽭??
- 援щ텇?먮뒗 ?쇳몴(,)留??ъ슜?섏꽭??
- 肄쒕줎(:), ?뚯씠??|)???ъ슜?섏? 留덉꽭??
- ?곕룄, ??? ?몃? ?ㅻ챸? ?ㅼそ??諛곗튂?섏꽭??
- ?쒕ぉ? 30???덊뙉?쇰줈 媛꾧껐?섍쾶 ?좎??섏꽭??
`
}

function buildBlogBodyLineBreakRules() {
  return `
## Blog body line break rules
- Do not split one complete sentence across multiple lines. Keep one sentence on one line.
- For "A: B" content, keep it on one line when B is one sentence.
- For "A: B, C, D" content, keep it on one line if B/C/D are short. If the comma-separated items are long or explanatory, write "A:" and put the item text on the next line.

## 釉붾줈洹?蹂몃Ц 以꾨컮轅?洹쒖튃
- sections[].content ?덉뿉?쒕뒗 ???뱀뀡???덈줈 留뚮뱾 ?뺣룄???꾨땲吏留??댁슜 ?⑥쐞媛 諛붾뚮뒗 吏?먯뿉 以꾨컮轅덉쓣 ?ｌ쑝?몄슂.
- ?쇱젙, 湲곌컙, ??? ?μ냼, 以鍮꾨Ъ, ?좎껌 諛⑸쾿, ?듭떖 蹂?붿쿂???쇰꺼怨?媛믪씠 ?댁뼱吏???댁슜? "?쇰꺼:" ?ㅼ쓬 以꾩뿉 ?ㅼ젣 ?댁슜???곗꽭??
  ?? "?섎뒫 ?쇱젙:\\n11/11 (紐?"
- ??臾몃떒 ?덉뿉??"癒쇱?", "?ㅼ쓬?쇰줈", "?먰븳", "諛섎㈃", "?덈? ?ㅼ뼱", "援ъ껜?곸쑝濡?, "?뱁엳", "留덉?留됱쑝濡?泥섎읆 ?ㅻ챸 ?먮쫫??諛붾뚮㈃ ?대떦 臾몄옣 ?욎뿉??以꾨컮轅덊븯?몄슂.
- ?꾩쟾???ㅻⅨ ??二쇱젣??湲곗〈泥섎읆 蹂꾨룄 section?쇰줈 ?섎늻怨? 媛숈? section ?덉쓽 ?몃? ?댁슜 蹂?붾쭔 以꾨컮轅덉쑝濡??뺣━?섏꽭??
`
}

function buildUniversityListContentRules() {
  return `
## University list content rules
- If the source or summary contains multiple universities with separate conditions, schedules, admissions tracks, evaluation standards, or preparation points, do not focus on only one university.
- Mention several real universities from the source together in the newsletter and Instagram output.
- Use comparison-style wording such as "A and B are ..., C and D are ..., while F is ..." so the reader can see differences across universities.
- When selecting examples from a long university list, choose several recognizable or important universities from the source without inventing any university that is not present.
- If only representative universities are shown, naturally add "?? to signal that the source contains more universities.
- Apply this rule to newsletter keyPoints, newsletter body, newsletter dataHighlights, Instagram caption, and Instagram cardTopics.

Example:
If the source says Konkuk University, Sungkyunkwan University, Seoul National University, Korea University, and Yonsei University each have different admissions checks, write like:
"嫄닿뎅?? ?깃퇏愿????숈깮遺? ?섎뒫 理쒖? ?뺤씤??以묒슂?섍퀬, ?쒖슱?? 怨좊젮???硫댁젒怨??꾧났 ?곌퀎 ?쒕룞???④퍡 遊먯빞 ?섎ŉ, ?곗꽭????꾪삎蹂??쒖텧 ?쒕쪟 李⑥씠瑜??뺤씤?댁빞 ?섎뒗 ????숇퀎 以鍮??ъ씤?멸? ?ㅻ쫭?덈떎."
`
}

function buildInstagramCardRules() {
  return `
## 인스타그램 카드 규칙
- cardTopics는 이미지 카드로 강조할 만큼 중요한 핵심 내용만 선별하세요.
- 단순 보조 설명, 반복 문장, 마무리 문장처럼 덜 중요한 문장은 카드로 만들지 마세요.
- 카드 개수는 중요도와 내용 수에 맞추되 최소 6장 이상으로 구성하세요.
- cardTopics는 중요도와 독자가 이해해야 하는 흐름 순서대로 정렬하세요.
- 각 카드는 하나의 핵심 메시지만 담고, headline/content/dataPoint를 짧고 명확하게 작성하세요.
- Each card should be image-friendly. Keep headline short, keep content to one concise 핵심 문장, and keep dataPoint to one short 핵심 수치 or keyword.
- Do not write long explanatory paragraphs inside cardTopics. Long explanations belong in the caption, not inside the image text.
- Prefer one 핵심 포인트 per card. If a sentence is long, shorten it to the 핵심 키워드 or 핵심 수치 only.
`
}

function buildInstagramCaptionRules() {
  return `
## 인스타그램 캡션 규칙
- caption은 cardTopics 전체를 한 번 더 카드별로 반복 설명하지 말고, 전체 요약과 맥락 설명 중심으로 작성하세요.
- 카드 이미지 안에 이미 들어간 핵심 내용은 캡션에서 다시 한 줄씩 반복하지 마세요.
- caption은 전체 흐름을 이해시키는 짧은 문단형 요약으로 작성하세요.
- 전체 분량은 350~600자(공백 포함) 사이로 작성하고, 600자를 넘기지 마세요.
- 문단은 3~5개로 나누고 각 문단은 1~2문장으로 간결하게 작성하세요.
- 각 문단 첫머리에는 내용을 어울리게 하는 이모지 아이콘을 1개씩 넣어 가독성을 높이세요. 예: 📘, ✨, 📌, 🔍, ✅
- 이모지는 과하게 반복하지 말고, 같은 이모지를 연속 문단에서 반복하지 마세요.
- 글머리 기호나 단순 번호 나열 대신 자연스러운 짧은 문단 흐름으로 작성하세요.
- 첫 문단은 시선을 끄는 도입, 마지막 문단은 짧은 마무리나 행동 유도로 구성하세요.
- caption에는 해시태그(#)를 포함하지 마세요. 해시태그는 hashtags 필드에만 작성하세요.
- The caption should be a concise overall summary only.
- Do not add one numbered line for every card.
- Do not repeat each card's 핵심 내용 in the caption when that 내용 is already shown on the image.
- Use the caption to explain the overall takeaway, context, and why the carousel matters.
`
}

function buildBasePrompt(summary, rawText, emphasis, options) {
  return `
${buildUniversityListContentRules()}
## ?낅젰 ?곗씠??
### ?붿빟 ?곗씠??
${JSON.stringify(summary, null, 2)}

### ?먮Ц
${rawText.slice(0, 8000)}
${buildEmphasisInstruction(emphasis)}
${buildOptionsInstruction(options)}
`
}

async function generate4Channels(summary, rawText, emphasis, options = {}) {
  const prompt = `?뱀떊? 硫?곗콈??肄섑뀗痢??꾨왂媛?낅땲?? ?꾨옒 ?뺣낫瑜?諛뷀깢?쇰줈 釉붾줈洹? ?댁뒪?덊꽣, ?몄뒪?洹몃옩, ?좏뒠釉??륂뤌 肄섑뀗痢좊? ??踰덉뿉 ?앹꽦?섏꽭??

## 怨듯넻 洹쒖튃
- 紐⑤뱺 ?レ옄, ?듦퀎, ?곕룄, ?섏튂???먮Ц 洹몃?濡??ъ슜?섏꽭??
- ?녿뒗 ?ъ떎??異붽??섏? 留덉꽭??
- 媛?梨꾨꼸???뺤떇怨??낆옄 湲곕???留욊쾶 ?ㅼ떆 ??二쇱꽭??
- 諛섎뱶??JSON留?異쒕젰?섏꽭??

${buildBlogTitleRules()}

## ?몄뒪?洹몃옩 洹쒖튃
- body, caption, cardTopics?먮뒗 markdown bold/emphasis(**, *, __, _)瑜??덈? ?ъ슜?섏? 留덉꽭??
${buildInstagramCardRules()}
${buildInstagramCaptionRules()}

## ?좏뒠釉??륂뤌 洹쒖튃
- hook, scenes[].narration, scenes[].textOverlay, cta, uploadTitle, uploadDescription?먮뒗 markdown bold/emphasis(**, *, __, _)瑜??덈? ?ъ슜?섏? 留덉꽭??
- scenes??3媛??댁긽?쇰줈 援ъ꽦?섏꽭??
- 珥?湲몄씠??20~30珥??섏??쇰줈 ?묒꽦?섏꽭??
- uploadTitle? 60???대궡, uploadDescription? 200~400???섏??쇰줈 ?묒꽦?섏꽭??
- hashtags??8~12媛?諛곗뿴濡?諛섑솚?섏꽭??

## ?댁뒪?덊꽣 洹쒖튃
- 泥??몄궗留먯? ?먯뿰?ㅻ읇寃??묒꽦?섎릺, 怨쇱옣???먮ℓ 臾멸뎄???쇳븯?몄슂.

## 釉붾줈洹?洹쒖튃
- ?뱀뀡? 3媛??댁긽 援ъ꽦?섏꽭??
- sections[].content??異⑸텇??湲몄씠??蹂몃Ц?쇰줈 ?묒꽦?섏꽭??
${buildBlogBodyLineBreakRules()}

${buildBasePrompt(summary, rawText, emphasis, options)}

## 異쒕젰 ?ㅽ궎留?
{
  "blog": {
    "title": "釉붾줈洹??쒕ぉ",
    "metaDescription": "硫뷀? ?ㅻ챸",
    "sections": [
      {
        "heading": "?뱀뀡 ?쒕ぉ",
        "keyPhrase": "?듭떖 ?ㅼ썙???먮뒗 吏㏃? ?붿빟",
        "content": "?뱀뀡 蹂몃Ц",
        "imagePrompt": "Image prompt in English"
      }
    ],
    "tags": ["?쒓렇"],
    "summary": "湲 ?붿빟"
  },
  "newsletter": {
    "subject": "硫붿씪 ?쒕ぉ",
    "preheader": "?꾨━?ㅻ뜑",
    "greeting": "?몄궗留?,
    "headline": "?ㅻ뱶?쇱씤",
    "keyPoints": ["?듭떖 ?ъ씤??],
    "body": "蹂몃Ц",
    "dataHighlights": [{ "label": "??ぉ", "value": "媛? }],
    "cta": { "text": "CTA", "description": "?ㅻ챸" },
    "closingNote": "留덈Т由?臾멸뎄"
  },
  "instagram": {
    "title": "寃뚯떆臾??쒕ぉ",
    "body": "寃뚯떆臾?蹂몃Ц",
    "caption": "?몄뒪?洹몃옩 罹≪뀡",
    "hashtags": ["#?쒓렇"],
    "cardTopics": [
      {
        "cardNumber": 1,
        "headline": "移대뱶 ?쒕ぉ",
        "content": "移대뱶 ?댁슜",
        "dataPoint": "?듭떖 ?섏튂"
      }
    ]
  },
  "shorts": {
    "title": "?륂뤌 ?쒕ぉ",
    "duration": "20",
    "hook": "泥?臾몄옣",
    "scenes": [
      {
        "sceneNumber": 1,
        "duration": "6",
        "narration": "?섎젅?댁뀡",
        "visualDescription": "Visual description in English",
        "textOverlay": "?띿뒪???ㅻ쾭?덉씠"
      }
    ],
    "cta": "留덈Т由?臾멸뎄",
    "thumbnailPrompt": "Thumbnail prompt in English",
    "uploadTitle": "YouTube ?쒕ぉ",
    "uploadDescription": "YouTube ?ㅻ챸",
    "hashtags": ["#Shorts", "#?쒓렇"]
  }
}`

  const result = await callGeminiWithFallback(prompt, {
    temperature: 0.4,
    maxOutputTokens: 32768,
    jsonMode: true,
  })
  return parseJSON(result, null)
}

export async function generateAllContent(summary, rawText, emphasis, options = {}) {
  const [fourResult] = await Promise.allSettled([
    generate4Channels(summary, rawText, emphasis, options),
  ])

  const four = fourResult.status === 'fulfilled' ? fourResult.value : null
  if (!four) {
    console.error('[Gemini] multi-channel generation failed', fourResult)
    throw new Error('肄섑뀗痢??앹꽦 寃곌낵瑜??뚯떛?섏? 紐삵뻽?듬땲??')
  }

  return {
    blog: await finalizeBlogContent(four?.blog || null),
    newsletter: four?.newsletter || null,
    instagram: sanitizeInstagramContent(four?.instagram || null, { summary, rawText }),
    shorts: sanitizeShortsContent(four?.shorts || null),
  }
}

const CHANNEL_SCHEMAS = {
  blog: `"blog":{"title":"釉붾줈洹??쒕ぉ","metaDescription":"硫뷀? ?ㅻ챸","sections":[{"heading":"?뱀뀡 ?쒕ぉ","keyPhrase":"?듭떖 ?ㅼ썙??,"content":"?뱀뀡 蹂몃Ц","imagePrompt":"Image prompt in English"}],"tags":["?쒓렇"],"summary":"湲 ?붿빟"}`,
  newsletter: `"newsletter":{"subject":"硫붿씪 ?쒕ぉ","preheader":"?꾨━?ㅻ뜑","greeting":"?몄궗留?,"headline":"?ㅻ뱶?쇱씤","keyPoints":["?듭떖 ?ъ씤??],"body":"蹂몃Ц","dataHighlights":[{"label":"??ぉ","value":"媛?}],"cta":{"text":"CTA","description":"?ㅻ챸"},"closingNote":"留덈Т由?臾멸뎄"}`,
  instagram: `"instagram":{"title":"寃뚯떆臾??쒕ぉ","body":"寃뚯떆臾?蹂몃Ц","caption":"?몄뒪?洹몃옩 罹≪뀡","hashtags":["#?쒓렇"],"cardTopics":[{"cardNumber":1,"headline":"移대뱶 ?쒕ぉ","content":"移대뱶 ?댁슜","dataPoint":"?듭떖 ?섏튂"}]}`,
  shorts: `"shorts":{"title":"?륂뤌 ?쒕ぉ","duration":"20","hook":"泥?臾몄옣","scenes":[{"sceneNumber":1,"duration":"6","narration":"?섎젅?댁뀡","visualDescription":"Visual description in English","textOverlay":"?띿뒪???ㅻ쾭?덉씠"}],"cta":"留덈Т由?臾멸뎄","thumbnailPrompt":"Thumbnail prompt in English","uploadTitle":"YouTube ?쒕ぉ","uploadDescription":"YouTube ?ㅻ챸","hashtags":["#Shorts","#?쒓렇"]}`,
}

const CHANNEL_LABELS = {
  blog: '네이버 블로그',
  newsletter: '뉴스레터',
  instagram: '인스타그램',
  shorts: '유튜브 숏츠',
}

async function retryNonLongform(channels, summary, rawText, emphasis, options = {}) {
  const schemaLines = channels.map((channel) => CHANNEL_SCHEMAS[channel]).join(',\n  ')
  const channelNames = channels.map((channel) => CHANNEL_LABELS[channel]).join(', ')

  const prompt = `?뱀떊? 硫?곗콈??肄섑뀗痢??꾨왂媛?낅땲?? ?꾨옒 ?뺣낫瑜?諛뷀깢?쇰줈 ?ㅼ쓬 梨꾨꼸留??ㅼ떆 ?앹꽦?섏꽭?? ${channelNames}

## 怨듯넻 洹쒖튃
- 紐⑤뱺 ?レ옄, ?듦퀎, ?곕룄, ?섏튂???먮Ц 洹몃?濡??ъ슜?섏꽭??
- ?녿뒗 ?ъ떎??異붽??섏? 留덉꽭??
- 諛섎뱶??JSON留?異쒕젰?섏꽭??

## ?몄뒪?洹몃옩 洹쒖튃
- body, caption, cardTopics?먮뒗 markdown bold/emphasis(**, *, __, _)瑜??덈? ?ъ슜?섏? 留덉꽭??
${buildInstagramCardRules()}
${buildInstagramCaptionRules()}

## ?좏뒠釉??륂뤌 洹쒖튃
- hook, scenes[].narration, scenes[].textOverlay, cta, uploadTitle, uploadDescription?먮뒗 markdown bold/emphasis(**, *, __, _)瑜??덈? ?ъ슜?섏? 留덉꽭??

${buildBlogTitleRules()}
${buildBasePrompt(summary, rawText, emphasis, options)}

## 異쒕젰 ?ㅽ궎留?
{
  ${schemaLines}
}`

  const result = await callGeminiWithFallback(prompt, {
    temperature: 0.4,
    maxOutputTokens: 32768,
    jsonMode: true,
  })
  const parsed = parseJSON(result, null)
  if (!parsed) throw new Error('肄섑뀗痢??ъ깮??寃곌낵瑜??뚯떛?섏? 紐삵뻽?듬땲??')

  const output = {}
  for (const channel of channels) {
    output[channel] = parsed[channel] || null
  }
  if (output.instagram) output.instagram = sanitizeInstagramContent(output.instagram, { summary, rawText })
  if (output.shorts) output.shorts = sanitizeShortsContent(output.shorts)
  return output
}

export async function retryFailedChannels(channels, summary, rawText, emphasis, options = {}) {
  if (channels.length === 0) throw new Error('?ъ떆?꾪븷 梨꾨꼸???놁뒿?덈떎.')

  const results = await Promise.allSettled([
    retryNonLongform(channels, summary, rawText, emphasis, options),
  ])

  const output = {}
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      Object.assign(output, result.value)
    }
  }

  if (output.blog) output.blog = await finalizeBlogContent(output.blog)
  if (output.instagram) output.instagram = sanitizeInstagramContent(output.instagram, { summary, rawText })
  if (output.shorts) output.shorts = sanitizeShortsContent(output.shorts)
  if (Object.keys(output).length === 0) throw new Error('肄섑뀗痢??ъ깮??寃곌낵瑜??뚯떛?섏? 紐삵뻽?듬땲??')
  return output
}

export async function generateBlogContent(summary, rawText, emphasis, options = {}) {
  const prompt = `?뱀떊? ?ㅼ씠踰?釉붾줈洹??꾨Ц ?묎??낅땲?? ?꾨옒 ?뺣낫瑜?諛뷀깢?쇰줈 釉붾줈洹?湲???묒꽦?섏꽭??

## 怨듯넻 洹쒖튃
- 紐⑤뱺 ?レ옄, ?듦퀎, ?곕룄, ?섏튂???먮Ц 洹몃?濡??ъ슜?섏꽭??
- ?녿뒗 ?ъ떎??異붽??섏? 留덉꽭??
- ?뱀뀡? 3媛??댁긽 援ъ꽦?섏꽭??
- 釉붾줈洹?蹂몃Ц?먯꽌??markdown bold(**?띿뒪??*)留??ъ슜?대룄 ?⑸땲??
- 釉붾줈洹?蹂몃Ц?먯꽌??痍⑥냼??~~text~~, --text--)怨?italic(*text*, _text_)瑜??ъ슜?섏? 留덉꽭??
- ?쇱젙/?쒗뿕/?먯꽌?묒닔泥섎읆 ?좎쭨媛 ?듭떖??臾몄옣? \`?섎뒫: 11/15(紐?\`泥섎읆 ?쇱젙 ?쒕ぉ怨??좎쭨 援ш컙留?bold 泥섎━?섏꽭??
- 以묒슂???먮떒 ?ъ씤?멸? ?덈뒗 臾몄옣? 臾몄옣 ?꾩껜媛 ?꾨땲??\`?쇱닠\`, \`硫댁젒\`, \`理쒖??숇젰湲곗?\`泥섎읆 ?듭떖 ?ㅼ썙?쒕쭔 bold 泥섎━?섏꽭??
- 臾몄옣??湲몃㈃ 湲?援ъ젅 ?꾩껜瑜?bold 泥섎━?섏? 留먭퀬, ?좎쭨? ?듭떖 ?ㅼ썙???꾩＜濡쒕쭔 理쒖냼?쒖쑝濡?bold 泥섎━?섏꽭??
${buildBlogBodyLineBreakRules()}

${buildBlogTitleRules()}
${buildBasePrompt(summary, rawText, emphasis, options)}

## 異쒕젰 ?ㅽ궎留?
{"title":"釉붾줈洹??쒕ぉ","metaDescription":"硫뷀? ?ㅻ챸","sections":[{"heading":"?뱀뀡 ?쒕ぉ","keyPhrase":"?듭떖 ?ㅼ썙??,"content":"?뱀뀡 蹂몃Ц","imagePrompt":"Image prompt in English"}],"tags":["?쒓렇"],"summary":"湲 ?붿빟"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return await finalizeBlogContent(parseJSON(result, { title: '釉붾줈洹??앹꽦 ?ㅽ뙣', sections: [], tags: [], summary: '' }))
}

export async function generateNewsletterContent(summary, rawText, emphasis, options = {}) {
  const prompt = `?뱀떊? ?댁뒪?덊꽣 ?먮뵒?곗엯?덈떎. ?꾨옒 ?뺣낫瑜?諛뷀깢?쇰줈 ?댁뒪?덊꽣瑜??묒꽦?섏꽭??

## 怨듯넻 洹쒖튃
- 紐⑤뱺 ?レ옄, ?듦퀎, ?곕룄, ?섏튂???먮Ц 洹몃?濡??ъ슜?섏꽭??
- ?녿뒗 ?ъ떎??異붽??섏? 留덉꽭??
- ?댁뒪?덊꽣 蹂몃Ц? 硫붿씪 蹂듭궗???곹빀?섎룄濡??쎄린 ?쎄쾶 援ъ꽦?섏꽭??

${buildBasePrompt(summary, rawText, emphasis, options)}

## 異쒕젰 ?ㅽ궎留?
{"subject":"硫붿씪 ?쒕ぉ","preheader":"?꾨━?ㅻ뜑","greeting":"?몄궗留?,"headline":"?ㅻ뱶?쇱씤","keyPoints":["?듭떖 ?ъ씤??],"body":"蹂몃Ц","dataHighlights":[{"label":"??ぉ","value":"媛?}],"cta":{"text":"CTA","description":"?ㅻ챸"},"closingNote":"留덈Т由?臾멸뎄"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return parseJSON(result, { subject: '?댁뒪?덊꽣 ?앹꽦 ?ㅽ뙣', keyPoints: [], body: '', dataHighlights: [] })
}

export async function generateInstagramContent(summary, rawText, emphasis, options = {}) {
  const prompt = `?뱀떊? ?몄뒪?洹몃옩 肄섑뀗痢??꾨왂媛?낅땲?? ?꾨옒 ?뺣낫瑜?諛뷀깢?쇰줈 ?몄뒪?洹몃옩 寃뚯떆臾?蹂몃Ц怨?移대뱶 二쇱젣瑜??묒꽦?섏꽭??

## 怨듯넻 洹쒖튃
- 紐⑤뱺 ?レ옄, ?듦퀎, ?곕룄, ?섏튂???먮Ц 洹몃?濡??ъ슜?섏꽭??
- ?녿뒗 ?ъ떎??異붽??섏? 留덉꽭??
- body, caption, cardTopics?먮뒗 markdown bold/emphasis(**, *, __, _)瑜??덈? ?ъ슜?섏? 留덉꽭??
${buildInstagramCardRules()}

## caption ?묒꽦 洹쒖튃
${buildInstagramCaptionRules()}

${buildBasePrompt(summary, rawText, emphasis, options)}

## 異쒕젰 ?ㅽ궎留?
{"title":"寃뚯떆臾??쒕ぉ","body":"寃뚯떆臾?蹂몃Ц","caption":"?대え吏濡??쒖옉?섎뒗 吏㏃? 臾몃떒???몄뒪?洹몃옩 罹≪뀡 蹂몃Ц(350~600??","hashtags":["#?쒓렇"],"cardTopics":[{"cardNumber":1,"headline":"移대뱶 ?쒕ぉ","content":"移대뱶 ?댁슜","dataPoint":"?듭떖 ?섏튂"}]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return sanitizeInstagramContent(
    parseJSON(result, { title: '', body: '', caption: '', hashtags: [], cardTopics: [] }),
    { summary, rawText },
  )
}

export async function generateShortsScript(summary, rawText, emphasis, options = {}) {
  const prompt = `?뱀떊? ?좏뒠釉??륂뤌 ?ㅽ겕由쏀듃 ?묎??낅땲?? ?꾨옒 ?뺣낫瑜?諛뷀깢?쇰줈 20~30珥?遺꾨웾???륂뤌 ?蹂몄쓣 ?묒꽦?섏꽭??

## 怨듯넻 洹쒖튃
- 紐⑤뱺 ?レ옄, ?듦퀎, ?곕룄, ?섏튂???먮Ц 洹몃?濡??ъ슜?섏꽭??
- ?녿뒗 ?ъ떎??異붽??섏? 留덉꽭??
- scenes??3媛??댁긽?쇰줈 援ъ꽦?섏꽭??
- hook, scenes[].narration, scenes[].textOverlay, cta, uploadTitle, uploadDescription?먮뒗 markdown bold/emphasis(**, *, __, _)瑜??덈? ?ъ슜?섏? 留덉꽭??
- ?щ떦 ?섎젅?댁뀡? 1~2臾몄옣?쇰줈 吏㏐퀬 紐낇솗?섍쾶 ?묒꽦?섏꽭??

## ?낅줈??硫뷀??곗씠??洹쒖튃
- uploadTitle: 60???대궡
- uploadDescription: 200~400??
- hashtags: 8~12媛?諛곗뿴, #Shorts ?ы븿

${buildBasePrompt(summary, rawText, emphasis, options)}

## 異쒕젰 ?ㅽ궎留?
{"title":"?륂뤌 ?쒕ぉ","duration":"20","hook":"泥?臾몄옣","scenes":[{"sceneNumber":1,"duration":"6","narration":"?섎젅?댁뀡","visualDescription":"Visual description in English","textOverlay":"?띿뒪???ㅻ쾭?덉씠"}],"cta":"留덈Т由?臾멸뎄","thumbnailPrompt":"Thumbnail prompt in English","uploadTitle":"YouTube ?쒕ぉ","uploadDescription":"YouTube ?ㅻ챸","hashtags":["#Shorts","#?쒓렇"]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return sanitizeShortsContent(
    parseJSON(result, {
      title: '?륂뤌 ?蹂??앹꽦 ?ㅽ뙣',
      scenes: [],
      duration: '0',
      uploadTitle: '',
      uploadDescription: '',
      hashtags: [],
    }),
  )
}


import { callGeminiWithFallback, parseJSON } from './gemini-core'
import { findShortsVideoConcept } from '../utils/shortsVideoConcepts'
import { normalizeBlogTags } from '../utils/blogTags'
import {
  getBlogCategoryLabel,
  getBlogCategoryProfile,
  getBlogImageStyleLabel,
  getOrderedBlogCategoryProfiles,
  inferBlogCategoryHeuristically,
  isValidBlogCategoryId,
} from './blogCategoryProfile'

function stripMarkdownEmphasis(text = '') {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

function stripUnsupportedBlogFormatting(text = '') {
  return stripMarkdownEmphasis(text)
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/--([^-\n]+)--/g, '$1')
    .trim()
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

  const prompt = `당신은 블로그 섹션 라벨 편집자입니다. 아래 본문을 읽고 이미지용 짧은 제목인 keyPhrase와 본문 섹션 제목인 heading을 다시 정해주세요.

규칙:
- keyPhrase는 이미지 안에 들어갈 짧은 제목입니다.
- keyPhrase는 2~10자 내외의 짧은 명사구로 작성하세요.
- heading은 본문 섹션 제목입니다.
- heading은 keyPhrase보다 설명이 조금 더 있는 10~26자 내외 제목으로 작성하세요.
- keyPhrase와 heading은 완전히 같은 문구를 쓰지 마세요.
- 추상적인 표현(중요성, 변화, 활용, 개요, 효과)만 단독으로 쓰지 마세요.
- 문장형 표현(~입니다, ~합니다)은 피하세요.
- 새로운 사실은 추가하지 말고 본문 안의 핵심만 재구성하세요.
- JSON만 출력하세요.

블로그 제목: ${String(blogContext.title || '').trim() || '없음'}
블로그 요약: ${String(blogContext.summary || '').trim() || '없음'}
현재 heading: ${String(section?.heading || '').trim() || '없음'}
현재 keyPhrase: ${String(section?.keyPhrase || '').trim() || '없음'}

본문:
${content.slice(0, 1800)}

출력 스키마:
{"heading":"섹션 제목","keyPhrase":"핵심 키워드"}`

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

function applyRegexBold(content = '') {
  return String(content || '')
}

function applyBlogScheduleAndDateBold(content = '') {
  const slashDatePattern = String.raw`\d{1,4}[./-]\d{1,2}(?:[./-]\d{1,2})?`
  const koreanDatePattern = String.raw`\d{1,4}\s*년\s*\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?`
  const weekdayPattern = String.raw`(?:\s*(?:\([^)]+\)|\[[^\]]+\]|[월화수목금토일](?:요일)?))?`
  const rangePattern = String.raw`(?:\s*(?:~|부터)\s*(?:${slashDatePattern}|${koreanDatePattern})${weekdayPattern})?`
  const datePattern = String.raw`(?:${slashDatePattern}|${koreanDatePattern})${weekdayPattern}${rangePattern}`
  const labelPattern = String.raw`[\p{Script=Hangul}A-Za-z0-9·&+]{2,20}`
  const schedulePattern = new RegExp(
    String.raw`(${labelPattern}\s*(?:[:：]\s*|\s+)?${datePattern})`,
    'gu',
  )
  const bareDatePattern = new RegExp(String.raw`(?<!\*)(${datePattern})(?!\*)`, 'gu')

  let nextContent = applyRegexBold(content, schedulePattern)
  nextContent = applyRegexBold(nextContent, bareDatePattern)
  return nextContent
}

function applySingleBold(content = '') {
  return content
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
    // \ubb38\uc7a5 \uc885\uacb0(\ub9c8\uce68\ud45c\u00b7\uc885\uacb0\uc5b4\ubbf8) \ub4a4\uc5d0 \ub77c\ubca8\uc774 \uc774\uc5b4\uc9c0\uba74 \ub77c\ubca8\uc744 \uc0c8 \uc904\ub85c \ub0b4\ub9b0\ub2e4.
    // \ub2e8 \ub9c8\uce68\ud45c \uc55e\uc774 \uc22b\uc790\uba74 \ub0a0\uc9dc("2026.04.14.")\uc758 \uc77c\ubd80\uc774\ubbc0\ub85c \ubb38\uc7a5 \ub05d\uc73c\ub85c \ubcf4\uc9c0 \uc54a\ub294\ub2e4.
    // (\uc774 \ucc98\ub9ac\uac00 \uc5c6\uc73c\uba74 "2026.04.14." \uc758 \ub9c8\uce68\ud45c\ub97c \ubb38\uc7a5 \ub05d\uc73c\ub85c \uc624\uc778\ud574 \ub0a0\uc9dc\uac00 \ud1a0\ub9c9\ub09c\ub2e4.)
    .replace(
      /(?<!\d)([.!?\u3002\uff01\uff1f]|\ub2e4|\uc694|\uc8e0|\ud568|\uc74c|\ub428|\uc784)\s+(?=.{2,28}?\s*[:\uff1a])/g,
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
      ? content.scenes.map((scene) => {
          // caption 이 새 표준. 옛 데이터에 narration 만 있으면 caption 으로 끌어올린다.
          const caption = stripMarkdownEmphasis(scene?.caption || scene?.narration || '')
          return {
            ...scene,
            caption,
            textOverlay: stripMarkdownEmphasis(scene?.textOverlay || ''),
          }
        })
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

function normalizeBlogCategorySelection(selection = {}) {
  const finalCategoryId = selection?.finalCategoryId || selection?.categoryId || ''
  if (!isValidBlogCategoryId(finalCategoryId)) return null

  const recommendedCategoryId = isValidBlogCategoryId(selection?.recommendedCategoryId)
    ? selection.recommendedCategoryId
    : null
  const recommendedImageStyle = selection?.recommendedImageStyle
    || getBlogCategoryProfile(recommendedCategoryId || finalCategoryId)?.recommendedImageStyle
    || null

  return {
    mode: selection?.mode === 'manual' ? 'manual' : 'auto',
    recommendedCategoryId,
    recommendedCategoryLabel: recommendedCategoryId ? getBlogCategoryLabel(recommendedCategoryId) : '',
    finalCategoryId,
    finalCategoryLabel: getBlogCategoryLabel(finalCategoryId),
    confidence: selection?.confidence || '',
    reason: selection?.reason || '',
    recommendedImageStyle,
    recommendedImageStyleLabel: recommendedImageStyle ? getBlogImageStyleLabel(recommendedImageStyle) : '',
  }
}

function buildManualBlogCategorySelection(categoryId) {
  if (!isValidBlogCategoryId(categoryId)) return null
  const profile = getBlogCategoryProfile(categoryId)
  return normalizeBlogCategorySelection({
    mode: 'manual',
    finalCategoryId: categoryId,
    confidence: 'manual',
    reason: '사용자가 프롬프트 설정에서 블로그 카테고리를 직접 선택했습니다.',
    recommendedImageStyle: profile?.recommendedImageStyle || '',
  })
}

function buildBlogCategoryRecommendationPrompt(summary, rawText, emphasis) {
  const categoryGuide = getOrderedBlogCategoryProfiles()
    .map((profile) => {
      const hints = profile.classifierHints.join(', ')
      return `- ${profile.id}: ${profile.label} | ${profile.goal} | 단서: ${hints}`
    })
    .join('\n')

  return `당신은 네이버 블로그 콘텐츠 분류자입니다. 아래 입력을 읽고 가장 적합한 블로그 카테고리 1개만 고르세요.

카테고리 목록:
${categoryGuide}

분류 규칙:
- 반드시 categoryId는 위 목록 중 하나만 반환하세요.
- 글의 중심 목적과 전개 방식을 기준으로 고르세요.
- "입시 및 학습 전략 (글 위주)"는 성적, 과목, 공부법, 실행 전략을 문단 중심으로 풀어 설명하는 글입니다.
- "입시 및 학습 전략 (키워드 위주)"는 제도 변화, 전형 운영 포인트, 방향 전환을 핵심 키워드 중심으로 정리하는 글입니다.
- JSON만 출력하세요.

요약 데이터:
${JSON.stringify(summary, null, 2)}

강조 요청:
${String(emphasis || '').trim() || '없음'}

원문 일부:
${String(rawText || '').slice(0, 5000)}

출력 스키마:
{"categoryId":"admissions_strategy_style_1","confidence":"high","reason":"한 문장 설명"}`
}

export async function recommendBlogCategory(summary, rawText, emphasis, options = {}) {
  if (options.enableBlogCategory === false) return null

  const manualSelection = buildManualBlogCategorySelection(options.blogCategoryId)
  if (options.blogCategoryMode === 'manual' && manualSelection) {
    return manualSelection
  }

  const existingSelection = normalizeBlogCategorySelection(options.blogCategorySelection)
  if (existingSelection) {
    return existingSelection
  }

  const fallbackCategoryId = inferBlogCategoryHeuristically([
    summary?.title || '',
    summary?.summary || '',
    ...(Array.isArray(summary?.keywords) ? summary.keywords : []),
    ...(Array.isArray(summary?.insights) ? summary.insights : []),
    String(rawText || '').slice(0, 4000),
    String(emphasis || ''),
  ].join(' '))

  try {
    const result = await callGeminiWithFallback(
      buildBlogCategoryRecommendationPrompt(summary, rawText, emphasis),
      {
        temperature: 0.1,
        maxOutputTokens: 1024,
        jsonMode: true,
      },
    )
    const parsed = parseJSON(result, null)
    const recommendedCategoryId = isValidBlogCategoryId(parsed?.categoryId)
      ? parsed.categoryId
      : fallbackCategoryId

    return normalizeBlogCategorySelection({
      mode: 'auto',
      recommendedCategoryId,
      finalCategoryId: recommendedCategoryId,
      confidence: String(parsed?.confidence || '').trim() || 'medium',
      reason: String(parsed?.reason || '').trim() || '요약과 원문 주제를 기준으로 자동 분류했습니다.',
      recommendedImageStyle: getBlogCategoryProfile(recommendedCategoryId)?.recommendedImageStyle || '',
    })
  } catch {
    return normalizeBlogCategorySelection({
      mode: 'auto',
      recommendedCategoryId: fallbackCategoryId,
      finalCategoryId: fallbackCategoryId,
      confidence: 'fallback',
      reason: '자동 분류 응답이 불안정해 키워드 기반 보조 규칙으로 분류했습니다.',
      recommendedImageStyle: getBlogCategoryProfile(fallbackCategoryId)?.recommendedImageStyle || '',
    })
  }
}

function buildBlogCategoryInstruction(selection = null) {
  if (!selection?.finalCategoryId) return ''
  const profile = getBlogCategoryProfile(selection.finalCategoryId)
  if (!profile) return ''

  const categorySpecificInstruction = selection.finalCategoryId === 'lecture_event'
    ? `
- 강연/특강 카테고리는 일반 칼럼형 글보다 공지형 안내문에 가깝게 작성하세요.
- 도입 소개는 본문 1개 문단 분량 이내로 짧게 끝내고, 일정 소개 전에 긴 배경 설명을 넣지 마세요.
- 독자가 가장 먼저 알아야 할 일정, 일시, 대상, 장소/진행 방식, 신청 방법, 마감 정보를 본문 앞부분에 우선 배치하세요.
- 섹션 순서는 가능하면 "일시 및 진행 방식" -> "강의 내용" -> "강사 소개" -> "참여 기대 효과" 흐름을 따르세요.
- 실제 원문에 일시 정보가 있으면 "일시" 또는 "일시 및 진행 방식" 섹션을 반드시 앞쪽에 두세요.
- 실제 원문에 강의 주제/커리큘럼 정보가 있으면 "강의 내용" 섹션으로 따로 묶어 핵심만 정리하세요.
- 실제 원문에 강사 정보가 있으면 "강사 소개" 섹션을 분리하고, 핵심 이력만 짧게 요약하세요.
- 가능하면 실제 출력 구조를 아래 흐름에 가깝게 맞추세요:
  1) 짧은 오프닝 1문단
  2) "일시" 섹션
  3) "강의 내용" 섹션
  4) "강사 소개" 섹션
  5) "참여 기대 효과" 섹션
- "일시", "강의 내용", "강사 소개"는 본문 안의 진짜 소제목처럼 분리해서 보여주세요.
- 가능하면 소제목 앞에 이모지를 붙여 가독성을 높이세요. 예:
  - "📅 일시"
  - "💡 강의 내용" 또는 "📌 강의 내용"
  - "👨‍🏫 강사 소개" 또는 "🎤 강사 소개"
- "일시", "강의 내용", "강사 소개" 같은 짧고 직접적인 제목을 우선 사용하고, 길고 설명형인 섹션 제목은 피하세요.
- 각 섹션 본문은 2~4줄 이내 또는 불릿 목록 위주로 짧게 정리하세요.
- "일시" 섹션은 가능하면 날짜, 시간, 라이브/녹화 여부를 줄바꿈이나 불릿으로 바로 보여주세요.
- "일시" 섹션에서는 한 줄에 한 항목만 쓰세요. 예: "강의 일시: ..."<줄바꿈>"라이브 강의 시간: ..."<줄바꿈>"영상 송출 시간: ...".
- "일시" 섹션에서 여러 항목을 쉼표로 한 줄에 이어 쓰거나 긴 문단으로 합치지 마세요.
- "강의 내용" 섹션은 '강의 내용: ...' 형식으로 시작하고, 필요하면 아래 줄에 핵심 포인트를 짧게 덧붙이세요.
- "강사 소개" 섹션은 '강사 소개: ...' 형식으로 시작하고, 필요하면 아래 줄에 핵심 이력을 짧게 덧붙이세요.
- "강사 소개" 섹션은 가능하면 첫 줄에 "강사 소개: 홍길동 소장님"처럼 이름과 직함만 적고, 다음 줄부터는 이력을 한 줄씩 나눠 쓰세요. 예: "현) ..."<줄바꿈>"현) ..."<줄바꿈>"전) ...".
- "강사 소개" 섹션에서도 이력 여러 개를 한 문장이나 한 줄로 이어 붙이지 마세요.
- 마지막 섹션 제목은 가능하면 "참여 기대 효과"로 쓰고, "참여 기대 효과 및 신청 안내"처럼 길게 늘이지 마세요.
- "일시", "강의 내용", "강사 소개", "참여 기대 효과" 섹션은 가능한 한 같은 정보형 포맷을 유지하세요. 한 섹션만 갑자기 긴 줄글 문단으로 쓰지 마세요.
- 특히 "강의 내용"과 "강사 소개"는 설명형 문단보다 '항목명: 내용' 형태를 우선 사용하세요.
- 안내문처럼 빠르게 훑어볼 수 있어야 하므로, 긴 서술형 문단 2개 이상을 연속으로 쓰지 마세요.
- 강연 소개나 참여 기대효과는 짧게만 덧붙이고, 장황한 필요성 설명이나 감성적인 문제 제기는 피하세요.
- 강연자 소개가 필요하더라도 2~3문장 이내로 압축하고 핵심 이력만 남기세요.
- 본문은 핵심 포인트 위주로 짧은 섹션, 짧은 문단, 불릿 정리를 적극 활용하세요.
- "절호의 기회", "놓치지 마세요", "미래를 위한 중요한 투자"처럼 과장된 홍보 문구는 최소화하세요.
- 같은 의미를 반복해서 설득하지 말고, 신청 판단에 필요한 사실 정보 중심으로 정리하세요.
`
    : selection.finalCategoryId === 'admissions_strategy_style_1'
      ? `
- 이 카테고리는 본문 위에 별도의 "글 소개" 단락을 출력합니다. 반드시 blog.introduction 필드를 2~5문장 분량으로 채우세요.
- blog.introduction 에는 제목, 소제목, 헤딩 표기를 넣지 말고, 본문 전체에 어떤 내용이 담겨 있는지 한눈에 알 수 있는 도입 글만 자연스러운 문단으로 작성하세요.
- blog.introduction 은 본문 sections[].content 와 내용이 중복되지 않게, 전체 주제와 흐름만 안내하는 톤으로 쓰세요.
- 본문 sections[].content 는 글이 흐르는 줄글로 작성하되, 각 문장은 한 줄에 하나씩 끝나도록 길이를 조절하세요.
- 한 문장을 여러 줄로 쪼개지 말고, 문장 끝(., !, ?, 다., 요., 죠., 까?)이 명확하게 드러나도록 마침표/물음표/느낌표를 빠뜨리지 마세요.
`
      : selection.finalCategoryId === 'knowledge_insight'
      ? `
- 이 카테고리는 결과를 카드뉴스 형태로 보여줍니다. 각 섹션마다 sections[].cardSummary 필드를 반드시 채워주세요.
- cardSummary.headline 은 해당 섹션의 가장 강한 주장이나 결론을 12자 안팎의 한 줄로 압축한 카피문이어야 합니다. 마침표·물음표·느낌표 1개까지만 허용합니다.
- cardSummary.bullets 는 3~5개 항목 배열로, 각 항목은 한 줄 분량(20~35자)으로 압축해 작성합니다.
- 불릿은 다음 패턴 중 자연스럽게 어울리는 형태로 작성하세요:
  1) 주장형: "공부할 때 뇌 구조가 실제로 변한다"
  2) 등식형: "신경가소성(neuroplasticity) = 뇌는 평생 바뀔 수 있음"
  3) 인과/사례형: "저글링 연습 → 뇌 회색질 증가"
- 불릿은 본문 sections[].content 의 흐름과 핵심 키워드, 등장하는 인물·연구·예시·수치를 분석해 추출하세요.
- "다음은…", "이것이…", "여기서…" 같은 도입 어구는 쓰지 말고 명사구·단정문 위주로 정리하세요.
- 본문을 읽지 않고 cardSummary 만 봐도 섹션의 주제와 근거를 즉시 이해할 수 있어야 합니다.
- cardSummary 와 본문 content 는 짝꿍입니다. content 는 평소처럼 줄글로 작성하되, 카드 요약 라인이 본문에 등장하는 사실에 근거하도록 일관성을 유지하세요.
`
      : selection.finalCategoryId === 'interview_prep'
      ? `
- 이 카테고리는 대입면접 준비 글입니다. 원문 성격을 먼저 판단해 두 흐름 중 하나로 작성하세요.
  - (A) 학과/계열별 분리형: 원문에 학과·전공·계열이 2개 이상 등장하거나, 분야별 예상 질문·답변 포인트가 정리돼 있는 경우
  - (B) 준비 매뉴얼형: 원문이 면접 절차, 자세, 마음가짐, 단계별 준비 팁 중심인 경우
- 두 흐름 공통 규칙:
  - 도입부(introduction 또는 첫 섹션)에서는 "면접관이 무엇을 평가하는지"를 1~2문장으로 명확히 짚으세요.
  - 단순 지식 암기가 아니라 사고 과정, 문제 해결 능력, 사회적 가치 연결을 평가한다는 점을 본문 흐름 속에서 자연스럽게 드러내세요.
  - 마지막 섹션 제목은 "정리" 또는 "마무리"로 두고, "추천 답변은 참고용이며 자신의 경험과 가치관을 자신의 언어로 재구성해야 진정성을 보여줄 수 있다"는 메시지를 반드시 포함하세요.
  - 한 섹션 본문은 3~5문장 이내로 압축하고, 빠르게 훑어볼 수 있는 정보형 포맷을 유지하세요.

- (A) 학과/계열별 분리형 규칙:
  - 섹션 heading 은 학과·전공 단위로 번호를 붙여 분리하세요. 예: "1) 건축학·건축공학과", "2) 기계·로봇공학과", "3) 경영학"
  - 한 섹션 본문은 두 블록으로 구성합니다:
    1) "면접 문항 예시" — 3~5개의 예상 질문을 한 줄에 하나씩 나열
    2) "추천 답변 포인트" — 각 질문에 대응하는 답변 방향 3~5개를 짧은 줄로 정리
  - 추천 답변 포인트는 다음 황금 흐름을 따르세요: "개념 정리 → 시사·사회 연계 → 본인 경험·가치관".
  - 학과별 특성 키워드(예: CSR, 신소재, CAR-T, IoT, 기회비용, CSR 등)는 한 줄로 간결하게 정의 + 의미 부여하세요.
  - 질문/답변 포인트는 한 문단에 묻지 말고 한 줄에 하나씩 분리해 가독성을 유지하세요.

- (B) 준비 매뉴얼형 규칙:
  - 섹션 heading 은 준비 단계 단위로 번호를 붙이세요. 예: "1. 면접은 이미 시작됐다", "2. 면접 당일, 마음가짐부터 다져라", "3. 면접 절차 & 유의사항"
  - 각 단계 본문은 짧은 한 문단 + 실전 행동 항목 리스트로 구성하세요. 리스트 머리에는 "👉", "✔", "📌" 같은 짧은 마커를 자유롭게 사용해도 좋습니다.
  - 행동 항목은 학교 자원 활용, 가족 모의 면접, 거울 연습, 영상 촬영, 입실 자세, 시선 처리, 말투/속도 조절 같은 구체적 디테일까지 포함하세요.
  - 단계 사이가 자연스럽게 이어지도록 "면접은 이미 시작됐다 → 당일 마음가짐 → 절차 → 마무리" 흐름을 유지하세요.
  - 1~2개 섹션 정도는 짧은 명언을 인용해 동기 부여 톤을 더해도 좋습니다(과하지 않게, 출처를 함께 표기).

- 카드뉴스 시각화 규칙 (지식 공유 카드뉴스와 동일 포맷):
  - 모든 섹션에 sections[].cardSummary 를 반드시 채워주세요.
  - cardSummary.headline 은 12자 안팎의 한 줄 카피로, (A) 학과별 글이면 학과·전공 핵심 키워드 압축, (B) 매뉴얼형 글이면 단계 한 줄 메시지를 담으세요. 마침표·물음표·느낌표는 1개까지만 허용합니다.
  - cardSummary.bullets 는 3~5개 항목 배열로, 각 항목은 한 줄(20~35자) 분량으로 압축하세요.
  - 불릿은 다음 패턴 중 자연스럽게 어울리는 형태를 따르세요:
    1) 주장형: "단순 암기 X, 사고 흐름이 평가 기준"
    2) 등식형: "CSR = 이익 + 지속가능성·사회 신뢰"
    3) 인과/사례형: "예산 관리 경험 → 회계 신뢰성 강조"
  - (A) 학과별 글의 cardSummary.bullets 는 추천 답변 포인트 핵심 줄을 압축한 형태로 정리하세요.
  - (B) 매뉴얼형 글의 cardSummary.bullets 는 그 단계의 실전 행동·체크 포인트를 압축한 형태로 정리하세요.
  - cardSummary 만 봐도 섹션의 평가 포인트와 답변/준비 방향을 즉시 이해할 수 있어야 합니다.
  - 본문 sections[].content 는 평소 흐름대로 작성하되, 카드 요약 라인이 본문에 등장하는 사실과 일치하도록 일관성을 유지하세요.
`
      : selection.finalCategoryId === 'admissions_strategy_style_2' || selection.finalCategoryId === 'book_promo'
      ? `
- 이 카테고리는 긴 줄글형 칼럼보다 "이모지 소제목 + 핵심 포인트 리스트 + 짧은 결론" 구조를 우선하세요.
- 한 문단은 1~2문장, 길어도 3문장을 넘기지 마세요.
- 본문은 가능한 한 아래 같은 흐름으로 구성하세요:
  1) 짧은 도입 1~2문장
  2) 이모지가 붙은 짧은 소제목
  3) "👉", "✔", "✅", "📌", "⚠️" 같은 리스트 항목 2~5개
  4) 적용 방법 또는 대응 포인트
  5) "💡 마무리 한 줄" 또는 그에 준하는 짧은 결론
- 소제목은 길게 설명하지 말고 짧은 블록형 제목을 사용하세요. 예:
  - "📚 핵심 변화"
  - "🧠 이렇게 준비하세요"
  - "⚠️ 놓치기 쉬운 포인트"
  - "💡 마무리 한 줄"
- 줄글 설명보다 리스트를 우선하세요. 중요한 정보는 문단 속에 묻지 말고 한 줄 항목으로 분리하세요.
- 체크리스트/포인트 항목은 한 줄 또는 두 줄 안에서 끝내세요.
- 번호형 흐름이 필요한 경우 "1)", "2)" 또는 "첫째", "둘째" 같은 짧은 단계형 구조를 사용하세요.
- "무엇이 바뀌었는지", "왜 중요한지", "어떻게 대응할지"가 바로 보이게 구성하세요.
- 연재형 맥락이나 최근 변화 언급은 도입부 1~2문장 안에서만 짧게 처리하고, 본문은 바로 핵심 포인트 정리로 들어가세요.
- 마무리는 일반적인 요약 문단보다 "👉 결론적으로 ...", "💡 결국 중요한 것은 ..." 같은 한 줄 메시지에 가깝게 쓰세요.
- 도서 카테고리라면 위 형식을 유지하되, 책의 핵심 메시지·읽을 가치·독자에게 주는 시사점을 리스트형으로 정리하세요.
- 도서 카테고리에서는 홍보성 수식보다 "이 책이 지금 왜 유효한가", "무엇을 얻을 수 있는가", "어디에 적용해 볼 수 있는가"를 짧은 포인트로 보여주세요.
`
      : selection.finalCategoryId === 'concept_digest'
      ? `
- 교과서 개념 정리 카테고리는 일반 정보형 블로그나 SEO형 설명문이 아니라, 학생 대상 탐구형 학습 블로그로 작성하세요.
- 글의 목표는 개념을 한 번에 많이 설명하는 것이 아니라, 학생이 예시를 따라오며 개념을 이해하고 스스로 생각해 보게 만드는 것입니다.
- 첫 문단부터 "~란 무엇인가" 식으로 정의를 길게 설명하지 마세요.
- 도입은 짧은 예시, 관찰, 질문, 비유, 흥미로운 상황 제시로 시작하고, 정의는 그 다음에 자연스럽게 배치하세요.
- 주제 전개는 가능하면 다음 흐름을 따르세요:
  1) 짧은 도입 또는 예시
  2) 핵심 개념 소개
  3) 탐구 활동 또는 따라 해볼 수 있는 단계
  4) 확장 개념 / 추가 예시 / 배경 설명
  5) 생각해 보기 / 미션 / 질문
  6) 실생활 활용 또는 의미
  7) 열린 마무리
- 단순 요약형 문단 나열보다, 수업 시간에 교사가 설명하고 활동을 안내하는 흐름처럼 구성하세요.
- 원문에 활동, 단계, 예시, 미션, 질문이 있으면 그 순서와 구조를 최대한 보존하세요.
- "탐구 활동", "활동 방법", "예시", "미션", "생각해 봅시다", "학습 포인트" 같은 학습 블록을 필요할 때 적극적으로 사용하세요.
- 학생이 직접 따라 할 수 있는 활동이 있다면 번호 목록이나 단계형 형식으로 분명하게 나누세요.
- 활동형 섹션은 설명문 한 덩어리로 합치지 말고, 학습지처럼 블록 형태로 분리하세요.
- 예를 들어 "탐구 활동 1", "준비물", "활동 방법", "예", "미션", "생각해 봅시다"는 각각 단독 줄 또는 단독 소제목처럼 배치하세요.
- "활동 방법" 아래 단계는 한 줄에 하나씩만 쓰세요. 예: "1️⃣ ..."<줄바꿈>"2️⃣ ..."<줄바꿈>"3️⃣ ..."
- 번호 단계 여러 개를 한 문단 안에 이어 쓰지 마세요.
- 예시 수식이나 숫자 예시는 가능하면 한 줄에 하나씩 배치하세요. 예: "12 = 2 × 2 × 3"<줄바꿈>"30 = 2 × 3 × 5"
- "예", "미션", "질문", "연습" 뒤에 나오는 항목도 가능한 한 한 줄에 하나씩 나누세요.
- 연도/발견 방법/분류 항목처럼 표에 가까운 정보는 긴 문장으로 설명하지 말고 줄 단위 목록처럼 정리하세요.
- 소제목은 블로그형 수사 제목보다 학습지형 짧은 제목을 우선 사용하세요. 예: "탐구 활동 1", "메르센 소수", "생각해 봅시다"
- 소제목 다음 첫 문단도 길게 설명하지 말고, 바로 예시/활동/핵심 규칙으로 들어가세요.
- 설명은 길게 이어 쓰지 말고, 한 문단은 2~4문장 이내로 짧게 유지하세요.
- 긴 설명 문단이 3개 이상 연속되지 않게 하세요.
- 중요한 규칙, 조건, 특징은 체크포인트나 목록으로 정리하세요. 예: "✔ 앞의 두 수를 더하면 다음 수"
- 소제목은 딱딱한 교과서식 제목보다, 개념을 따라가고 싶게 만드는 표현을 우선 사용하세요.
- 일반 상식이나 배경지식을 보강하더라도 원문에 없는 흔한 사례를 과하게 추가하지 마세요.
- 백과사전식 정의 나열, SEO형 정보 구성, 지나치게 일반적인 개념 해설은 피하세요.
- 학생에게 직접 말을 거는 수업형 톤을 유지하세요. 예: "~해봅시다", "~찾아보세요", "왜 그럴까요?"
- 마무리는 닫힌 결론형 요약보다, 다음 탐구로 이어지는 질문이나 생각거리로 끝내세요.
- "이해하는 계기가 되길 바랍니다" 같은 일반적인 마무리는 피하고, 학생이 한 번 더 생각하게 만드는 문장으로 끝내세요.
- 출력은 "읽는 블로그"보다 "바로 수업에 쓸 수 있는 학습 자료"처럼 보여야 합니다.
`
    : ''

  return `
## 블로그 카테고리 가이드
- 적용 카테고리: ${profile.label}
- 작성 목적: ${profile.goal}
- 제목 패턴: ${profile.titlePattern}
- 도입 방식: ${profile.introPattern}
- 본문 구조: ${profile.bodyPattern.join(' -> ')}
- CTA 강도: ${profile.ctaLevel}
${profile.promptLines.map((line) => `- ${line}`).join('\n')}
${categorySpecificInstruction}
`
}

function withBlogCategoryMetadata(content, selection) {
  if (!content || !selection?.finalCategoryId) return content
  return {
    ...content,
    categoryInfo: normalizeBlogCategorySelection(selection),
  }
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
    parts.push(`- 전체 톤: ${toneMap[options.tone]}`)
  }
  if (options.commonExtra) parts.push(`- 공통 추가 지시: ${options.commonExtra}`)
  if (options.blogExtra) parts.push(`- 블로그 추가 지시: ${options.blogExtra}`)
  if (options.newsletterExtra) parts.push(`- 뉴스레터 추가 지시: ${options.newsletterExtra}`)
  if (options.instaExtra) parts.push(`- 인스타그램 추가 지시: ${options.instaExtra}`)
  if (options.shortsExtra) parts.push(`- 숏폼 추가 지시: ${options.shortsExtra}`)

  if (!parts.length) return ''

  return `
## 사용자 설정
아래 설정은 기본 규칙보다 우선해서 반영하세요.
${parts.join('\n')}
`
}

function buildBlogTitleRules() {
  return `
## 블로그 제목 규칙
- 형식: "핵심 키워드, 설명 문장"
- 검색량이 높은 핵심 키워드 1~2개를 제목 맨 앞에 배치하세요.
- 구분자는 쉼표(,)만 사용하세요.
- 콜론(:), 파이프(|)는 사용하지 마세요.
- 연도, 대상, 부가 설명은 뒤쪽에 배치하세요.
- 제목은 30자 안팎으로 간결하게 유지하세요.
`
}

function buildBlogBodyLineBreakRules() {
  return `
## Blog body line break rules
- Do not split one complete sentence across multiple lines. Keep one sentence on one line.
- For "A: B" content, keep it on one line when B is one sentence.
- For "A: B, C, D" content, keep it on one line if B/C/D are short. If the comma-separated items are long or explanatory, write "A:" and put the item text on the next line.

## 블로그 본문 줄바꿈 규칙
- sections[].content에서는 새 섹션을 만들 정도는 아니지만 내용의 흐름이 바뀌는 지점에 줄바꿈을 넣으세요.
- 일정, 기간, 대상, 준비물, 요청 방법, 핵심 변화처럼 제목과 값이 이어지는 내용은 "항목:" 다음 줄에 실제 내용을 적으세요.
- 강연/특강 카테고리에서는 "강의 일시:", "라이브 강의 시간:", "영상 송출 시간:", "강사 소개:"처럼 항목명이 나오면 각 항목을 반드시 새 줄에 하나씩 배치하세요.
- 강연/특강 카테고리에서 "현)", "전)"으로 시작하는 이력은 각각 독립된 한 줄로 쓰고 같은 줄에 이어 붙이지 마세요.
  예: "수능 일정:\n11/11 (목)"
- 한 문단 안에서 "먼저", "다음으로", "또한", "반면", "한편", "구체적으로", "특히", "마지막으로"처럼 설명 흐름이 바뀌면 해당 문장 앞에서 줄바꿈하세요.
- 완전히 다른 주제는 기존처럼 별도 section으로 나누고, 같은 section 안의 세부 내용 변화만 줄바꿈으로 정리하세요.

## 일정·날짜 작성 규칙
- 학사일정, 시험 일정, 정기고사, 전국연합학력평가, 모의평가처럼 날짜·일정 정보는 절대 한 문장/한 문단에 평문으로 뭉쳐 쓰지 마세요.
- 일정 항목은 반드시 한 항목당 한 줄로 작성하세요. 여러 일정을 콜론(:)으로 줄줄이 이어 붙이지 마세요.
  나쁜 예: "9.02.(수) 2학기 1차 정기고사: 전국연합학력평가: 10.20.(화) 개인의 흥미와 적성을..."
  좋은 예:
  "9.02.(수) 2학기 1차 정기고사
  10.20.(화) 전국연합학력평가"
- 날짜·일정 항목과 그에 대한 설명 문장은 같은 줄에 콜론으로 잇지 말고, 일정 목록을 먼저 한 줄씩 나열한 뒤 설명은 빈 줄로 띄워 별도 문단으로 작성하세요.
- 여러 달을 나열할 때는 "3월5월", "9월10월"처럼 붙여 쓰지 말고 반드시 "3월, 5월", "9월, 10월"처럼 쉼표로 구분하세요. 원문이 붙어 있더라도 분리해서 쓰세요.
- 날짜 표기는 원문 수치를 그대로 쓰되 "3.24.(화)"처럼 날짜 토큰이 끝나면 그 뒤에 일정명만 짧게 붙이고, 긴 설명 문장은 다음 줄/다음 문단으로 내리세요.

## 표 데이터 작성 규칙
- 블로그 본문에 마크다운 표(예: "| 열 | 열 |", 구분행 "|:-|:-|")를 절대 사용하지 마세요. 네이버 블로그 에디터는 마크다운 표를 렌더링하지 못해 "| 글자 |" 가 그대로 노출됩니다.
- 등급별 비율, 과목별 출제범위처럼 표 형태 데이터는 항목당 한 줄의 평문으로 풀어 쓰세요.
  나쁜 예: "| 등급 | 비율 | 누적 | | 1등급 | 10% | 10% |"
  좋은 예:
  "1등급: 비율 10%, 누적 10%
  2등급: 비율 24%, 누적 34%"
- 각 행은 "대표 항목: 항목명 값, 항목명 값" 형태로 한 줄씩 작성하세요.

## 이모지 작성 규칙 (RPA 업로드 안전성)
- 이모지로 항목을 시작할 때는 반드시 "이모지 텍스트" 형식으로 작성하세요. 이모지 바로 뒤에 공백 1개를 넣고 그 다음에 한국어 텍스트를 이어 쓰세요.
  좋은 예: "💡 학생부 작성 시 핵심 포인트는 …", "✔ 모의평가 일정 정리", "🎯 6월 모의평가 가채점 등급 확인"
  나쁜 예: "💡:학생부", "💡-학생부", "💡학생부", "  💡 학생부" (앞에 들여쓰기/공백 금지, 이모지와 텍스트 사이는 반드시 일반 공백 1개)
- 이모지로 시작하는 줄은 자체로 한 줄을 이룹니다. 같은 줄에 여러 이모지 항목을 이어 쓰지 마세요.
- 한 단락 안에서는 이모지를 줄 맨 앞에만 쓰세요. 줄 중간에 장식 이모지를 흩뿌리지 마세요.
`
}

function buildUniversityListContentRules() {
  return `
## University list content rules
- If the source or summary contains multiple universities with separate conditions, schedules, admissions tracks, evaluation standards, or preparation points, do not focus on only one university.
- Mention several real universities from the source together in the newsletter and Instagram output.
- Use comparison-style wording such as "A and B are ..., C and D are ..., while F is ..." so the reader can see differences across universities.
- When selecting examples from a long university list, choose several recognizable or important universities from the source without inventing any university that is not present.
- If only representative universities are shown, naturally add "등" to signal that the source contains more universities.
- Apply this rule to newsletter keyPoints, newsletter body, newsletter dataHighlights, Instagram caption, and Instagram cardTopics.

Example:
If the source says Konkuk University, Sungkyunkwan University, Seoul National University, Korea University, and Yonsei University each have different admissions checks, write like:
"건국대와 성균관대는 학생부와 수능 최저 확인이 중요하고, 서울대는 면접과 학과 연계 활동 준비가 핵심이며, 고려대와 연세대도 전형별 제출 서류 차이를 확인해야 하는 등 대학별 준비 포인트가 다릅니다."
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
## 입력 데이터
### 요약 데이터
${JSON.stringify(summary, null, 2)}

### 원문
${rawText.slice(0, 8000)}
${buildEmphasisInstruction(emphasis)}
${buildOptionsInstruction(options)}
`
}

async function generate4Channels(summary, rawText, emphasis, options = {}) {
  const prompt = `당신은 멀티채널 콘텐츠 기획자입니다. 아래 정보를 바탕으로 블로그, 뉴스레터, 인스타그램, 유튜브 숏폼 콘텐츠를 한 번에 생성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실은 추가하지 마세요.
- 각 채널별 형식과 독자 기대에 맞게 다시 써주세요.
- 반드시 JSON만 출력하세요.

${buildBlogTitleRules()}

## 인스타그램 규칙
- body, caption, cardTopics에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
${buildInstagramCardRules()}
${buildInstagramCaptionRules()}

## 유튜브 숏폼 규칙
- hook, scenes[].caption, scenes[].textOverlay, cta, uploadTitle, uploadDescription에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- 각 씬에는 scenes[].caption 을 작성하세요. **caption은 화면 자막으로 표시되는 동시에 HeyGen TTS 음성으로도 그대로 읽힙니다.** 따라서 자막 가독성을 우선해 숫자·분수·단위·기호는 원래 표기(12.3, 30%, $100, 5:3, 12.21.(월), 오후 3시 30분 등)를 그대로 유지하세요. HeyGen TTS 는 이 원본 표기를 한국어로 알아서 자연스럽게 읽습니다. 한글 발음형으로 풀어 쓰지 마세요(예: "십이 점 삼 퍼센트" 같이 쓰지 말 것).
- 단 분수(1/2), 영문 약어(A4, 5G, AI 등)는 HeyGen 이 잘못 읽을 수 있어 별도 변환 처리되니, caption 에는 그대로 1/2, A4, 5G 같이 원본 표기를 쓰세요.
- scenes[].textOverlay 는 화면에 글자로 표시되는 키워드 카드이므로 1/2, 100p, 30% 같은 원래 표기를 그대로 유지하세요.
- scenes는 3개 이상으로 구성하세요.
- 총 길이는 60초(1분)를 넘기지 마세요. 내용 분량이 1분을 초과하면 핵심만 남겨 1분 이내로 줄이세요. 1분보다 짧게 끝나는 것은 자연스러우며, 굳이 1분에 맞추려고 내용을 늘리거나 반복하지 마세요.
- uploadTitle은 60자 이내, uploadDescription은 200~400자 사이로 작성하세요.
- hashtags는 8~12개 배열로 반환하세요.

## 뉴스레터 규칙
- 첫 인사말은 자연스럽게 작성하되, 과장되거나 광고 같은 문구는 피하세요.
- subject, preheader, greeting, headline, keyPoints, body, closingNote 어느 필드에서도 markdown bold/emphasis(**, *, __, _) 를 절대 사용하지 마세요. 모든 텍스트는 강조 표시 없이 평문으로만 작성하세요.

## 블로그 규칙
- 섹션은 3개 이상 구성하세요.
- sections[].content는 충분한 길이의 본문으로 작성하세요.
- sections[].content에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
${buildBlogBodyLineBreakRules()}
${buildBlogCategoryInstruction(options.blogCategorySelection)}

${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{
  "blog": {
    "title": "블로그 제목",
    "metaDescription": "메타 설명",
    "introduction": "글 소개 (입시 및 학습 전략 글 위주 카테고리에서만 채움. 그 외에는 빈 문자열)",
    "sections": [
      {
        "heading": "섹션 제목",
        "keyPhrase": "핵심 키워드 또는 짧은 요약",
        "content": "섹션 본문",
        "imagePrompt": "Image prompt in English",
        "cardSummary": {
          "headline": "지식 공유(카드뉴스) 카테고리 한정 — 카드 상단 한 줄 헤드라인",
          "bullets": ["압축 불릿1", "압축 불릿2"]
        }
      }
    ],
    "tags": ["태그"],
    "summary": "글 요약"
  },
  "newsletter": {
    "subject": "메일 제목",
    "preheader": "프리헤더",
    "greeting": "인사말",
    "headline": "헤드라인",
    "keyPoints": ["핵심 포인트"],
    "body": "본문",
    "dataHighlights": [{ "label": "항목", "value": "값" }],
    "cta": { "text": "CTA", "description": "설명" },
    "closingNote": "마무리 문구"
  },
  "instagram": {
    "title": "게시물 제목",
    "body": "게시물 본문",
    "caption": "인스타그램 캡션",
    "hashtags": ["#태그"],
    "cardTopics": [
      {
        "cardNumber": 1,
        "headline": "카드 제목",
        "content": "카드 내용",
        "dataPoint": "핵심 수치"
      }
    ]
  },
  "shorts": {
    "title": "숏폼 제목",
    "duration": "20",
    "hook": "첫 문장",
    "scenes": [
      {
        "sceneNumber": 1,
        "duration": "6",
        "caption": "화면 자막이자 TTS 입력으로 함께 쓰이는 텍스트(숫자·기호는 원본 표기 그대로)",
        "visualDescription": "Visual description in English",
        "textOverlay": "텍스트 오버레이"
      }
    ],
    "cta": "마무리 문구",
    "thumbnailPrompt": "Thumbnail prompt in English",
    "uploadTitle": "YouTube 제목",
    "uploadDescription": "YouTube 설명",
    "hashtags": ["#Shorts", "#태그"]
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
  const blogCategorySelection = await recommendBlogCategory(summary, rawText, emphasis, options)
  const [fourResult] = await Promise.allSettled([
    generate4Channels(summary, rawText, emphasis, { ...options, blogCategorySelection }),
  ])

  const four = fourResult.status === 'fulfilled' ? fourResult.value : null
  if (!four) {
    console.error('[Gemini] multi-channel generation failed', fourResult)
    throw new Error('콘텐츠 생성 결과를 파싱하지 못했습니다.')
  }

  return {
    blog: withBlogCategoryMetadata(await finalizeBlogContent(four?.blog || null), blogCategorySelection),
    newsletter: four?.newsletter || null,
    instagram: sanitizeInstagramContent(four?.instagram || null, { summary, rawText }),
    shorts: sanitizeShortsContent(four?.shorts || null),
  }
}

const CHANNEL_SCHEMAS = {
  blog: `"blog":{"title":"블로그 제목","metaDescription":"메타 설명","introduction":"글 소개","sections":[{"heading":"섹션 제목","keyPhrase":"핵심 키워드","content":"섹션 본문","imagePrompt":"Image prompt in English","cardSummary":{"headline":"카드 헤드라인","bullets":["불릿1","불릿2"]}}],"tags":["태그"],"summary":"글 요약"}`,
  newsletter: `"newsletter":{"subject":"메일 제목","preheader":"프리헤더","greeting":"인사말","headline":"헤드라인","keyPoints":["핵심 포인트"],"body":"본문","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리 문구"}`,
  instagram: `"instagram":{"title":"게시물 제목","body":"게시물 본문","caption":"인스타그램 캡션","hashtags":["#태그"],"cardTopics":[{"cardNumber":1,"headline":"카드 제목","content":"카드 내용","dataPoint":"핵심 수치"}]}`,
  shorts: `"shorts":{"title":"숏폼 제목","duration":"20","hook":"첫 문장","scenes":[{"sceneNumber":1,"duration":"6","caption":"화면 자막이자 TTS 입력으로 함께 쓰이는 텍스트(숫자·기호는 원본 표기 그대로)","visualDescription":"Visual description in English","textOverlay":"텍스트 오버레이"}],"cta":"마무리 문구","thumbnailPrompt":"Thumbnail prompt in English","uploadTitle":"YouTube 제목","uploadDescription":"YouTube 설명","hashtags":["#Shorts","#태그"]}`,
}

const CHANNEL_LABELS = {
  blog: '네이버 블로그',
  newsletter: '뉴스레터',
  instagram: '인스타그램',
  shorts: '유튜브 쇼츠/릴스',
}

async function retryNonLongform(channels, summary, rawText, emphasis, options = {}) {
  const blogCategorySelection = channels.includes('blog')
    ? await recommendBlogCategory(summary, rawText, emphasis, options)
    : null
  const schemaLines = channels.map((channel) => CHANNEL_SCHEMAS[channel]).join(',\n  ')
  const channelNames = channels.map((channel) => CHANNEL_LABELS[channel]).join(', ')

  const prompt = `당신은 멀티채널 콘텐츠 기획자입니다. 아래 정보를 바탕으로 다음 채널만 다시 생성하세요: ${channelNames}

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실은 추가하지 마세요.
- 반드시 JSON만 출력하세요.

## 인스타그램 규칙
- body, caption, cardTopics에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
${buildInstagramCardRules()}
${buildInstagramCaptionRules()}

## 유튜브 숏폼 규칙
- hook, scenes[].caption, scenes[].textOverlay, cta, uploadTitle, uploadDescription에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- 각 씬에는 scenes[].caption 을 작성하세요. **caption은 화면 자막으로 표시되는 동시에 HeyGen TTS 음성으로도 그대로 읽힙니다.** 따라서 자막 가독성을 우선해 숫자·분수·단위·기호는 원래 표기(12.3, 30%, $100, 5:3, 12.21.(월), 오후 3시 30분 등)를 그대로 유지하세요. HeyGen TTS 는 이 원본 표기를 한국어로 알아서 자연스럽게 읽습니다. 한글 발음형으로 풀어 쓰지 마세요(예: "십이 점 삼 퍼센트" 같이 쓰지 말 것).
- 단 분수(1/2), 영문 약어(A4, 5G, AI 등)는 HeyGen 이 잘못 읽을 수 있어 별도 변환 처리되니, caption 에는 그대로 1/2, A4, 5G 같이 원본 표기를 쓰세요.
- scenes[].textOverlay 는 화면에 글자로 표시되는 키워드 카드이므로 1/2, 100p, 30% 같은 원래 표기를 그대로 유지하세요.

${buildBlogTitleRules()}
## 블로그 규칙
- sections[].content에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
${buildBlogCategoryInstruction(blogCategorySelection)}
${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{
  ${schemaLines}
}`

  const result = await callGeminiWithFallback(prompt, {
    temperature: 0.4,
    maxOutputTokens: 32768,
    jsonMode: true,
  })
  const parsed = parseJSON(result, null)
  if (!parsed) throw new Error('콘텐츠 재생성 결과를 파싱하지 못했습니다.')

  const output = {}
  for (const channel of channels) {
    output[channel] = parsed[channel] || null
  }
  if (output.blog) output.blog = withBlogCategoryMetadata(output.blog, blogCategorySelection)
  if (output.instagram) output.instagram = sanitizeInstagramContent(output.instagram, { summary, rawText })
  if (output.shorts) output.shorts = sanitizeShortsContent(output.shorts)
  return output
}

export async function retryFailedChannels(channels, summary, rawText, emphasis, options = {}) {
  if (channels.length === 0) throw new Error('재시도할 채널이 없습니다.')

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
  if (Object.keys(output).length === 0) throw new Error('콘텐츠 재생성 결과를 파싱하지 못했습니다.')
  return output
}

export async function generateBlogContent(summary, rawText, emphasis, options = {}) {
  const blogCategorySelection = await recommendBlogCategory(summary, rawText, emphasis, options)
  const prompt = `당신은 네이버 블로그 전문 작가입니다. 아래 정보를 바탕으로 블로그 글을 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실은 추가하지 마세요.
- 섹션은 3개 이상 구성하세요.
- 블로그 본문에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- 블로그 본문에서는 취소선(~~text~~, --text--)과 italic(*text*, _text_)도 사용하지 마세요.
- 날짜, 일정, 핵심 키워드도 굵게 표시하지 말고 일반 텍스트로 작성하세요.
${buildBlogBodyLineBreakRules()}
${buildBlogCategoryInstruction(blogCategorySelection)}

${buildBlogTitleRules()}
${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"title":"블로그 제목","metaDescription":"메타 설명","introduction":"글 소개","sections":[{"heading":"섹션 제목","keyPhrase":"핵심 키워드","content":"섹션 본문","imagePrompt":"Image prompt in English","cardSummary":{"headline":"카드 헤드라인","bullets":["불릿1","불릿2"]}}],"tags":["태그"],"summary":"글 요약"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true, signal: options.signal })
  return withBlogCategoryMetadata(
    await finalizeBlogContent(parseJSON(result, { title: '블로그 생성 실패', sections: [], tags: [], summary: '' })),
    blogCategorySelection,
  )
}

export async function generateNewsletterContent(summary, rawText, emphasis, options = {}) {
  const prompt = `당신은 뉴스레터 에디터입니다. 아래 정보를 바탕으로 뉴스레터를 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실은 추가하지 마세요.
- 뉴스레터 본문은 메일 복사에 적합하도록 읽기 쉽게 구성하세요.
- subject, preheader, greeting, headline, keyPoints, body, closingNote 어느 필드에서도 markdown bold/emphasis(**, *, __, _) 를 절대 사용하지 마세요. 모든 텍스트는 강조 표시 없이 평문으로만 작성하세요.

${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"subject":"메일 제목","preheader":"프리헤더","greeting":"인사말","headline":"헤드라인","keyPoints":["핵심 포인트"],"body":"본문","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리 문구"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true, signal: options.signal })
  return parseJSON(result, { subject: '뉴스레터 생성 실패', keyPoints: [], body: '', dataHighlights: [] })
}

export async function generateInstagramContent(summary, rawText, emphasis, options = {}) {
  const prompt = `당신은 인스타그램 콘텐츠 기획자입니다. 아래 정보를 바탕으로 인스타그램 게시물 본문과 카드 주제를 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실은 추가하지 마세요.
- body, caption, cardTopics에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
${buildInstagramCardRules()}

## caption 작성 규칙
${buildInstagramCaptionRules()}

${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"title":"게시물 제목","body":"게시물 본문","caption":"이모지로 시작하는 짧은 문단형 인스타그램 캡션 본문(350~600자)","hashtags":["#태그"],"cardTopics":[{"cardNumber":1,"headline":"카드 제목","content":"카드 내용","dataPoint":"핵심 수치"}]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true, signal: options.signal })
  return sanitizeInstagramContent(
    parseJSON(result, { title: '', body: '', caption: '', hashtags: [], cardTopics: [] }),
    { summary, rawText },
  )
}

function buildShortsConceptFewShot(conceptId) {
  const concept = findShortsVideoConcept(conceptId)
  if (!concept?.testScript) return ''
  return `
## 컨셉 출력 포맷 예시
선택된 컨셉: ${concept.label}
아래 testScript 는 이 컨셉의 정확한 JSON 출력 포맷 예시입니다.
scenes[].layout 같은
메타필드 패턴을 그대로 따라하세요. narration / caption / visualDescription / textOverlay 는
현재 입력 데이터 기반으로 새로 작성하되 layout 등의 메타필드는 예시와 동일한 구조로 채우세요.
참고: testScript 예시에 caption 필드가 없더라도, 실제 출력에는 모든 씬에 caption 필드를 반드시 포함하세요(자막용 원본 표기 텍스트).

\`\`\`json
${JSON.stringify(concept.testScript, null, 2)}
\`\`\`
`
}

export async function generateShortsScript(summary, rawText, emphasis, options = {}) {
  const fewShot = buildShortsConceptFewShot(options.videoConceptId)
  const prompt = `당신은 유튜브 숏폼 스크립트 작가입니다. 아래 정보를 바탕으로 숏폼 대본을 작성하세요. 총 길이는 60초(1분)를 넘기지 마세요. 내용 분량이 1분을 초과하면 핵심만 남겨 1분 이내로 줄이고, 1분보다 짧게 끝나는 것은 자연스러우니 굳이 1분에 맞추려 내용을 늘리지 마세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실은 추가하지 마세요.
- scenes는 3개 이상으로 구성하세요.
- hook, scenes[].caption, scenes[].textOverlay, cta, uploadTitle, uploadDescription에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- 각 씬에는 scenes[].caption 을 작성하세요. **caption은 화면 자막으로 표시되는 동시에 HeyGen TTS 음성으로도 그대로 읽힙니다.** 따라서 자막 가독성을 우선해 숫자·분수·단위·기호는 원래 표기(12.3, 30%, $100, 5:3, 12.21.(월), 오후 3시 30분 등)를 그대로 유지하세요. HeyGen TTS 는 이 원본 표기를 한국어로 알아서 자연스럽게 읽습니다. 한글 발음형으로 풀어 쓰지 마세요(예: "십이 점 삼 퍼센트" 같이 쓰지 말 것).
- 단 분수(1/2), 영문 약어(A4, 5G, AI 등)는 HeyGen 이 잘못 읽을 수 있어 별도 변환 처리되니, caption 에는 그대로 1/2, A4, 5G 같이 원본 표기를 쓰세요.
- scenes[].textOverlay 는 화면에 글자로 표시되는 키워드 카드이므로 1/2, 100p, 30% 같은 원래 표기를 그대로 유지하세요.
- 각 나레이션은 1~2문장으로 짧고 명확하게 작성하세요.
- caption·hook·cta 는 반드시 완결된 문장으로 끝맺으세요. "변화.", "모집.", "확대." 처럼 명사·단어 하나로 끊지 말고, "~합니다.", "~했습니다.", "~하세요.", "~입니다.", "~됩니다.", "~예요." 같은 서술형 종결어미로 문장을 끝내세요. (단, scenes[].textOverlay 키워드 카드는 짧은 단어·구로 둬도 됩니다.)
- hook 은 영상에서 '씬 1'로 먼저 나오고 기존 씬들이 그 뒤에 이어집니다. 따라서 hook 은 시선을 끄는 한 문장으로, scenes[0].caption 과 다른 내용으로 작성하세요. hook 과 첫 씬 caption 에 같은 문장을 반복하지 마세요.

## 씬 메타필드 규칙 (영상 합성용)
- layout 후보: 'full' (풀화면 1인), 'infographic-full' (풀화면 인포그래픽 · 아바타 미노출 · 보이스오버), 'quiz-countdown' (퀴즈 대기 씬 · 같은 인물 idle · 3초 카운트다운 배경).
- 'infographic-full' 을 쓰면 scenes[].visualDescription 에 headline, hero value(예: "+12.4%"), chart 종류(bar/pie/line), subtitle, 색상 톤(예: navy + gold)을 영어로 한 문장에 자세히 풀어 쓰세요 — HeyGen Video Agent 가 이 묘사대로 풀화면 인포그래픽을 직접 생성하며, 아바타는 자동으로 숨겨집니다. "no avatar visible", "no people" 을 반드시 포함하세요. 인포그래픽 씬은 첫 씬·마지막 씬에는 쓰지 말고, 수치·통계·비교 또는 강조 키워드가 핵심인 중간 씬에만 쓰세요.
- 퀴즈형 컨셉(ox_quiz)은 각 문제를 질문 씬('full') → 대기 씬('quiz-countdown', narration 은 빈 문자열) → 정답 씬('full') 3개로 구성하고, 한 문제의 3개 씬은 모두 같은 avatarId 를 지정하세요. 대기 씬 배경 카운트다운 영상은 시스템이 자동 처리하니 visualDescription 만 채우면 됩니다.
- 컨셉이 선택되지 않았다면: 기본값은 모든 씬을 'full'(한 아바타가 자연스럽게 이어서 말하는 화면)로 두세요. 단, 중간 씬에 서로 비교 가능한 수치·통계·비율·순위·증감 데이터가 충분히 많아 차트/그래프로 보여주는 편이 명확한 경우에만 'infographic-full' 로 지정하세요. 단순 연도·날짜·숫자 1개 정도는 인포그래픽으로 만들지 말고 'full' 로 유지하세요.
- 숏폼 배경은 아바타 자체 배경 또는 컨셉이 지정한 단색만 사용합니다. 별도 배경 이미지 합성은 하지 않습니다.
- visualDescription 은 항상 영어로, 인물 외형·자세·배경·조명·프레이밍을 한 문장으로 충분히 묘사하세요(인포그래픽 씬은 인물 없이 차트·수치 시각화 묘사).

## 업로드 메타데이터 규칙
- uploadTitle: 60자 이내
- uploadDescription: 200~400자
- hashtags: 8~12개 배열, #Shorts 포함
${fewShot}
${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"title":"숏폼 제목","duration":"20","hook":"첫 문장","scenes":[{"sceneNumber":1,"duration":"6","layout":"full","caption":"화면 자막이자 TTS 입력으로 함께 쓰이는 텍스트(숫자·기호는 원본 표기 그대로)","visualDescription":"Visual description in English","textOverlay":"텍스트 오버레이"}],"cta":"마무리 문구","thumbnailPrompt":"Thumbnail prompt in English","uploadTitle":"YouTube 제목","uploadDescription":"YouTube 설명","hashtags":["#Shorts","#태그"]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true, signal: options.signal })
  return sanitizeShortsContent(
    parseJSON(result, {
      title: '숏폼 대본 생성 실패',
      scenes: [],
      duration: '0',
      uploadTitle: '',
      uploadDescription: '',
      hashtags: [],
    }),
  )
}

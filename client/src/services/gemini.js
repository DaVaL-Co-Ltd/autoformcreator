import { callGeminiWithFallback, parseJSON } from './gemini-core'

export async function verifyParsedContent(parsedText, options = {}) {
  const focusInstruction = options.focus ? `\n분석 중점 사항: ${options.focus}` : ''
  const extraInstruction = options.extra ? `\n추가 지시사항: ${options.extra}` : ''

  const prompt = `당신은 데이터 검증 및 교정 전문가입니다. 아래는 PDF에서 추출한 텍스트입니다.${focusInstruction}${extraInstruction}

다음을 수행해주세요:
1. 텍스트의 구조가 논리적으로 자연스러운지 확인
2. 숫자, 통계, 데이터가 서로 모순되거나 누락된 부분이 있는지 검증
3. 깨진 문장, 띄어쓰기 오류, 간단한 오탈자를 조용히 보정
4. correctedText에는 읽기 자연스러운 최종 텍스트를 반영
5. 검증 결과는 JSON으로만 반환

규칙:
- 숫자, 통계, 고유명사는 절대 바꾸지 마세요.
- 단순한 맞춤법/띄어쓰기 수정은 issues에 적지 말고 correctedText에만 반영하세요.
- issues에는 구조적 문제, 데이터 불일치, 빠진 내용처럼 결과 품질에 영향을 주는 문제만 적으세요.
- 큰 문제만 없으면 isValid는 true로 두세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "isValid": true,
  "issues": ["발견된 문제"],
  "correctedText": "보정된 텍스트",
  "confidence": 0.92
}

추출된 텍스트:
${parsedText}`

  const result = await callGeminiWithFallback(prompt, { jsonMode: true })
  return parseJSON(result, { isValid: true, issues: [], correctedText: parsedText, confidence: 0.8 })
}

function buildUniversityListSummaryInstruction() {
  return `
## 대학 리스트 요약 규칙
- 원문에 여러 대학명과 각 대학별 조건, 일정, 전형, 반영 기준, 준비 포인트가 섞여 있으면 특정 대학 하나만 요약하지 마세요.
- 문서 첫머리에 나온 대학만 따라가지 말고, 실제로 중요한 여러 대학을 비교형으로 요약하세요.
- 대학이 길게 나열된 경우 전부 반복하지 말고, 인지도가 높거나 의미 있는 대표 대학을 골라 비교형으로 정리하세요.
- 같은 내용만 keyData, insights, summary에 반복하지 마세요.
- 대표 대학만 예시로 들었을 때는 자연스럽게 "등"을 붙여 더 많은 대학이 있음을 드러내세요.
- rawDataPoints에는 선택한 여러 대학의 원문 근거 문장을 포함하세요.

예시:
원문에 "2027 입시에서 건국대는 학생부 반영 비중이 높고, 성균관대는 수능 최저 기준을 확인해야 하며, 서울대는 학과 연계 활동과 면접 대비가 중요하다"처럼 여러 대학 조건이 섞여 있으면,
"2027 입시에서는 건국대의 학생부 반영 비중, 성균관대의 수능 최저 기준, 서울대의 학과 연계 활동과 면접 준비 등 대학별 확인 포인트가 다르게 나타난다"처럼 비교형으로 보여주세요.
`
}

const BLOG_LABEL_HINT_WEAK_TERMS = new Set([
  '중요성',
  '핵심',
  '핵심내용',
  '내용',
  '변화',
  '활용',
  '개요',
  '효과',
  '전망',
  '필요성',
])

function trimBlogLabelHint(text = '') {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/[\s,.:;!?/\\]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeBlogLabelHint(text = '') {
  return trimBlogLabelHint(text).replace(/\s+/g, '').toLowerCase()
}

function isWeakBlogLabelHintKeyPhrase(keyPhrase = '', heading = '') {
  const clean = trimBlogLabelHint(keyPhrase)
  if (!clean) return true
  if (clean.length > 16) return true
  if (clean.split(/\s+/).filter(Boolean).length > 4) return true
  if (/[.!?]/.test(clean)) return true
  if (/(입니다|합니다|됩니다|할 수 있습니다|하는 방법)$/u.test(clean)) return true

  const normalized = normalizeBlogLabelHint(clean)
  if (BLOG_LABEL_HINT_WEAK_TERMS.has(normalized)) return true

  const normalizedHeading = normalizeBlogLabelHint(heading)
  if (normalizedHeading && normalizedHeading === normalized) return true

  return false
}

function isWeakBlogLabelHintHeading(heading = '', keyPhrase = '') {
  const clean = trimBlogLabelHint(heading)
  if (!clean) return true
  if (clean.length > 34) return true
  if (clean.split(/\s+/).filter(Boolean).length < 2) return true
  if (/[.!?]/.test(clean)) return true
  if (/(입니다|합니다|됩니다)$/u.test(clean)) return true

  const normalized = normalizeBlogLabelHint(clean)
  if (BLOG_LABEL_HINT_WEAK_TERMS.has(normalized)) return true

  const normalizedKeyPhrase = normalizeBlogLabelHint(keyPhrase)
  if (normalizedKeyPhrase && normalizedKeyPhrase === normalized) return true

  return false
}

function sanitizeSummaryBlogLabelHints(hints = []) {
  if (!Array.isArray(hints)) return []

  return hints
    .map((item) => ({
      keyPhrase: trimBlogLabelHint(item?.keyPhrase || ''),
      heading: trimBlogLabelHint(item?.heading || ''),
    }))
    .filter((item) => item.keyPhrase || item.heading)
    .slice(0, 5)
}

async function reanalyzeSummaryBlogLabelHints(verifiedText, summaryData = {}) {
  const prompt = `당신은 블로그 이미지 제목과 본문 섹션 제목을 설계하는 편집자입니다. 아래 문서 요약과 원문을 바탕으로 블로그 섹션에 쓸 대표 라벨 후보를 3~5개 생성하세요.

규칙:
- keyPhrase는 블로그 이미지 큰 제목용입니다.
- keyPhrase는 2~10자 내외의 짧은 명사구로 작성하세요.
- heading은 본문 섹션 제목용입니다.
- heading은 keyPhrase보다 설명이 조금 더 있는 10~26자 내외 제목으로 작성하세요.
- keyPhrase와 heading은 완전히 같은 문구를 쓰지 마세요.
- 추상적인 표현(중요성, 변화, 활용, 개요, 효과)만 단독으로 쓰지 마세요.
- 문장형 서술(~입니다, ~합니다)을 피하세요.
- 사실을 추가하지 말고, 요약과 원문에서 드러나는 핵심 주제만 뽑으세요.
- 반드시 JSON만 출력하세요.

문서 제목: ${String(summaryData.title || '').trim() || '없음'}
요약:
${String(summaryData.summary || '').trim() || '없음'}

핵심 키워드:
${Array.isArray(summaryData.keywords) && summaryData.keywords.length ? summaryData.keywords.join(', ') : '없음'}

주요 인사이트:
${Array.isArray(summaryData.insights) && summaryData.insights.length ? `- ${summaryData.insights.join('\n- ')}` : '없음'}

원문:
${String(verifiedText || '').slice(0, 2600)}

출력 스키마:
{"blogLabelHints":[{"keyPhrase":"핵심 키워드","heading":"섹션 제목"}]}`

  try {
    const result = await callGeminiWithFallback(prompt, {
      temperature: 0.2,
      maxOutputTokens: 1024,
      jsonMode: true,
    })
    const parsed = parseJSON(result, { blogLabelHints: [] })
    return sanitizeSummaryBlogLabelHints(parsed?.blogLabelHints || [])
  } catch {
    return []
  }
}

async function ensureSummaryBlogLabelHints(summaryData, verifiedText) {
  const initialHints = sanitizeSummaryBlogLabelHints(summaryData?.blogLabelHints || [])
  const hasStrongInitialHints = (
    initialHints.length >= 3 &&
    initialHints.every((item) => (
      !isWeakBlogLabelHintKeyPhrase(item.keyPhrase, item.heading) &&
      !isWeakBlogLabelHintHeading(item.heading, item.keyPhrase)
    ))
  )

  if (hasStrongInitialHints) {
    return {
      ...summaryData,
      blogLabelHints: initialHints,
    }
  }

  const retriedHints = await reanalyzeSummaryBlogLabelHints(verifiedText, summaryData)
  return {
    ...summaryData,
    blogLabelHints: retriedHints.length ? retriedHints : initialHints,
  }
}

export async function summarizeContent(verifiedText, options = {}) {
  const styleMap = {
    data: '데이터 수치 중심으로 분석적으로 요약하세요.',
    story: '스토리텔링 방식으로 쉽게 풀어 요약하세요.',
    compare: '비교 분석 관점으로 차이점을 중심으로 요약하세요.',
  }
  const styleInstruction = options.style && options.style !== 'auto' && styleMap[options.style]
    ? `\n요약 스타일: ${styleMap[options.style]}`
    : ''
  const keywordsInstruction = options.keywords ? `\n강조 키워드: ${options.keywords} (해당 키워드를 중심으로 요약)` : ''
  const extraInstruction = options.extra ? `\n추가 지시사항: ${options.extra}` : ''

  const prompt = `당신은 콘텐츠 분석 전문가입니다. 아래 텍스트의 핵심 내용을 정확하게 요약해주세요.${styleInstruction}${keywordsInstruction}${extraInstruction}

중요: 원본 데이터의 숫자, 통계, 팩트를 절대 변경하지 마세요. 모든 데이터는 원문 그대로 인용해야 합니다.
${buildUniversityListSummaryInstruction()}

다음을 포함해주세요:
1. 문서 제목/주제
2. 핵심 데이터 포인트(숫자, 통계 등 - 원문 그대로)
3. 주요 인사이트 3~5개
4. 핵심 키워드 10개
5. 전체 요약 (300자 이내)
6. 블로그 섹션용 keyPhrase / heading 후보 3~5개

추가 규칙:
- blogLabelHints[].keyPhrase는 블로그 이미지 큰 제목용 짧은 명사구입니다.
- blogLabelHints[].heading은 본문 섹션 제목용으로 keyPhrase보다 조금 더 설명적이어야 합니다.
- keyPhrase와 heading은 완전히 같은 문구를 쓰지 마세요.
- 추상적인 표현(중요성, 변화, 활용, 개요, 효과)만 단독으로 쓰지 마세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "문서 제목",
  "keyData": [{"label": "항목명", "value": "값", "context": "맥락"}],
  "insights": ["인사이트1", "인사이트2"],
  "keywords": ["키워드", "키워드"],
  "summary": "전체 요약",
  "rawDataPoints": ["원문에서 추출한 정확한 데이터 문장"],
  "blogLabelHints": [{"keyPhrase": "핵심 키워드", "heading": "섹션 제목"}]
}

텍스트:
${verifiedText}`

  const result = await callGeminiWithFallback(prompt, { jsonMode: true })
  const parsed = parseJSON(result, {
    title: '요약 생성 실패',
    keyData: [],
    insights: [],
    keywords: [],
    summary: verifiedText.slice(0, 300),
    rawDataPoints: [],
    blogLabelHints: [],
  })
  return await ensureSummaryBlogLabelHints(parsed, verifiedText)
}

import { callGeminiWithFallback, parseJSON } from './gemini-core'

function stripMarkdownEmphasis(text = '') {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

function escapeRegExp(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function trimBlogBoldCandidate(text = '') {
  return stripMarkdownEmphasis(String(text || ''))
    .replace(/[\s,.:;!?/\\]+$/g, '')
    .trim()
}

function deriveBlogBoldCandidates(section = {}) {
  const keyPhrase = trimBlogBoldCandidate(section?.keyPhrase || '')
  const heading = trimBlogBoldCandidate(section?.heading || '')
  const candidates = []

  if (keyPhrase) candidates.push(keyPhrase)
  if (heading && heading !== keyPhrase) candidates.push(heading)

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
  const content = String(section?.content || '')
  if (!content.trim()) return section
  if (/\*\*[^*]+\*\*/.test(content)) return section

  let nextContent = content
  for (const candidate of deriveBlogBoldCandidates(section)) {
    const updated = applySingleBold(nextContent, candidate)
    if (updated !== nextContent) {
      nextContent = updated
      break
    }
  }

  return {
    ...section,
    content: nextContent,
  }
}

function finalizeBlogContent(content) {
  if (!content) return content
  return {
    ...content,
    sections: Array.isArray(content.sections)
      ? content.sections.map(ensureBlogSectionBold)
      : [],
  }
}

function sanitizeInstagramContent(content) {
  if (!content) return content
  return {
    ...content,
    title: stripMarkdownEmphasis(content.title || ''),
    body: stripMarkdownEmphasis(content.body || ''),
    caption: stripMarkdownEmphasis(content.caption || ''),
    cardTopics: Array.isArray(content.cardTopics)
      ? content.cardTopics.map((topic) => ({
          ...topic,
          headline: stripMarkdownEmphasis(topic?.headline || ''),
          content: stripMarkdownEmphasis(topic?.content || ''),
          dataPoint: stripMarkdownEmphasis(topic?.dataPoint || ''),
        }))
      : [],
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
- 이 내용은 모든 채널의 핵심 메시지에 자연스럽게 녹여서 반영하세요.
- 없는 사실을 추가하지 말고, 제공된 요약과 원문 범위 안에서만 강조하세요.
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
- 검색량이 높을 핵심 키워드 1~2개를 제목 맨 앞에 배치하세요.
- 구분자는 쉼표(,)만 사용하세요.
- 콜론(:), 파이프(|)는 사용하지 마세요.
- 연도, 대상, 세부 설명은 뒤쪽에 배치하세요.
- 제목은 30자 안팎으로 간결하게 유지하세요.
`
}

function buildBasePrompt(summary, rawText, emphasis, options) {
  return `
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
  const prompt = `당신은 멀티채널 콘텐츠 전략가입니다. 아래 정보를 바탕으로 블로그, 뉴스레터, 인스타그램, 유튜브 숏폼 콘텐츠를 한 번에 생성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실을 추가하지 마세요.
- 각 채널의 형식과 독자 기대에 맞게 다시 써 주세요.
- 반드시 JSON만 출력하세요.

${buildBlogTitleRules()}

## 인스타그램 규칙
- body, caption, cardTopics에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- 카드 주제는 6~10개로 구성하세요.
- cardTopics는 카드 이미지 생성에 사용되므로 headline/content/dataPoint를 짧고 명확하게 작성하세요.
- caption은 cardTopics에서 다룬 핵심 이야기를 줄글(흐르는 문장) 형태의 본문으로 풀어 쓰세요. 카드 순서를 따라 각 카드 1개당 2~3문장 정도로 자연스럽게 이어 쓰고, 글머리 기호나 단순 번호 나열은 쓰지 마세요. 전체 분량은 600~1200자(공백 포함) 수준으로, 블로그 본문보다 짧지만 한 호흡에 읽기 좋게 작성하세요.
- caption 첫 문단은 시선을 끄는 도입(훅), 마지막 문단은 짧은 마무리로 구성하고 문단 사이에는 빈 줄을 넣으세요.
- caption에는 해시태그(#)를 포함하지 마세요. 해시태그는 hashtags 필드에만 작성하세요.

## 유튜브 숏폼 규칙
- hook, scenes[].narration, scenes[].textOverlay, cta, uploadTitle, uploadDescription에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- scenes는 3개 이상으로 구성하세요.
- 총 길이는 20~30초 수준으로 작성하세요.
- uploadTitle은 60자 이내, uploadDescription은 200~400자 수준으로 작성하세요.
- hashtags는 8~12개 배열로 반환하세요.

## 뉴스레터 규칙
- 첫 인사말은 자연스럽게 작성하되, 과장된 판매 문구는 피하세요.

## 블로그 규칙
- 섹션은 3개 이상 구성하세요.
- sections[].content는 충분한 길이의 본문으로 작성하세요.

${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{
  "blog": {
    "title": "블로그 제목",
    "metaDescription": "메타 설명",
    "sections": [
      {
        "heading": "섹션 제목",
        "keyPhrase": "핵심 키워드 또는 짧은 요약",
        "content": "섹션 본문",
        "imagePrompt": "Image prompt in English"
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
        "narration": "나레이션",
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
  const [fourResult] = await Promise.allSettled([
    generate4Channels(summary, rawText, emphasis, options),
  ])

  const four = fourResult.status === 'fulfilled' ? fourResult.value : null
  if (!four) {
    console.error('[Gemini] multi-channel generation failed', fourResult)
    throw new Error('콘텐츠 생성 결과를 파싱하지 못했습니다.')
  }

  return {
    blog: finalizeBlogContent(four?.blog || null),
    newsletter: four?.newsletter || null,
    instagram: sanitizeInstagramContent(four?.instagram || null),
    shorts: sanitizeShortsContent(four?.shorts || null),
  }
}

const CHANNEL_SCHEMAS = {
  blog: `"blog":{"title":"블로그 제목","metaDescription":"메타 설명","sections":[{"heading":"섹션 제목","keyPhrase":"핵심 키워드","content":"섹션 본문","imagePrompt":"Image prompt in English"}],"tags":["태그"],"summary":"글 요약"}`,
  newsletter: `"newsletter":{"subject":"메일 제목","preheader":"프리헤더","greeting":"인사말","headline":"헤드라인","keyPoints":["핵심 포인트"],"body":"본문","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리 문구"}`,
  instagram: `"instagram":{"title":"게시물 제목","body":"게시물 본문","caption":"인스타그램 캡션","hashtags":["#태그"],"cardTopics":[{"cardNumber":1,"headline":"카드 제목","content":"카드 내용","dataPoint":"핵심 수치"}]}`,
  shorts: `"shorts":{"title":"숏폼 제목","duration":"20","hook":"첫 문장","scenes":[{"sceneNumber":1,"duration":"6","narration":"나레이션","visualDescription":"Visual description in English","textOverlay":"텍스트 오버레이"}],"cta":"마무리 문구","thumbnailPrompt":"Thumbnail prompt in English","uploadTitle":"YouTube 제목","uploadDescription":"YouTube 설명","hashtags":["#Shorts","#태그"]}`,
}

const CHANNEL_LABELS = {
  blog: '네이버 블로그',
  newsletter: '뉴스레터',
  instagram: '인스타그램',
  shorts: '유튜브 숏폼',
}

async function retryNonLongform(channels, summary, rawText, emphasis, options = {}) {
  const schemaLines = channels.map((channel) => CHANNEL_SCHEMAS[channel]).join(',\n  ')
  const channelNames = channels.map((channel) => CHANNEL_LABELS[channel]).join(', ')

  const prompt = `당신은 멀티채널 콘텐츠 전략가입니다. 아래 정보를 바탕으로 다음 채널만 다시 생성하세요: ${channelNames}

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실을 추가하지 마세요.
- 반드시 JSON만 출력하세요.

## 인스타그램 규칙
- body, caption, cardTopics에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- caption은 cardTopics에서 다룬 핵심 이야기를 줄글(흐르는 문장) 형태의 본문으로 풀어 쓰세요. 카드 순서를 따라 각 카드 1개당 2~3문장 정도로 자연스럽게 이어 쓰고, 글머리 기호나 단순 번호 나열은 쓰지 마세요. 전체 분량은 600~1200자(공백 포함) 수준으로 작성하세요.
- caption 첫 문단은 도입(훅), 마지막 문단은 짧은 마무리로 구성하고 문단 사이에는 빈 줄을 넣으세요. 해시태그(#)는 caption에 포함하지 말고 hashtags 필드에만 작성하세요.

## 유튜브 숏폼 규칙
- hook, scenes[].narration, scenes[].textOverlay, cta, uploadTitle, uploadDescription에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.

${buildBlogTitleRules()}
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
  if (output.instagram) output.instagram = sanitizeInstagramContent(output.instagram)
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

  if (output.blog) output.blog = finalizeBlogContent(output.blog)
  if (output.instagram) output.instagram = sanitizeInstagramContent(output.instagram)
  if (output.shorts) output.shorts = sanitizeShortsContent(output.shorts)
  if (Object.keys(output).length === 0) throw new Error('콘텐츠 재생성 결과를 파싱하지 못했습니다.')
  return output
}

export async function generateBlogContent(summary, rawText, emphasis, options = {}) {
  const prompt = `당신은 네이버 블로그 전문 작가입니다. 아래 정보를 바탕으로 블로그 글을 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실을 추가하지 마세요.
- 섹션은 3개 이상 구성하세요.
- 블로그 본문에서는 markdown bold(**텍스트**)를 사용해도 됩니다.

${buildBlogTitleRules()}
${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"title":"블로그 제목","metaDescription":"메타 설명","sections":[{"heading":"섹션 제목","keyPhrase":"핵심 키워드","content":"섹션 본문","imagePrompt":"Image prompt in English"}],"tags":["태그"],"summary":"글 요약"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return finalizeBlogContent(parseJSON(result, { title: '블로그 생성 실패', sections: [], tags: [], summary: '' }))
}

export async function generateNewsletterContent(summary, rawText, emphasis, options = {}) {
  const prompt = `당신은 뉴스레터 에디터입니다. 아래 정보를 바탕으로 뉴스레터를 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실을 추가하지 마세요.
- 뉴스레터 본문은 메일 복사에 적합하도록 읽기 쉽게 구성하세요.

${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"subject":"메일 제목","preheader":"프리헤더","greeting":"인사말","headline":"헤드라인","keyPoints":["핵심 포인트"],"body":"본문","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리 문구"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return parseJSON(result, { subject: '뉴스레터 생성 실패', keyPoints: [], body: '', dataHighlights: [] })
}

export async function generateInstagramContent(summary, rawText, emphasis, options = {}) {
  const prompt = `당신은 인스타그램 콘텐츠 전략가입니다. 아래 정보를 바탕으로 인스타그램 게시물 본문과 카드 주제를 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실을 추가하지 마세요.
- body, caption, cardTopics에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- cardTopics는 6~10개로 구성하세요.
- 각 카드 문구는 짧고 명확하게 작성하세요.

## caption 작성 규칙
- caption은 cardTopics에서 다룬 핵심 이야기를 줄글(흐르는 문장) 형태의 본문으로 풀어 쓰세요. 카드 순서를 따라 각 카드 1개당 2~3문장 정도로 자연스럽게 이어 쓰고, 글머리 기호나 단순 번호 나열은 쓰지 마세요.
- 전체 분량은 600~1200자(공백 포함) 수준으로 작성하세요. 블로그 본문보다는 짧지만 한 호흡에 읽기 좋도록 충분히 풍부하게 쓰세요.
- 첫 문단은 시선을 끄는 도입(훅), 마지막 문단은 짧은 마무리로 구성하고 문단 사이에는 빈 줄을 넣으세요.
- 해시태그(#)는 caption에 포함하지 마세요. 해시태그는 hashtags 필드에만 작성하세요.

${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"title":"게시물 제목","body":"게시물 본문","caption":"인스타그램 캡션 본문(줄글, 600~1200자)","hashtags":["#태그"],"cardTopics":[{"cardNumber":1,"headline":"카드 제목","content":"카드 내용","dataPoint":"핵심 수치"}]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return sanitizeInstagramContent(
    parseJSON(result, { title: '', body: '', caption: '', hashtags: [], cardTopics: [] }),
  )
}

export async function generateShortsScript(summary, rawText, emphasis, options = {}) {
  const prompt = `당신은 유튜브 숏폼 스크립트 작가입니다. 아래 정보를 바탕으로 20~30초 분량의 숏폼 대본을 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실을 추가하지 마세요.
- scenes는 3개 이상으로 구성하세요.
- hook, scenes[].narration, scenes[].textOverlay, cta, uploadTitle, uploadDescription에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- 씬당 나레이션은 1~2문장으로 짧고 명확하게 작성하세요.

## 업로드 메타데이터 규칙
- uploadTitle: 60자 이내
- uploadDescription: 200~400자
- hashtags: 8~12개 배열, #Shorts 포함

${buildBasePrompt(summary, rawText, emphasis, options)}

## 출력 스키마
{"title":"숏폼 제목","duration":"20","hook":"첫 문장","scenes":[{"sceneNumber":1,"duration":"6","narration":"나레이션","visualDescription":"Visual description in English","textOverlay":"텍스트 오버레이"}],"cta":"마무리 문구","thumbnailPrompt":"Thumbnail prompt in English","uploadTitle":"YouTube 제목","uploadDescription":"YouTube 설명","hashtags":["#Shorts","#태그"]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
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

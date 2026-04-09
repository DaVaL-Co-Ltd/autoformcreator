import { callGeminiWithFallback, parseJSON } from './gemini-core'

function buildEmphasisInstruction(emphasis) {
  if (!emphasis || emphasis.trim() === '') return ''
  return `\n## 강조 요청\n사용자가 다음 내용을 특별히 강조해달라고 요청했습니다: "${emphasis.trim()}"\n위 내용을 모든 채널의 콘텐츠에서 중심 주제로 부각하고, 관련 데이터와 인사이트를 더 비중 있게 다뤄주세요.\n`
}

function buildOptionsInstruction(options = {}) {
  const parts = []
  const toneMap = {
    friendly: '친근하고 편안한',
    professional: '전문적이고 신뢰감 있는',
    humorous: '유머러스하고 재미있는',
    formal: '진지하고 격식 있는',
  }
  if (options.tone && options.tone !== 'auto' && toneMap[options.tone]) {
    parts.push(`글의 어조: ${toneMap[options.tone]} 톤으로 작성하세요.`)
  }
  if (options.commonExtra) parts.push(`공통 지시: ${options.commonExtra}`)
  if (options.blogExtra) parts.push(`블로그 추가 지시: ${options.blogExtra}`)
  if (options.instaExtra) parts.push(`인스타그램 추가 지시: ${options.instaExtra}`)
  if (options.newsletterExtra) parts.push(`뉴스레터 추가 지시: ${options.newsletterExtra}`)
  if (options.shortsExtra) parts.push(`숏폼 추가 지시: ${options.shortsExtra}`)
  return parts.length > 0 ? '\n## 사용자 설정\n' + parts.join('\n') : ''
}

// 1차: 4개 채널 (블로그, 뉴스레터, 인스타그램, 숏폼)
async function generate4Channels(summary, rawText, emphasis, options = {}) {
  const optionsInstruction = buildOptionsInstruction(options)
  const prompt = `당신은 멀티 채널 콘텐츠 전문가입니다. 아래 데이터를 바탕으로 4개 채널의 콘텐츠를 작성해주세요.

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 절대 변경하지 마세요.
- 사실에 기반한 내용만 작성하세요.
- 특정 대학교(예: 건국대, 성균관대 등)에만 해당하는 세부 내용은 최소화하세요. 여러 대학에 공통으로 적용되는 트렌드, 제도 변화, 일반적인 전략 등 공통적인 내용을 중심으로 작성하세요. 특정 대학은 예시로만 간단히 언급하세요.
- 볼드 처리는 반드시 **텍스트** 형식만 사용하세요. ***는 절대 사용하지 마세요. *이탤릭*도 사용하지 마세요.

## 블로그 제목 작성 규칙 (매우 중요)
- 제목 형식: "핵심키워드, 소제목 설명문" (쉼표로 구분)
- 검색량이 높은 핵심 키워드 1~2개를 제목 맨 앞에 배치하세요.
- 쉼표(,) 뒤에 소제목으로 구체적인 설명을 충분히 붙이세요.
- ":" 또는 "|"는 사용하지 마세요. 반드시 쉼표(,)로 구분하세요.
- 연도, 대상 등 부가 정보는 키워드 뒤쪽에 배치하세요.
- 좋은 예: "수능최저 국어 고득점, 내신과 선행까지 한번에 잡는 실속형 로드맵"
- 좋은 예: "2026 대입 핵심 변화, 학생부종합전형 준비 전략 총정리"
- 나쁜 예: "수능최저 준비 | 국어 고득점" ("|" 사용, 소제목이 너무 짧음)
${buildEmphasisInstruction(emphasis)}${optionsInstruction}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 8000)}

---

아래 JSON 형식으로 4개 채널 콘텐츠를 생성하세요:
{
  "blog": {"title":"핵심키워드, 소제목 설명문(쉼표 구분, 키워드를 맨 앞에)","metaDescription":"메타 설명(160자 이내)","sections":[{"heading":"섹션 제목","keyPhrase":"본문 핵심을 한눈에 보여주는 키워드 요약(예: 일반 논술 vs 약술형 논술, 2028 대입 핵심 3가지)","content":"섹션 내용(마크다운, 충분히 길게)","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약(200자)"},
  "newsletter": {"subject":"이메일 제목","preheader":"프리헤더(100자 이내)","greeting":"인사말","headline":"헤드라인","keyPoints":["포인트"],"body":"본문(마크다운)","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리"},
  "instagram": {"title":"게시글 제목","body":"게시글 본문(마크다운, 핵심 내용을 상세하게 작성)","caption":"인스타그램 캡션(이모지 포함, 키워드 중심)","hashtags":["#태그"],"cardTopics":[{"cardNumber":1,"headline":"카드 제목","content":"카드 내용(30자 이내)","dataPoint":"핵심 수치"}]},
  "shorts": {"title":"숏폼 제목","duration":"20","hook":"오프닝 훅","scenes":[{"sceneNumber":1,"duration":"6","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"},{"sceneNumber":2,"duration":"6","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"},{"sceneNumber":3,"duration":"6","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"}],"cta":"콜투액션","thumbnailPrompt":"썸네일(영문)"}
}

주의사항:
- 인스타그램 body는 게시글 본문으로, 핵심 내용을 마크다운으로 상세히 작성하세요.
- 인스타그램 cardTopics는 Step 5에서 카드 이미지 생성에 사용될 소재입니다. 6~10개로 구성하세요.
- 인스타그램 caption은 다음 형식으로 작성하세요:
  1) 도입 한 줄 (관심을 끄는 문장)
  2) 각 핵심을 이모지와 함께 키워드 중심으로 요약
  3) "~하세요", "~합니다" 같은 경어체 대신 "~정리", "~변화", "~포인트" 같이 명사/키워드로 끝내세요.
  4) 마지막에 CTA 한 줄
- 숏폼은 반드시 3씬 이상으로 구성하세요. 총 약 20초. 각 씬은 6~7초. 나레이션은 씬당 1~2문장. scenes 배열에 3개 이상의 씬 객체를 넣으세요.
- 숏폼 씬 구성 규칙:
  * 첫 번째 씬: 인사/소개 (예: "안녕하세요~ 오늘의 입시 정보를 알려드릴게요!"). visualDescription은 귀여운 고양이 캐릭터가 인사하는 애니메이션.
  * 중간 씬들: 핵심 내용 전달. visualDescription은 내용과 어울리는 배경 이미지 묘사 (교실, 차트, 책 등). 텍스트 없이 시각적 이미지 위주로.
  * 마지막 씬: 마무리/CTA (예: "더 많은 정보는 프로필에서 확인하세요!"). visualDescription은 고양이 캐릭터가 손 흔들며 작별하는 애니메이션.
- 첫 번째와 마지막 씬의 visualDescription만 고양이 캐릭터 애니메이션으로, 중간 씬은 배경 이미지로 묘사하세요.
- 반드시 위 JSON 구조만 출력하세요.`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 32768, jsonMode: true })
  return parseJSON(result, null)
}

// 4개 채널 콘텐츠 생성
export async function generateAllContent(summary, rawText, emphasis, options = {}) {
  const [fourResult] = await Promise.allSettled([
    generate4Channels(summary, rawText, emphasis, options),
  ])

  const four = fourResult.status === 'fulfilled' ? fourResult.value : null

  if (!four) {
    console.error('[Gemini] 4채널 에러:', fourResult.reason?.message)
    throw new Error('콘텐츠 생성 결과를 파싱하지 못했습니다.')
  }

  return {
    blog: four?.blog || null,
    newsletter: four?.newsletter || null,
    instagram: four?.instagram || null,
    shorts: four?.shorts || null,
  }
}

// 실패한 채널들만 1회 API 호출로 통합 재생성
const CHANNEL_SCHEMAS = {
  blog: `"blog":{"title":"핵심키워드, 소제목 설명문(쉼표 구분, 키워드를 맨 앞에)","metaDescription":"메타 설명(160자 이내)","sections":[{"heading":"섹션 제목","keyPhrase":"본문 핵심 키워드 요약(예: 일반 논술 vs 약술형 논술)","content":"섹션 내용(마크다운, 충분히 길게)","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약(200자)"}`,
  newsletter: `"newsletter":{"subject":"이메일 제목","preheader":"프리헤더(100자 이내)","greeting":"인사말","headline":"헤드라인","keyPoints":["포인트1","포인트2"],"body":"본문(마크다운)","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리"}`,
  instagram: `"instagram":{"title":"게시글 제목","body":"게시글 본문(마크다운, 핵심 내용 상세 작성)","caption":"인스타그램 캡션(이모지 포함)","hashtags":["#태그"],"cardTopics":[{"cardNumber":1,"headline":"카드 제목","content":"카드 내용(30자 이내)","dataPoint":"핵심 수치"}]}`,
  shorts: `"shorts":{"title":"숏폼 제목","duration":"20","hook":"오프닝 훅","scenes":[{"sceneNumber":1,"duration":"6","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"},{"sceneNumber":2,"duration":"6","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"},{"sceneNumber":3,"duration":"6","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"}],"cta":"콜투액션","thumbnailPrompt":"썸네일(영문)"}`,
}

const CHANNEL_LABELS = {
  blog: '블로그', newsletter: '뉴스레터', instagram: '인스타그램 게시글(본문+카드 소재 6~10개)',
  shorts: '숏폼 대본(20~30초, 3~4씬)',
}

async function retryNonLongform(channels, summary, rawText, emphasis) {
  const schemaLines = channels.map(ch => CHANNEL_SCHEMAS[ch]).join(',\n  ')
  const channelNames = channels.map(ch => CHANNEL_LABELS[ch]).join(', ')

  const prompt = `당신은 멀티 채널 콘텐츠 전문가입니다. 아래 데이터를 바탕으로 다음 채널의 콘텐츠를 작성해주세요: ${channelNames}

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 절대 변경하지 마세요.
- 사실에 기반한 내용만 작성하세요.
- 볼드 처리는 반드시 **텍스트** 형식만 사용하세요. ***는 절대 사용하지 마세요. *이탤릭*도 사용하지 마세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 8000)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  ${schemaLines}
}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 32768, jsonMode: true })
  const parsed = parseJSON(result, null)
  if (!parsed) throw new Error('콘텐츠 재생성 결과를 파싱하지 못했습니다.')

  const output = {}
  for (const ch of channels) {
    output[ch] = parsed[ch] || null
  }
  return output
}

export async function retryFailedChannels(channels, summary, rawText, emphasis) {
  if (channels.length === 0) throw new Error('재시도할 채널이 없습니다.')

  const results = await Promise.allSettled([
    retryNonLongform(channels, summary, rawText, emphasis),
  ])

  const output = {}
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      Object.assign(output, r.value)
    }
  }

  if (Object.keys(output).length === 0) throw new Error('콘텐츠 재생성 결과를 파싱하지 못했습니다.')
  return output
}

// 개별 채널 재시도용 함수들 (1개만 실패 시 사용)
export async function generateBlogContent(summary, rawText, emphasis) {
  const prompt = `당신은 네이버 블로그 인기글 전문 작가입니다. 아래 데이터를 바탕으로 블로그 글을 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
볼드 처리는 반드시 **텍스트** 형식만 사용하세요. ***는 절대 사용하지 마세요. *이탤릭*도 사용하지 마세요.

## 제목 작성 규칙 (매우 중요 — 반드시 지켜주세요)
- 제목 형식: "핵심키워드, 소제목 설명문" (쉼표로 구분)
- 검색량이 높은 핵심 키워드 1~2개를 제목 맨 앞에 배치하세요.
- 쉼표(,) 뒤에 소제목으로 구체적인 설명을 충분히 붙이세요.
- ":" 또는 "|"는 사용하지 마세요. 반드시 쉼표(,)로 구분하세요.
- 연도, 대상 등 부가 정보는 키워드 뒤쪽에 배치하세요.
- 좋은 예: "수능최저 국어 고득점, 내신과 선행까지 한번에 잡는 실속형 로드맵"
- 좋은 예: "2026 대입 핵심 변화, 학생부종합전형 준비 전략 총정리"
- 나쁜 예: "수능최저 준비 | 국어 고득점" ("|" 사용, 소제목이 너무 짧음)
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"블로그 제목(30자 이내, 핵심 키워드를 맨 앞에)","metaDescription":"메타 설명","sections":[{"heading":"섹션 제목","keyPhrase":"본문 핵심 키워드 요약","content":"섹션 내용","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return parseJSON(result, { title: '블로그 생성 실패', sections: [], tags: [], summary: '' })
}

export async function generateNewsletterContent(summary, rawText, emphasis) {
  const prompt = `당신은 뉴스레터 전문 에디터입니다. 아래 데이터를 바탕으로 뉴스레터를 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"subject":"이메일 제목","preheader":"프리헤더","greeting":"인사말","headline":"헤드라인","keyPoints":["포인트"],"body":"본문","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return parseJSON(result, { subject: '뉴스레터 생성 실패', keyPoints: [], body: '', dataHighlights: [] })
}

export async function generateInstagramContent(summary, rawText, emphasis) {
  const prompt = `당신은 인스타그램 콘텐츠 전문가입니다. 게시글 본문과 카드 이미지 소재를 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"게시글 제목","body":"게시글 본문(마크다운, 핵심 내용을 상세하게 작성)","caption":"인스타그램 캡션(이모지 포함, 키워드 중심)","hashtags":["#태그"],"cardTopics":[{"cardNumber":1,"headline":"카드 제목","content":"카드 내용(30자 이내)","dataPoint":"핵심 수치"}]}

주의: cardTopics는 6~10개로 구성하세요. 이 데이터는 카드 이미지 생성에 사용됩니다.`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return parseJSON(result, { title: '', body: '', caption: '', hashtags: [], cardTopics: [] })
}

export async function generateShortsScript(summary, rawText, emphasis) {
  const prompt = `당신은 유튜브 숏폼 전문 크리에이터입니다. 약 20초 분량의 숏폼 대본을 반드시 3씬 이상으로 작성해주세요.
각 씬은 6~7초이며 나레이션은 씬당 1~2문장으로 짧게. scenes 배열에 3개 이상 씬 객체를 넣으세요.
첫 씬: 인사/소개, 마지막 씬: 마무리/CTA, 중간 씬: 핵심 내용 전달.
첫/마지막 visualDescription은 고양이 캐릭터 애니메이션, 중간 씬은 내용과 어울리는 배경 이미지 묘사.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"영상 제목","duration":"초","hook":"오프닝 훅","scenes":[{"sceneNumber":1,"duration":"초","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"}],"cta":"콜투액션","thumbnailPrompt":"썸네일(영문)"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return parseJSON(result, { title: '숏폼 대본 생성 실패', scenes: [], duration: '0' })
}


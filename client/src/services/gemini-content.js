import { callGeminiWithFallback, parseJSON } from './gemini-core'

function buildEmphasisInstruction(emphasis) {
  if (!emphasis || emphasis.trim() === '') return ''
  return `\n## 강조 요청\n사용자가 다음 내용을 특별히 강조해달라고 요청했습니다: "${emphasis.trim()}"\n위 내용을 모든 채널의 콘텐츠에서 중심 주제로 부각하고, 관련 데이터와 인사이트를 더 비중 있게 다뤄주세요.\n`
}

// 1차: 4개 채널 (블로그, 뉴스레터, 인스타그램, 숏폼)
async function generate4Channels(summary, rawText, emphasis) {
  const prompt = `당신은 멀티 채널 콘텐츠 전문가입니다. 아래 데이터를 바탕으로 4개 채널의 콘텐츠를 작성해주세요.

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 절대 변경하지 마세요.
- 사실에 기반한 내용만 작성하세요.
- 특정 대학교(예: 건국대, 성균관대 등)에만 해당하는 세부 내용은 최소화하세요. 여러 대학에 공통으로 적용되는 트렌드, 제도 변화, 일반적인 전략 등 공통적인 내용을 중심으로 작성하세요. 특정 대학은 예시로만 간단히 언급하세요.
- 볼드 처리는 반드시 **텍스트** 형식만 사용하세요. ***는 절대 사용하지 마세요. *이탤릭*도 사용하지 마세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 8000)}

---

아래 JSON 형식으로 4개 채널 콘텐츠를 생성하세요:
{
  "blog": {"title":"블로그 제목(SEO 최적화)","metaDescription":"메타 설명(160자 이내)","sections":[{"heading":"섹션 제목","keyPhrase":"본문 핵심을 한눈에 보여주는 키워드 요약(예: 일반 논술 vs 약술형 논술, 2028 대입 핵심 3가지)","content":"섹션 내용(마크다운, 충분히 길게)","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약(200자)"},
  "newsletter": {"subject":"이메일 제목","preheader":"프리헤더(100자 이내)","greeting":"인사말","headline":"헤드라인","keyPoints":["포인트"],"body":"본문(마크다운)","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리"},
  "instagram": {"cards":[{"cardNumber":1,"headline":"헤드라인","body":"본문(50자 이내)","dataPoint":"데이터","imagePrompt":"이미지 설명(영문)","backgroundColor":"#hex"}],"caption":"캡션","hashtags":["#태그"]},
  "shorts": {"title":"숏폼 제목","duration":"초(10~40)","hook":"오프닝 훅(3초)","scenes":[{"sceneNumber":1,"duration":"초","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"}],"cta":"콜투액션","thumbnailPrompt":"썸네일(영문)"}
}

주의사항:
- 인스타그램 카드는 6~10장으로 구성하세요.
- 인스타그램 caption은 다음 형식으로 작성하세요:
  1) 도입 한 줄 (관심을 끄는 문장)
  2) 각 카드 핵심을 이모지와 함께 키워드 중심으로 요약 (예: "📌 일반 논술 vs 약술형 논술", "📊 2028 대입 핵심 변화 3가지")
  3) "~하세요", "~합니다" 같은 경어체 대신 "~정리", "~변화", "~포인트" 같이 명사/키워드로 문장을 끝내세요.
  4) 마지막에 CTA 한 줄
- 숏폼은 핵심 데이터 2~3개에 집중, 나레이션 10~40초 분량.
- 반드시 위 JSON 구조만 출력하세요.`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 32768, jsonMode: true })
  return parseJSON(result, null)
}

// 2차: 롱폼 단독 생성
async function generateLongform(summary, rawText, emphasis) {
  const prompt = `당신은 유튜브 롱폼 영상 전문 크리에이터입니다. 아래 데이터를 바탕으로 5~15분 분량의 롱폼 영상 대본을 작성해주세요.

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
- 모든 중요 데이터를 빠짐없이 포함하세요.
- 특정 대학교에만 해당하는 세부 내용은 최소화하고, 공통적인 트렌드·제도 변화·전략을 중심으로 작성하세요. 특정 대학은 예시로만 간단히 언급하세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 8000)}

---

아래 JSON 형식으로 롱폼 대본을 생성하세요:
{
  "title": "롱폼 영상 제목",
  "estimatedDuration": "분:초(5~15분)",
  "intro": {"hook":"오프닝 훅","narration":"인트로 나레이션","visualDescription":"인트로 영상 설명"},
  "sections": [{"sectionNumber":1,"title":"섹션 제목","duration":"초","narration":"나레이션 전문(충분히 길게)","dataPoints":["정확한 데이터"],"visualElements":[{"type":"chart","description":"설명","data":"데이터"}],"transition":"다음 섹션 연결 멘트"}],
  "outro": {"summary":"핵심 요약","narration":"마무리 나레이션","cta":"구독/좋아요 콜투액션"},
  "fullNarrationText": "전체 나레이션 텍스트(인트로~아웃트로 전부 이어붙인 것)"
}

주의사항:
- 섹션을 3개 이상 작성하세요.
- fullNarrationText는 인트로 나레이션 + 모든 섹션 나레이션 + 아웃트로 나레이션을 이어붙인 전체 텍스트입니다.
- 반드시 위 JSON 구조만 출력하세요.`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 65536, jsonMode: true })
  return parseJSON(result, null)
}

// 5개 채널 콘텐츠를 2회 API 호출로 생성 (4채널 + 롱폼)
export async function generateAllContent(summary, rawText, emphasis) {
  // 1차: 4개 채널 + 2차: 롱폼 병렬 실행
  // [롱폼 비활성화] 롱폼 생성을 건너뛰고 4채널만 실행
  const [fourResult] = await Promise.allSettled([
    generate4Channels(summary, rawText, emphasis),
    // generateLongform(summary, rawText, emphasis),
  ])

  const four = fourResult.status === 'fulfilled' ? fourResult.value : null
  // const longform = longformResult.status === 'fulfilled' ? longformResult.value : null

  if (!four) {
    console.error('[Gemini] 4채널 에러:', fourResult.reason?.message)
    throw new Error('콘텐츠 생성 결과를 파싱하지 못했습니다.')
  }

  return {
    blog: four?.blog || null,
    newsletter: four?.newsletter || null,
    instagram: four?.instagram || null,
    shorts: four?.shorts || null,
    // longform: longform || null,  // [롱폼 비활성화]
  }
}

// 실패한 채널들만 1회 API 호출로 통합 재생성
const CHANNEL_SCHEMAS = {
  blog: `"blog":{"title":"블로그 제목(SEO 최적화)","metaDescription":"메타 설명(160자 이내)","sections":[{"heading":"섹션 제목","keyPhrase":"본문 핵심 키워드 요약(예: 일반 논술 vs 약술형 논술)","content":"섹션 내용(마크다운, 충분히 길게)","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약(200자)"}`,
  newsletter: `"newsletter":{"subject":"이메일 제목","preheader":"프리헤더(100자 이내)","greeting":"인사말","headline":"헤드라인","keyPoints":["포인트1","포인트2"],"body":"본문(마크다운)","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리"}`,
  instagram: `"instagram":{"cards":[{"cardNumber":1,"headline":"헤드라인","body":"본문(50자 이내)","dataPoint":"데이터","imagePrompt":"이미지 설명(영문)","backgroundColor":"#hex"}],"caption":"캡션(해시태그 포함)","hashtags":["#태그"]}`,
  shorts: `"shorts":{"title":"숏폼 제목","duration":"초(10~40)","hook":"오프닝 훅(3초)","scenes":[{"sceneNumber":1,"duration":"초","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"}],"cta":"콜투액션","thumbnailPrompt":"썸네일(영문)"}`,
  longform: `"longform":{"title":"롱폼 제목","estimatedDuration":"분:초(5~15분)","intro":{"hook":"훅","narration":"인트로 나레이션","visualDescription":"영상 설명"},"sections":[{"sectionNumber":1,"title":"섹션 제목","duration":"초","narration":"나레이션 전문(충분히 길게)","dataPoints":["데이터"],"visualElements":[{"type":"chart","description":"설명","data":"데이터"}],"transition":"연결 멘트"}],"outro":{"summary":"요약","narration":"마무리 나레이션","cta":"콜투액션"},"fullNarrationText":"전체 나레이션 텍스트"}`,
}

const CHANNEL_LABELS = {
  blog: '블로그', newsletter: '뉴스레터', instagram: '인스타그램 카드뉴스(6~10장)',
  shorts: '숏폼 대본(10~40초)', longform: '롱폼 대본(5~15분, 데이터 빠짐없이)',
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

  // [롱폼 비활성화] 롱폼 채널은 건너뜀
  // const hasLongform = channels.includes('longform')
  const nonLongform = channels.filter(ch => ch !== 'longform')

  // 롱폼과 나머지를 분리하여 병렬 실행
  const tasks = []
  if (nonLongform.length > 0) tasks.push(retryNonLongform(nonLongform, summary, rawText, emphasis))
  // [롱폼 비활성화]
  // if (hasLongform) tasks.push(generateLongform(summary, rawText, emphasis).then(r => ({ longform: r })))

  const results = await Promise.allSettled(tasks)

  const output = {}
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      Object.assign(output, r.value)
    }
  }

  // [롱폼 비활성화]
  // if (hasLongform && output.longform && output.longform.title) {
  //   // 이미 올바른 형태
  // }

  if (Object.keys(output).length === 0) throw new Error('콘텐츠 재생성 결과를 파싱하지 못했습니다.')
  return output
}

// 개별 채널 재시도용 함수들 (1개만 실패 시 사용)
export async function generateBlogContent(summary, rawText, emphasis) {
  const prompt = `당신은 전문 블로그 작가입니다. 아래 데이터를 바탕으로 블로그 글을 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
볼드 처리는 반드시 **텍스트** 형식만 사용하세요. ***는 절대 사용하지 마세요. *이탤릭*도 사용하지 마세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"블로그 제목","metaDescription":"메타 설명","sections":[{"heading":"섹션 제목","keyPhrase":"본문 핵심 키워드 요약","content":"섹션 내용","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약"}`

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
  const prompt = `당신은 인스타그램 카드뉴스 전문가입니다. 6~10장의 카드뉴스를 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"cards":[{"cardNumber":1,"headline":"헤드라인","body":"본문(50자 이내)","dataPoint":"데이터","imagePrompt":"이미지 설명(영문)","backgroundColor":"#hex"}],"caption":"캡션","hashtags":["#태그"]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, jsonMode: true })
  return parseJSON(result, { cards: [], caption: '', hashtags: [] })
}

export async function generateShortsScript(summary, rawText, emphasis) {
  const prompt = `당신은 유튜브 숏폼 전문 크리에이터입니다. 10~40초 분량의 숏폼 대본을 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 핵심 데이터 2~3개에 집중하세요.
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

export async function generateLongformScript(summary, rawText, emphasis) {
  const prompt = `당신은 유튜브 롱폼 영상 전문 크리에이터입니다. 5~15분 분량의 롱폼 대본을 작성해주세요.
모든 중요 데이터, 숫자, 통계를 빠짐없이 포함하세요.
${buildEmphasisInstruction(emphasis)}

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 8000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"영상 제목","estimatedDuration":"분:초","intro":{"hook":"훅","narration":"인트로 나레이션","visualDescription":"영상 설명"},"sections":[{"sectionNumber":1,"title":"섹션 제목","duration":"초","narration":"나레이션 전문","dataPoints":["데이터"],"visualElements":[{"type":"chart","description":"설명","data":"데이터"}],"transition":"연결 멘트"}],"outro":{"summary":"요약","narration":"마무리 나레이션","cta":"콜투액션"},"fullNarrationText":"전체 나레이션 텍스트"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 65536, jsonMode: true })
  return parseJSON(result, { title: '롱폼 대본 생성 실패', sections: [], estimatedDuration: '0:00' })
}

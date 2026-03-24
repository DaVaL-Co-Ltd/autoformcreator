import { callGeminiWithFallback, parseJSON } from './gemini-core'

// 5개 채널 콘텐츠를 1회 API 호출로 통합 생성
export async function generateAllContent(summary, rawText) {
  const prompt = `당신은 멀티 채널 콘텐츠 전문가입니다. 아래 데이터를 바탕으로 5개 채널의 콘텐츠를 한 번에 작성해주세요.

## 핵심 규칙 (모든 채널 공통)
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 절대 변경하지 마세요.
- 사실에 기반한 내용만 작성하세요. 추측이나 창작을 하지 마세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트 (데이터 정확성 참고용)
${rawText.slice(0, 8000)}

---

아래 JSON 형식으로 5개 채널 콘텐츠를 **반드시 한 번에** 생성하세요.
각 채널별 특성을 살려 작성하되, 핵심 데이터는 동일하게 유지하세요.

\`\`\`json
{
  "blog": {
    "title": "블로그 제목 (SEO 최적화)",
    "metaDescription": "메타 설명 (160자 이내)",
    "sections": [
      {
        "heading": "섹션 제목",
        "content": "섹션 내용 (마크다운 형식, 충분히 길게)",
        "imagePrompt": "이 섹션에 어울리는 이미지 설명 (영문)"
      }
    ],
    "tags": ["태그1", "태그2"],
    "summary": "글 요약 (200자)"
  },
  "newsletter": {
    "subject": "이메일 제목",
    "preheader": "프리헤더 텍스트 (100자 이내)",
    "greeting": "인사말",
    "headline": "메인 헤드라인",
    "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
    "body": "본문 내용 (마크다운 형식)",
    "dataHighlights": [{"label": "항목", "value": "값"}],
    "cta": {"text": "CTA 버튼 텍스트", "description": "CTA 설명"},
    "closingNote": "마무리 멘트"
  },
  "instagram": {
    "cards": [
      {
        "cardNumber": 1,
        "headline": "카드 헤드라인",
        "body": "카드 본문 (50자 이내)",
        "dataPoint": "핵심 데이터",
        "imagePrompt": "카드 배경 이미지 설명 (영문)",
        "backgroundColor": "#hex색상코드"
      }
    ],
    "caption": "인스타그램 캡션 (해시태그 포함)",
    "hashtags": ["#해시태그1", "#해시태그2"]
  },
  "shorts": {
    "title": "숏폼 영상 제목",
    "duration": "예상 길이 (초, 10~40)",
    "hook": "오프닝 훅 (3초 이내, 임팩트 있게)",
    "scenes": [
      {
        "sceneNumber": 1,
        "duration": "초",
        "narration": "나레이션 텍스트",
        "visualDescription": "화면 설명 (영문)",
        "textOverlay": "화면에 표시할 텍스트"
      }
    ],
    "cta": "마무리 콜투액션",
    "thumbnailPrompt": "썸네일 이미지 설명 (영문)"
  },
  "longform": {
    "title": "롱폼 영상 제목",
    "estimatedDuration": "예상 길이 (분:초, 5~15분)",
    "intro": {
      "hook": "오프닝 훅",
      "narration": "인트로 나레이션",
      "visualDescription": "인트로 영상 설명"
    },
    "sections": [
      {
        "sectionNumber": 1,
        "title": "섹션 제목",
        "duration": "예상 길이 (초)",
        "narration": "나레이션 전문 (충분히 길게)",
        "dataPoints": ["정확한 데이터"],
        "visualElements": [
          {"type": "chart", "description": "시각 요소 설명", "data": "표시할 데이터"}
        ],
        "transition": "다음 섹션 연결 멘트"
      }
    ],
    "outro": {
      "summary": "핵심 요약",
      "narration": "마무리 나레이션",
      "cta": "구독/좋아요 콜투액션"
    },
    "fullNarrationText": "전체 나레이션 텍스트 (인트로~아웃트로 전부 이어붙인 것)"
  }
}
\`\`\`

주의사항:
- 인스타그램 카드는 6~10장으로 구성하세요.
- 숏폼은 핵심 데이터 2~3개에 집중, 나레이션 10~40초 분량.
- 롱폼은 모든 중요 데이터를 빠짐없이 포함하고, 섹션을 3개 이상 작성하세요.
- fullNarrationText는 인트로 나레이션 + 모든 섹션 나레이션 + 아웃트로 나레이션을 이어붙인 전체 텍스트입니다.
- 반드시 위 JSON 구조만 출력하세요. 다른 텍스트를 추가하지 마세요.`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 16384 })
  const parsed = parseJSON(result, null)

  if (!parsed) {
    throw new Error('콘텐츠 생성 결과를 파싱하지 못했습니다.')
  }

  return {
    blog: parsed.blog || null,
    newsletter: parsed.newsletter || null,
    instagram: parsed.instagram || null,
    shorts: parsed.shorts || null,
    longform: parsed.longform || null,
  }
}

// 실패한 채널들만 1회 API 호출로 통합 재생성
const CHANNEL_SCHEMAS = {
  blog: `"blog":{"title":"블로그 제목(SEO 최적화)","metaDescription":"메타 설명(160자 이내)","sections":[{"heading":"섹션 제목","content":"섹션 내용(마크다운, 충분히 길게)","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약(200자)"}`,
  newsletter: `"newsletter":{"subject":"이메일 제목","preheader":"프리헤더(100자 이내)","greeting":"인사말","headline":"헤드라인","keyPoints":["포인트1","포인트2"],"body":"본문(마크다운)","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리"}`,
  instagram: `"instagram":{"cards":[{"cardNumber":1,"headline":"헤드라인","body":"본문(50자 이내)","dataPoint":"데이터","imagePrompt":"이미지 설명(영문)","backgroundColor":"#hex"}],"caption":"캡션(해시태그 포함)","hashtags":["#태그"]}`,
  shorts: `"shorts":{"title":"숏폼 제목","duration":"초(10~40)","hook":"오프닝 훅(3초)","scenes":[{"sceneNumber":1,"duration":"초","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"}],"cta":"콜투액션","thumbnailPrompt":"썸네일(영문)"}`,
  longform: `"longform":{"title":"롱폼 제목","estimatedDuration":"분:초(5~15분)","intro":{"hook":"훅","narration":"인트로 나레이션","visualDescription":"영상 설명"},"sections":[{"sectionNumber":1,"title":"섹션 제목","duration":"초","narration":"나레이션 전문(충분히 길게)","dataPoints":["데이터"],"visualElements":[{"type":"chart","description":"설명","data":"데이터"}],"transition":"연결 멘트"}],"outro":{"summary":"요약","narration":"마무리 나레이션","cta":"콜투액션"},"fullNarrationText":"전체 나레이션 텍스트"}`,
}

const CHANNEL_LABELS = {
  blog: '블로그', newsletter: '뉴스레터', instagram: '인스타그램 카드뉴스(6~10장)',
  shorts: '숏폼 대본(10~40초)', longform: '롱폼 대본(5~15분, 데이터 빠짐없이)',
}

export async function retryFailedChannels(channels, summary, rawText) {
  if (channels.length === 0) throw new Error('재시도할 채널이 없습니다.')

  const schemaLines = channels.map(ch => CHANNEL_SCHEMAS[ch]).join(',\n  ')
  const channelNames = channels.map(ch => CHANNEL_LABELS[ch]).join(', ')

  const prompt = `당신은 멀티 채널 콘텐츠 전문가입니다. 아래 데이터를 바탕으로 다음 채널의 콘텐츠를 작성해주세요: ${channelNames}

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 절대 변경하지 마세요.
- 사실에 기반한 내용만 작성하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 8000)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  ${schemaLines}
}`

  const maxTokens = channels.includes('longform') ? 16384 : 8192
  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: maxTokens })
  const parsed = parseJSON(result, null)

  if (!parsed) throw new Error('콘텐츠 재생성 결과를 파싱하지 못했습니다.')

  const output = {}
  for (const ch of channels) {
    output[ch] = parsed[ch] || null
  }
  return output
}

// 개별 채널 재시도용 함수들 (1개만 실패 시 사용)
export async function generateBlogContent(summary, rawText) {
  const prompt = `당신은 전문 블로그 작가입니다. 아래 데이터를 바탕으로 블로그 글을 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"블로그 제목","metaDescription":"메타 설명","sections":[{"heading":"섹션 제목","content":"섹션 내용","imagePrompt":"이미지 설명(영문)"}],"tags":["태그"],"summary":"글 요약"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { title: '블로그 생성 실패', sections: [], tags: [], summary: '' })
}

export async function generateNewsletterContent(summary, rawText) {
  const prompt = `당신은 뉴스레터 전문 에디터입니다. 아래 데이터를 바탕으로 뉴스레터를 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"subject":"이메일 제목","preheader":"프리헤더","greeting":"인사말","headline":"헤드라인","keyPoints":["포인트"],"body":"본문","dataHighlights":[{"label":"항목","value":"값"}],"cta":{"text":"CTA","description":"설명"},"closingNote":"마무리"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { subject: '뉴스레터 생성 실패', keyPoints: [], body: '', dataHighlights: [] })
}

export async function generateInstagramContent(summary, rawText) {
  const prompt = `당신은 인스타그램 카드뉴스 전문가입니다. 6~10장의 카드뉴스를 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"cards":[{"cardNumber":1,"headline":"헤드라인","body":"본문(50자 이내)","dataPoint":"데이터","imagePrompt":"이미지 설명(영문)","backgroundColor":"#hex"}],"caption":"캡션","hashtags":["#태그"]}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { cards: [], caption: '', hashtags: [] })
}

export async function generateShortsScript(summary, rawText) {
  const prompt = `당신은 유튜브 숏폼 전문 크리에이터입니다. 10~40초 분량의 숏폼 대본을 작성해주세요.
모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 핵심 데이터 2~3개에 집중하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"영상 제목","duration":"초","hook":"오프닝 훅","scenes":[{"sceneNumber":1,"duration":"초","narration":"나레이션","visualDescription":"화면 설명(영문)","textOverlay":"텍스트"}],"cta":"콜투액션","thumbnailPrompt":"썸네일(영문)"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { title: '숏폼 대본 생성 실패', scenes: [], duration: '0' })
}

export async function generateLongformScript(summary, rawText) {
  const prompt = `당신은 유튜브 롱폼 영상 전문 크리에이터입니다. 5~15분 분량의 롱폼 대본을 작성해주세요.
모든 중요 데이터, 숫자, 통계를 빠짐없이 포함하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 8000)}

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"영상 제목","estimatedDuration":"분:초","intro":{"hook":"훅","narration":"인트로 나레이션","visualDescription":"영상 설명"},"sections":[{"sectionNumber":1,"title":"섹션 제목","duration":"초","narration":"나레이션 전문","dataPoints":["데이터"],"visualElements":[{"type":"chart","description":"설명","data":"데이터"}],"transition":"연결 멘트"}],"outro":{"summary":"요약","narration":"마무리 나레이션","cta":"콜투액션"},"fullNarrationText":"전체 나레이션 텍스트"}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 16384 })
  return parseJSON(result, { title: '롱폼 대본 생성 실패', sections: [], estimatedDuration: '0:00' })
}

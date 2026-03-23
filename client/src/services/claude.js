import { callGeminiWithFallback, parseJSON } from './gemini-core'

export async function generateBlogContent(summary, rawText) {
  const prompt = `당신은 전문 블로그 작가입니다. 아래 데이터를 바탕으로 블로그 글을 작성해주세요.

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요. 절대 변경하지 마세요.
- 사실에 기반한 내용만 작성하세요. 추측이나 창작을 하지 마세요.
- SEO에 최적화된 구조로 작성하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트 (데이터 정확성 참고용)
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "블로그 제목 (SEO 최적화)",
  "metaDescription": "메타 설명 (160자 이내)",
  "sections": [
    {
      "heading": "섹션 제목",
      "content": "섹션 내용 (마크다운 형식)",
      "imagePrompt": "이 섹션에 어울리는 이미지 설명 (영문, Flux 이미지 생성용)"
    }
  ],
  "tags": ["태그1", "태그2"],
  "summary": "글 요약 (200자)"
}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { title: '블로그 생성 실패', sections: [], tags: [], summary: '' })
}

export async function generateNewsletterContent(summary, rawText) {
  const prompt = `당신은 뉴스레터 전문 에디터입니다. 아래 데이터를 바탕으로 뉴스레터 콘텐츠를 작성해주세요.

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
- 독자가 핵심을 빠르게 파악할 수 있도록 구성하세요.
- 전문적이면서도 읽기 쉬운 톤으로 작성하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "subject": "이메일 제목",
  "preheader": "프리헤더 텍스트 (100자 이내)",
  "greeting": "인사말",
  "headline": "메인 헤드라인",
  "keyPoints": ["핵심 포인트 1", "핵심 포인트 2"],
  "body": "본문 내용 (마크다운 형식)",
  "dataHighlights": [{"label": "항목", "value": "값"}],
  "cta": {"text": "CTA 버튼 텍스트", "description": "CTA 설명"},
  "closingNote": "마무리 멘트"
}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { subject: '뉴스레터 생성 실패', keyPoints: [], body: '', dataHighlights: [] })
}

export async function generateInstagramContent(summary, rawText) {
  const prompt = `당신은 인스타그램 카드뉴스 전문가입니다. 아래 데이터를 바탕으로 인스타그램 카드뉴스 콘텐츠를 작성해주세요.

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
- 각 카드는 한 가지 핵심 메시지만 담으세요.
- 시각적으로 강렬하고 짧은 텍스트를 사용하세요.
- 카드는 6~10장으로 구성하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "cards": [
    {
      "cardNumber": 1,
      "headline": "카드 헤드라인",
      "body": "카드 본문 (50자 이내)",
      "dataPoint": "핵심 데이터 (있을 경우)",
      "imagePrompt": "카드 배경 이미지 설명 (영문, Flux 생성용)",
      "backgroundColor": "#hex색상코드"
    }
  ],
  "caption": "인스타그램 캡션 (해시태그 포함)",
  "hashtags": ["#해시태그1", "#해시태그2"]
}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { cards: [], caption: '', hashtags: [] })
}

export async function generateShortsScript(summary, rawText) {
  const prompt = `당신은 유튜브 숏폼 전문 크리에이터입니다. 아래 데이터를 바탕으로 10~40초 분량의 숏폼 영상 대본을 작성해주세요.

## 핵심 규칙
- 모든 숫자, 통계, 데이터는 원본 그대로 사용하세요.
- 시청자의 주의를 끌 수 있는 임팩트 있는 오프닝을 작성하세요.
- 핵심 데이터 2~3개에 집중하세요.
- 나레이션 기준 10~40초 분량으로 작성하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트
${rawText.slice(0, 3000)}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "영상 제목",
  "duration": "예상 길이 (초)",
  "hook": "오프닝 훅 (3초 이내)",
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
}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4 })
  return parseJSON(result, { title: '숏폼 대본 생성 실패', scenes: [], duration: '0' })
}

export async function generateLongformScript(summary, rawText) {
  const prompt = `당신은 유튜브 롱폼 영상 전문 크리에이터입니다. 아래 데이터를 바탕으로 PDF의 모든 중요 데이터가 포함된 롱폼 영상 대본을 작성해주세요.

## 핵심 규칙
- PDF에 있는 모든 중요 데이터, 숫자, 통계가 빠짐없이 포함되어야 합니다.
- 원본 데이터를 절대 변경하지 마세요.
- 시청자가 이해하기 쉽도록 데이터를 논리적으로 구성하세요.
- 분량은 데이터 양에 따라 충분히 길게 작성하세요 (5~15분).
- 각 섹션마다 시각 자료(차트, 표, 그래프) 표시 지시를 포함하세요.

## 요약 데이터
${JSON.stringify(summary, null, 2)}

## 원본 텍스트 (전체 - 모든 데이터 포함 필수)
${rawText}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "영상 제목",
  "estimatedDuration": "예상 길이 (분:초)",
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
      "narration": "나레이션 전문",
      "dataPoints": ["이 섹션에서 다루는 정확한 데이터"],
      "visualElements": [
        {
          "type": "chart/table/image/text",
          "description": "시각 요소 설명",
          "data": "표시할 데이터"
        }
      ],
      "transition": "다음 섹션 연결 멘트"
    }
  ],
  "outro": {
    "summary": "핵심 요약",
    "narration": "마무리 나레이션",
    "cta": "구독/좋아요 콜투액션"
  },
  "fullNarrationText": "전체 나레이션 텍스트 (Creatomate 영상 생성용)"
}`

  const result = await callGeminiWithFallback(prompt, { temperature: 0.4, maxOutputTokens: 16384 })
  return parseJSON(result, { title: '롱폼 대본 생성 실패', sections: [], estimatedDuration: '0:00' })
}

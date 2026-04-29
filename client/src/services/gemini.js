import { callGeminiWithFallback, parseJSON } from './gemini-core'

export async function verifyParsedContent(parsedText, options = {}) {
  const focusInstruction = options.focus ? `\n분석 중점 사항: ${options.focus}` : ''
  const extraInstruction = options.extra ? `\n추가 지시사항: ${options.extra}` : ''

  const prompt = `당신은 데이터 검증 및 교정 전문가입니다. 아래는 PDF에서 추출된 텍스트입니다.${focusInstruction}${extraInstruction}

다음을 수행해주세요:
1. 텍스트의 구조와 논리적 흐름을 확인
2. 숫자, 통계, 데이터가 일관성이 있는지 검증
3. 누락되었거나 깨진 부분이 있는지 확인
4. 간단한 오타, 맞춤법 오류, 띄어쓰기 오류는 자동으로 수정하여 correctedText에 반영
5. 검증 결과를 JSON 형태로 반환

규칙:
- 오타/맞춤법/띄어쓰기/쉼표 등 문장 의미가 변하지 않는 오류는 correctedText에서 조용히 수정하세요. issues에 기록하지 마세요.
- 숫자, 통계 데이터는 절대 변경하지 마세요.
- issues에는 논리적 오류, 데이터 불일치, 구조적 문제, 누락된 내용 등 의미에 영향을 주는 문제만 기록하세요.
- 심각한 구조적 문제만 isValid를 false로 설정하세요. 단순 표기 수정만 있으면 isValid는 true이고 issues는 빈 배열입니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "isValid": true/false,
  "issues": ["발견된 문제 목록"],
  "correctedText": "오타가 수정된 텍스트 (문제가 없으면 원본 그대로)",
  "confidence": 0.0~1.0
}

추출된 텍스트:
${parsedText}`

  const result = await callGeminiWithFallback(prompt, { jsonMode: true })
  return parseJSON(result, { isValid: true, issues: [], correctedText: parsedText, confidence: 0.8 })
}

function buildUniversityListSummaryInstruction() {
  return `
## 대학 리스트 요약 규칙
- 원문에 여러 대학명과 각 대학별 조건, 일정, 전형, 반영 기준, 준비 사항이 나열되어 있으면 한 대학만 반복해서 요약하지 마세요.
- 가나다순 또는 문서 첫머리에 나온 대학 하나에 치우치지 말고, 원문에 실제로 등장하는 여러 대학을 대표적으로 골라 비교형으로 요약하세요.
- 대학 리스트가 길면 전체를 모두 나열하지 말고, 인지도와 중요도가 높은 상위권/주요 대학 몇 곳을 다양하게 선택하세요. 단, 원문에 없는 대학은 절대 추가하지 마세요.
- 선택할 때는 건국대, 성균관대, 서울대처럼 서로 다른 대학의 조건 차이가 드러나도록 고르세요. 같은 대학 정보만 keyData, insights, summary에 반복하지 마세요.
- 대표 대학 몇 곳만 예시로 정리하는 경우, 문장 끝에 "등"을 자연스럽게 붙여 원문에 다른 대학도 더 있음을 드러내세요.
- rawDataPoints에는 선택한 여러 대학의 원문 근거 문장을 각각 포함하세요.

예시:
원문에 "2027 입시에서 건국대는 학생부 반영 비율이 높고, 성균관대는 수능 최저 기준을 확인해야 하며, 서울대는 전공 연계 활동과 면접 대비가 중요하다"처럼 여러 대학 조건이 나오면,
"2027 입시에서는 건국대는 학생부 반영 비율, 성균관대는 수능 최저 기준, 서울대는 전공 연계 활동과 면접 대비가 핵심 변수로 정리되는 등 대학별 확인 포인트가 다르게 나타납니다."처럼 여러 대학을 함께 보여주세요.
`
}

export async function summarizeContent(verifiedText, options = {}) {
  const styleMap = {
    data: '데이터와 수치 중심으로 분석적으로 요약하세요.',
    story: '스토리텔링 방식으로 흥미롭게 요약하세요.',
    compare: '비교 분석 관점에서 대조와 차이점을 중심으로 요약하세요.',
  }
  const styleInstruction = options.style && options.style !== 'auto' && styleMap[options.style]
    ? `\n요약 스타일: ${styleMap[options.style]}`
    : ''
  const keywordsInstruction = options.keywords ? `\n강조 키워드: ${options.keywords} (이 키워드들을 중심으로 요약)` : ''
  const extraInstruction = options.extra ? `\n추가 지시사항: ${options.extra}` : ''

  const prompt = `당신은 콘텐츠 분석 전문가입니다. 아래 텍스트의 핵심 내용을 정확하게 요약해주세요.${styleInstruction}${keywordsInstruction}${extraInstruction}

중요: 원본 데이터의 숫자, 통계, 팩트를 절대 변경하지 마세요. 모든 데이터는 원문 그대로 인용해야 합니다.
${buildUniversityListSummaryInstruction()}

다음을 포함해주세요:
1. 문서 제목/주제
2. 핵심 데이터 포인트 (숫자, 통계 등 - 원문 그대로)
3. 주요 인사이트 3~5개
4. 핵심 키워드 10개
5. 전체 요약 (300자 이내)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "title": "문서 제목",
  "keyData": [{"label": "항목명", "value": "값", "context": "맥락"}],
  "insights": ["인사이트1", "인사이트2"],
  "keywords": ["키워드1", "키워드2"],
  "summary": "전체 요약",
  "rawDataPoints": ["원본에서 추출한 정확한 데이터 문장들"]
}

텍스트:
${verifiedText}`

  const result = await callGeminiWithFallback(prompt, { jsonMode: true })
  return parseJSON(result, {
    title: '요약 생성 실패',
    keyData: [],
    insights: [],
    keywords: [],
    summary: verifiedText.slice(0, 300),
    rawDataPoints: [],
  })
}

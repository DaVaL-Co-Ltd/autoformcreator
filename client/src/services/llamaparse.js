import { callGeminiWithFallback } from './gemini-core'

const LLAMAPARSE_API_KEY = import.meta.env.VITE_LLAMAPARSE_API_KEY
const LLAMAPARSE_PROXY = 'http://localhost:3001/api/llamaparse'


const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ── LlamaParse: 텍스트 기반 PDF 추출 ──
async function llamaParsePDF(file) {
  const formData = new FormData()
  formData.append('file', file)

  const uploadRes = await fetch(`${LLAMAPARSE_PROXY}/upload`, {
    method: 'POST',
    headers: { 'x-api-key': LLAMAPARSE_API_KEY },
    body: formData,
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}))
    throw new Error(`LlamaParse 업로드 실패: ${uploadRes.status} - ${err.detail || err.error || ''}`)
  }
  const { id: jobId } = await uploadRes.json()

  let status = 'PENDING'
  let attempts = 0
  while (status !== 'SUCCESS' && attempts < 60) {
    await new Promise(r => setTimeout(r, 2000))
    const statusRes = await fetch(`${LLAMAPARSE_PROXY}/job/${jobId}`, {
      headers: { 'x-api-key': LLAMAPARSE_API_KEY },
    })
    const statusData = await statusRes.json()
    status = statusData.status
    if (status === 'ERROR') throw new Error('LlamaParse 분석 실패')
    attempts++
  }

  if (status !== 'SUCCESS') throw new Error('LlamaParse 시간 초과')

  const resultRes = await fetch(`${LLAMAPARSE_PROXY}/job/${jobId}/result/markdown`, {
    headers: { 'x-api-key': LLAMAPARSE_API_KEY },
  })

  if (!resultRes.ok) throw new Error('LlamaParse 결과 조회 실패')
  const result = await resultRes.json()
  return result.markdown
}

// 파일 확장자 → MIME 타입 매핑
function getFileMimeType(file) {
  const ext = file.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.hwp': 'application/x-hwp',
    '.hwpx': 'application/x-hwpx',
  }
  return mimeMap[ext] || file.type || 'application/octet-stream'
}

// ── Gemini: 멀티모달 문서 분석 (base64 인라인) ──
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // data:application/pdf;base64,XXXX → XXXX 부분만 추출
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsDataURL(file)
  })
}

async function geminiParsePDF(file) {
  const mimeType = getFileMimeType(file)

  // Gemini가 지원하지 않는 형식(HWP 등)은 스킵
  const geminiSupported = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint']
  if (!geminiSupported.includes(mimeType)) {
    throw new Error(`Gemini는 ${file.name?.split('.').pop()?.toUpperCase()} 형식을 지원하지 않습니다.`)
  }

  // 20MB 초과 시 인라인 불가
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('파일이 20MB를 초과합니다. LlamaParse로 분석합니다.')
  }

  const base64Data = await fileToBase64(file)

  const generateRes = await fetch(`${GEMINI_GENERATE_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: `이 문서의 모든 내용을 정확하게 텍스트로 추출해주세요.

## 핵심 규칙
- 이미지 안에 포함된 텍스트도 모두 읽어서 추출하세요.
- 표, 차트, 그래프에 있는 모든 숫자와 데이터를 정확하게 추출하세요.
- 원본의 구조(제목, 소제목, 목록, 표 등)를 최대한 유지하세요.
- 숫자, 통계, 퍼센트 등 데이터는 절대 변경하지 말고 원본 그대로 추출하세요.
- 추측하거나 내용을 창작하지 마세요. 보이는 것만 추출하세요.
- 마크다운 형식으로 구조화하여 출력하세요.

전체 내용을 빠짐없이 추출해주세요.` }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
    }),
  })

  if (!generateRes.ok) {
    const err = await generateRes.text()
    console.error('[Gemini] 문서 분석 실패 상세:', err)
    throw new Error(`Gemini 문서 분석 실패: ${generateRes.status} - ${err.slice(0, 300)}`)
  }

  const generateData = await generateRes.json()
  const parts = generateData.candidates?.[0]?.content?.parts || []
  const extractedText = parts.filter(p => p.text).map(p => p.text).pop()
  if (!extractedText) throw new Error('Gemini에서 텍스트를 추출하지 못했습니다.')
  return extractedText
}

// ── Gemini로 두 결과를 통합하여 최적 결과 생성 ──
async function mergeResults(llamaText, geminiText) {
  try {
    return await callGeminiWithFallback(`아래에 같은 문서를 두 가지 방식으로 추출한 결과가 있습니다. 두 결과를 통합하여 최적의 문서 텍스트를 만들어주세요.

## 통합 규칙
- 두 결과에서 더 정확하고 완전한 데이터를 선택하세요.
- 숫자, 통계, 퍼센트는 교차 검증하여 정확한 값을 사용하세요.
- 한쪽에만 있는 내용은 포함하되, 신뢰할 수 있는 경우에만 추가하세요.
- 원본 구조(제목, 소제목, 표 등)를 최대한 유지하세요.
- 마크다운 형식으로 출력하세요.
- 절대 내용을 창작하거나 추측하지 마세요.
- 추출 도구나 방법에 대한 설명(LlamaParse, Gemini, OCR 등)은 절대 포함하지 마세요. 순수한 문서 내용만 출력하세요.

---
## 결과 A
${llamaText}

---
## 결과 B
${geminiText}

---
위 두 결과를 통합한 순수 문서 텍스트만 출력하세요. 도구 이름이나 비교 분석을 포함하지 마세요.`, { temperature: 0.1, maxOutputTokens: 65536 })
  } catch {
    return geminiText // 통합 실패 시 Gemini 결과 사용
  }
}

// ── 메인: LlamaParse + Gemini 병렬 분석 → 통합 ──
export async function parsePDF(file) {
  const [llamaResult, geminiResult] = await Promise.allSettled([
    llamaParsePDF(file),
    geminiParsePDF(file),
  ])

  const llamaText = llamaResult.status === 'fulfilled' ? llamaResult.value : null
  const geminiText = geminiResult.status === 'fulfilled' ? geminiResult.value : null
  const llamaError = llamaResult.status === 'rejected' ? llamaResult.reason.message : null
  const geminiError = geminiResult.status === 'rejected' ? geminiResult.reason.message : null

  // 둘 다 실패
  if (!llamaText && !geminiText) {
    throw new Error(`LlamaParse: ${llamaError} / Gemini: ${geminiError}`)
  }

  // 둘 다 성공 → Gemini로 통합
  if (llamaText && geminiText) {
    const merged = await mergeResults(llamaText, geminiText)
    return merged
  }

  // 하나만 성공
  return geminiText || llamaText
}

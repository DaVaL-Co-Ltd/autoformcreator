import { callGeminiWithFallback, requestGeminiContent } from './gemini-core'

const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const LLAMAPARSE_PROXY = `${API_BASE}/api/llamaparse`

// LlamaParse: 텍스트 기반 문서 추출
async function llamaParsePDF(file) {
  const formData = new FormData()
  formData.append('file', file)

  const uploadRes = await fetch(`${LLAMAPARSE_PROXY}/upload`, {
    method: 'POST',
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
    const statusRes = await fetch(`${LLAMAPARSE_PROXY}/job/${jobId}`)
    const statusData = await statusRes.json()
    status = statusData.status
    if (status === 'ERROR') throw new Error('LlamaParse 분석 실패')
    attempts++
  }

  if (status !== 'SUCCESS') throw new Error('LlamaParse 시간 초과')

  const resultRes = await fetch(`${LLAMAPARSE_PROXY}/job/${jobId}/result/markdown`)

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
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }
  return mimeMap[ext] || file.type || 'application/octet-stream'
}

function isImageFile(file) {
  const ext = file.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
}

function isPlainTextFile(file) {
  const ext = file.name?.toLowerCase().match(/\.[^.]+$/)?.[0]
  return ext === '.txt'
}

function readPlainTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').trim())
    reader.onerror = () => reject(new Error('TXT 파일을 읽지 못했습니다.'))
    reader.readAsText(file, 'utf-8')
  })
}

// Gemini 멀티모달 문서 분석용 base64 변환
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsDataURL(file)
  })
}

async function geminiParsePDF(file) {
  const mimeType = getFileMimeType(file)

  const geminiSupported = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]

  if (!geminiSupported.includes(mimeType)) {
    throw new Error(`Gemini는 ${file.name?.split('.').pop()?.toUpperCase()} 형식을 지원하지 않습니다.`)
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error('파일이 20MB를 초과합니다. LlamaParse로 분석합니다.')
  }

  const base64Data = await fileToBase64(file)

  const generateData = await requestGeminiContent({
    model: 'gemini-2.5-flash',
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

전체 내용을 빠짐없이 추출해주세요.` },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
  })

  const parts = generateData.candidates?.[0]?.content?.parts || []
  const extractedText = parts.filter(p => p.text).map(p => p.text).join('\n')
  if (!extractedText) throw new Error('Gemini에서 텍스트를 추출하지 못했습니다.')
  return extractedText
}

// 두 분석 결과를 Gemini로 통합
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
    return geminiText
  }
}

// 메인: LlamaParse + Gemini 병렬 분석 후 통합
export async function parsePDF(file) {
  if (isPlainTextFile(file)) {
    return await readPlainTextFile(file)
  }

  if (isImageFile(file)) {
    return await geminiParsePDF(file)
  }

  const [llamaResult, geminiResult] = await Promise.allSettled([
    llamaParsePDF(file),
    geminiParsePDF(file),
  ])

  const llamaText = llamaResult.status === 'fulfilled' ? llamaResult.value : null
  const geminiText = geminiResult.status === 'fulfilled' ? geminiResult.value : null
  const llamaError = llamaResult.status === 'rejected' ? llamaResult.reason.message : null
  const geminiError = geminiResult.status === 'rejected' ? geminiResult.reason.message : null

  if (!llamaText && !geminiText) {
    throw new Error(`LlamaParse: ${llamaError} / Gemini: ${geminiError}`)
  }

  if (llamaText && geminiText) {
    return await mergeResults(llamaText, geminiText)
  }

  return geminiText || llamaText
}

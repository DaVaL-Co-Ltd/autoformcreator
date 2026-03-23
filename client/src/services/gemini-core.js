const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// 사용 가능한 모델 목록 (429 발생 시 다음 모델로 자동 전환)
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
]

// 모델별 소진 상태 추적 (세션 동안 유지)
const exhaustedModels = new Set()

export async function callGeminiWithFallback(prompt, options = {}) {
  const { temperature = 0.3, maxOutputTokens = 8192 } = options

  // 소진되지 않은 모델 우선
  const availableModels = [
    ...MODELS.filter(m => !exhaustedModels.has(m)),
    ...MODELS.filter(m => exhaustedModels.has(m)), // 소진된 모델도 백업으로
  ]

  for (const model of availableModels) {
    try {
      const res = await fetch(`${BASE}/${model}:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        }),
      })

      if (res.status === 429) {
        exhaustedModels.add(model)
        console.warn(`[Gemini] ${model} 할당량 소진 → 다음 모델로 전환`)
        continue // 다음 모델 시도
      }

      if (!res.ok) {
        const err = await res.text()
        // 모델이 존재하지 않는 경우 다음으로
        if (res.status === 404) {
          console.warn(`[Gemini] ${model} 사용 불가 → 다음 모델로 전환`)
          continue
        }
        throw new Error(`Gemini API 오류 (${model}): ${res.status} - ${err}`)
      }

      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (text) {
        console.log(`[Gemini] ${model} 사용 성공`)
        return text
      }
    } catch (err) {
      // 네트워크 에러 등은 다음 모델 시도
      if (model === availableModels[availableModels.length - 1]) throw err
      console.warn(`[Gemini] ${model} 실패: ${err.message}`)
    }
  }

  throw new Error('모든 Gemini 모델의 할당량이 소진되었습니다. 내일 다시 시도하거나 API 키를 추가해주세요.')
}

export function parseJSON(result, fallback) {
  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return fallback
  }
}

// 현재 사용 가능한 모델 수 확인
export function getAvailableModelCount() {
  return MODELS.filter(m => !exhaustedModels.has(m)).length
}

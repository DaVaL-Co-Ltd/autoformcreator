const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// 사용 가능한 모델 목록 (429 발생 시 다음 모델로 자동 전환)
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
]

// 모델별 429 발생 시각 추적 (60초 후 자동 해제)
const rateLimitedUntil = new Map()

function isRateLimited(model) {
  const until = rateLimitedUntil.get(model)
  if (!until) return false
  if (Date.now() > until) {
    rateLimitedUntil.delete(model)
    return false
  }
  return true
}

function markRateLimited(model) {
  // 60초 후 자동 해제
  rateLimitedUntil.set(model, Date.now() + 60000)
}

// 429 시 대기 후 재시도
async function waitForRateLimit(retryAfterMs = 5000) {
  console.log(`[Gemini] Rate limit 대기 ${retryAfterMs / 1000}초...`)
  await new Promise(r => setTimeout(r, retryAfterMs))
}

export async function callGeminiWithFallback(prompt, options = {}) {
  const { temperature = 0.3, maxOutputTokens = 65536, jsonMode = false } = options

  // rate limit 안 걸린 모델 우선, 걸린 모델은 뒤로
  const availableModels = [
    ...MODELS.filter(m => !isRateLimited(m)),
    ...MODELS.filter(m => isRateLimited(m)),
  ]

  let lastError = null

  for (const model of availableModels) {
    // 최대 2번 시도 (429 시 대기 후 1회 재시도)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${BASE}/${model}:generateContent?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens, ...(jsonMode ? { responseMimeType: 'application/json' } : {}) },
          }),
        })

        if (res.status === 429) {
          markRateLimited(model)
          if (attempt === 0) {
            // 첫 번째 429 → 대기 후 같은 모델 재시도
            const retryAfter = res.headers.get('retry-after')
            await waitForRateLimit(retryAfter ? parseInt(retryAfter) * 1000 : 5000)
            continue
          }
          // 두 번째 429 → 다음 모델로
          console.warn(`[Gemini] ${model} 할당량 소진 → 다음 모델로 전환`)
          break
        }

        if (!res.ok) {
          const err = await res.text()
          if (res.status === 404) {
            console.warn(`[Gemini] ${model} 사용 불가 → 다음 모델로 전환`)
            break
          }
          lastError = new Error(`Gemini API 오류 (${model}): ${res.status} - ${err.slice(0, 200)}`)
          break
        }

        const data = await res.json()
        // thinking 모델은 [thought, answer] 순서 — thought를 제외한 text part를 모두 합침
        const parts = data.candidates?.[0]?.content?.parts || []
        const textParts = parts.filter(p => p.text && !p.thought)
        const text = textParts.map(p => p.text).join('\n') || ''
        if (text) {
          console.log(`[Gemini] ${model} 사용 성공`)
          return text
        }

        // 빈 응답 — 안전 필터 또는 토큰 초과
        const finishReason = data.candidates?.[0]?.finishReason
        const blockReason = data.promptFeedback?.blockReason
        if (blockReason) {
          lastError = new Error(`Gemini 안전 필터에 의해 차단됨: ${blockReason}`)
          console.warn(`[Gemini] ${model} 차단됨: ${blockReason}`)
        } else if (finishReason && finishReason !== 'STOP') {
          lastError = new Error(`Gemini 응답 비정상 종료: ${finishReason}`)
          console.warn(`[Gemini] ${model} 비정상 종료: ${finishReason}`)
        } else {
          console.warn(`[Gemini] ${model} 빈 응답 → 다음 모델 시도`)
        }
        break
      } catch (err) {
        lastError = err
        console.warn(`[Gemini] ${model} 실패: ${err.message}`)
        break
      }
    }
  }

  throw lastError || new Error('모든 Gemini 모델에서 응답을 받지 못했습니다.')
}

export function parseJSON(result, fallback) {
  try {
    // 코드블록 제거
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    // JSON 객체 부분만 추출 (앞뒤 텍스트 제거)
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1)
    }
    return JSON.parse(cleaned)
  } catch {
    return fallback
  }
}

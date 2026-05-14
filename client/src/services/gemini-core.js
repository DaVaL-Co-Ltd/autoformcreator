const API_BASE = import.meta.env.VITE_SERVER_URL || ''
const GEMINI_PROXY_URL = `${API_BASE}/api/gemini/generate-content`

// 사용 가능한 Gemini 모델 목록 (429 발생 시 다음 모델로 자동 전환)
const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
]

// 모델별 429 발생 시각 추적 (60초 뒤 자동 해제)
const rateLimitedUntil = new Map()

function abortableDelay(ms, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms))
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

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
  // 60초 동안 제외
  rateLimitedUntil.set(model, Date.now() + 60000)
}

// 429 재시도 대기
async function waitForRateLimit(retryAfterMs = 5000, signal) {
  console.log(`[Gemini] Rate limit 감지, ${retryAfterMs / 1000}초 대기...`)
  await abortableDelay(retryAfterMs, signal)
}

async function readGeminiProxyResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { rawText: text }
  }
}

function getGeminiErrorMessage(data, fallback) {
  return data?.error?.message || data?.message || data?.error || data?.rawText || fallback
}

export async function requestGeminiContent({
  model,
  contents,
  generationConfig,
  safetySettings,
  tools,
  toolConfig,
  systemInstruction,
  signal,
}) {
  const response = await fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      contents,
      generationConfig,
      safetySettings,
      tools,
      toolConfig,
      systemInstruction,
    }),
  })

  const data = await readGeminiProxyResponse(response)
  if (!response.ok) {
    throw new Error(`Gemini API 오류 (${model}): ${response.status} - ${getGeminiErrorMessage(data, `HTTP ${response.status}`).slice(0, 200)}`)
  }

  return data
}

export function findInlineDataPart(data) {
  for (const candidate of data?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (part?.inlineData) return part
    }
  }

  return null
}

export async function callGeminiWithFallback(prompt, options = {}) {
  const { temperature = 0.3, maxOutputTokens = 65536, jsonMode = false, signal } = options

  // rate limit에 걸린 모델은 뒤로 보내고, 가능한 모델부터 먼저 시도
  const availableModels = [
    ...MODELS.filter(m => !isRateLimited(m)),
    ...MODELS.filter(m => isRateLimited(m)),
  ]

  let lastError = null

  for (const model of availableModels) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    // 각 모델은 최대 2번 시도 (429 재시도 1회 포함)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await requestGeminiContent({
          model,
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
          signal,
        })

        // thinking 모델은 [thought, answer] 순서일 수 있어 thought 파트는 제외
        const parts = data.candidates?.[0]?.content?.parts || []
        const textParts = parts.filter(p => p.text && !p.thought)
        const text = textParts.map(p => p.text).join('\n') || ''
        if (text) {
          console.log(`[Gemini] ${model} 응답 성공`)
          return text
        }

        // 빈 응답이면 차단 사유나 비정상 종료 여부를 먼저 확인한다.
        const finishReason = data.candidates?.[0]?.finishReason
        const blockReason = data.promptFeedback?.blockReason
        if (blockReason) {
          lastError = new Error(`Gemini 요청 차단 사유: ${blockReason}`)
          console.warn(`[Gemini] ${model} 차단 사유: ${blockReason}`)
        } else if (finishReason && finishReason !== 'STOP') {
          lastError = new Error(`Gemini 응답 비정상 종료: ${finishReason}`)
          console.warn(`[Gemini] ${model} 비정상 종료: ${finishReason}`)
        } else {
          console.warn(`[Gemini] ${model} 빈 응답, 다음 모델 시도`)
        }
        break
      } catch (err) {
        const message = String(err?.message || '')
        const statusMatch = message.match(/Gemini API .*: (\d{3}) -/)
        const statusCode = statusMatch ? Number(statusMatch[1]) : null

        if (statusCode === 429) {
          markRateLimited(model)
          if (attempt === 0) {
            await waitForRateLimit(5000, signal)
            continue
          }
          console.warn(`[Gemini] ${model} 재시도 후에도 429, 다음 모델로 전환`)
          break
        }

        if (statusCode === 404) {
          console.warn(`[Gemini] ${model} 모델을 찾을 수 없음, 다음 모델로 전환`)
          break
        }

        lastError = err
        console.warn(`[Gemini] ${model} 호출 실패: ${err.message}`)
        break
      }
    }
  }

  throw lastError || new Error('모든 Gemini 모델에서 응답을 받지 못했습니다.')
}

export function parseJSON(result, fallback) {
  try {
    // 코드 펜스와 앞뒤 잡음을 제거한다.
    let cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    // JSON 객체 범위만 잘라 파싱해 앞뒤 설명문이 섞여도 복구한다.
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

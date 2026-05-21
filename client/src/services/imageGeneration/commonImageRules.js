import { findInlineDataPart, requestGeminiContent } from '../gemini-core'

// 이미지 생성 동시 실행 상한. Gemini 이미지 모델은 텍스트보다 rate limit 이 빡빡해
// 2 로 제한한다(blog·instagram 배치가 겹쳐도 합쳐서 4 동시까지).
export const IMAGE_GENERATION_CONCURRENCY = 2

// items 를 fn 으로 매핑하되 동시 실행 수를 limit 으로 제한한다. 결과는 입력 순서를 보존한다.
// fn 은 자체적으로 예외를 처리해야 한다(throw 하면 전체가 reject 됨).
export async function mapWithConcurrency(items, limit, fn) {
  const list = Array.isArray(items) ? items : []
  const results = new Array(list.length)
  let cursor = 0
  async function worker() {
    while (cursor < list.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(list[index], index)
    }
  }
  const workerCount = Math.max(1, Math.min(limit, list.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

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

export async function generateImage(prompt, retries = 2, signal) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    try {
      const data = await requestGeminiContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        signal,
      })
      const imagePart = findInlineDataPart(data)

      if (!imagePart) throw new Error('이미지를 생성하지 못했습니다.')

      const base64 = imagePart.inlineData.data
      const mimeType = imagePart.inlineData.mimeType || 'image/png'
      return `data:${mimeType};base64,${base64}`
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      if (String(err?.message || '').includes(': 429 -')) {
        await abortableDelay(5000, signal)
        continue
      }

      if (attempt === retries) throw err
      await abortableDelay(3000, signal)
    }
  }
}

export const STYLE_PROMPTS = {
  pastel: 'Soft pastel illustration style. Gentle hand-crafted illustration look, matte surfaces, light grain, soft edges, warm editorial composition, cute but clearly illustrated rather than rendered.',
  '3d': 'Highly polished 3D rendered style. Glossy materials, clear depth, strong dimensional lighting, soft reflections, toy-like objects, bold foreground/background separation.',
  minimal: 'Soft pastel illustration style. Gentle hand-crafted illustration look, matte surfaces, light grain, soft edges, warm editorial composition.',
  photo: 'Ultra photorealistic photography style. Documentary-grade real photo look, realistic lens behavior, natural depth of field, authentic lighting, detailed textures, real-world materials, actual people, real classrooms, real school buildings, real campuses, and believable studying situations. No painterly, illustrated, cartoon, CG, or rendered appearance.',
  watercolor: 'Soft watercolor painting style. Delicate washes of color, gentle blends.',
  'solid-pattern': 'Simple poster background style with a solid color base or a very subtle repeating pattern. Use broad clean shapes, dots, lines, grid motifs, or soft geometric accents. Keep the composition minimal and uncluttered.',
}

export const COLOR_PROMPTS = {
  blue: 'Color palette: soft sky blue, light cyan, navy accents.',
  pink: 'Color palette: soft pink, rose, light coral.',
  green: 'Color palette: mint green, sage, light teal.',
  purple: 'Color palette: soft lavender, light purple, violet accents.',
}

export const NO_LETTER_PROMPT = 'CRITICAL TEXT RULE: the image must contain zero readable letters or words. Absolutely no Korean text, no Hangul, no English letters, no Japanese characters, no Chinese characters, no Arabic letters, no words, no fake text, no handwritten marks, no logo text, no signage text, no labels, no captions, and no typography of any kind. If any text-like shape appears, it is a failed image. Regenerate mentally and keep the background free of all letters. Only plain numeric digits 0-9 are allowed when truly necessary; otherwise prefer no symbols at all.'

export const DOM_TEXT_OVERLAY_PROMPT = 'The final readable text is added later by the app as DOM overlay text. Do not bake any text into the image. Keep enough calm visual space for wrapped overlay text, but do not draw placeholder text boxes, empty panels, fake captions, labels, or typography.'

export function getStylePrompt(imageStyle, fallback = STYLE_PROMPTS.pastel) {
  return imageStyle && imageStyle !== 'auto' && STYLE_PROMPTS[imageStyle]
    ? STYLE_PROMPTS[imageStyle]
    : fallback
}

export function getColorPrompt(mainColor) {
  return mainColor && mainColor !== 'auto' && COLOR_PROMPTS[mainColor]
    ? COLOR_PROMPTS[mainColor]
    : ''
}

export function pickPalette(seed = '', palettes = []) {
  if (!palettes.length) return ''
  const index = hashString(seed) % palettes.length
  return palettes[index]
}

function hashString(value = '') {
  let hash = 0
  const text = String(value)
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

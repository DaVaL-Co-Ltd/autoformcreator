const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_IMAGE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'

async function generateImage(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      })

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 5000))
        continue
      }

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`이미지 생성 실패: ${res.status} - ${err.slice(0, 200)}`)
      }

      const data = await res.json()
      const parts = data.candidates?.[0]?.content?.parts || []
      const imagePart = parts.find(p => p.inlineData)

      if (!imagePart) throw new Error('이미지를 생성하지 못했습니다.')

      const base64 = imagePart.inlineData.data
      const mimeType = imagePart.inlineData.mimeType || 'image/png'
      return `data:${mimeType};base64,${base64}`
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}

const STYLE_PROMPTS = {
  pastel: 'STRICT: PASTEL palette ONLY. Cute 3D rendered icons. Warm rounded friendly style.',
  '3d': '3D rendered style with vibrant colors. Bold 3D objects and icons.',
  minimal: 'Minimal flat vector style. Clean lines, solid colors, geometric shapes.',
  photo: 'Realistic photographic style. High quality, natural lighting.',
  watercolor: 'Soft watercolor painting style. Delicate washes of color, gentle blends.',
}

const COLOR_PROMPTS = {
  blue: 'Color palette: soft sky blue, light cyan, navy accents.',
  pink: 'Color palette: soft pink, rose, light coral.',
  green: 'Color palette: mint green, sage, light teal.',
  purple: 'Color palette: soft lavender, light purple, violet accents.',
}

export async function generateBlogImages(sections, options = {}) {
  const styleHint = options.imageStyle && options.imageStyle !== 'auto' && STYLE_PROMPTS[options.imageStyle]
    ? STYLE_PROMPTS[options.imageStyle]
    : STYLE_PROMPTS.pastel
  const colorHint = options.mainColor && options.mainColor !== 'auto' && COLOR_PROMPTS[options.mainColor]
    ? COLOR_PROMPTS[options.mainColor]
    : ''
  const extraHint = options.extra ? ` ${options.extra}.` : ''

  const results = []
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    try {
      const colorVariations = [
        { tone: 'soft peach, warm cream', icons: 'books, pencils, paper scrolls, reading glasses, study notes' },
        { tone: 'soft sky blue, light cyan', icons: 'calculator, ruler, compass, geometric shapes, graph paper' },
        { tone: 'soft mint green, light teal', icons: 'microscope, test tubes, magnifying glass, lightbulb, seedling' },
        { tone: 'soft lavender, light purple', icons: 'notebook, graduation cap, star, clock, abacus' },
        { tone: 'warm yellow, soft apricot', icons: 'trophy, target, checklist, heart, pencil case' },
      ]
      const variation = colorVariations[i % colorVariations.length]
      const paletteDesc = colorHint || `${variation.tone}`
      const bgPrompt = `Generate a 1:1 square illustration for a Korean education blog thumbnail about "${section.heading}". ${styleHint} Color palette: ${paletteDesc}. Icons on edges: ${variation.icons}. CENTER MUST BE EMPTY - leave middle 60% blank for text overlay. Icons ONLY on edges and corners. NO text, NO letters, NO words, NO numbers. NO realistic photos, NO people. Cute Korean educational style.${extraHint}`
      const imageUrl = await generateImage(bgPrompt)
      results.push({
        heading: section.heading,
        imageUrl,
        keyPhrase: section.keyPhrase || section.heading,
        style: 'overlay',
      })
    } catch {
      results.push({
        heading: section.heading,
        imageUrl: null,
        keyPhrase: section.keyPhrase || section.heading,
        style: 'overlay',
      })
    }
  }
  return results
}

export async function generateInstagramImages(cards, options = {}) {
  const styleHint = options.imageStyle && options.imageStyle !== 'auto' && STYLE_PROMPTS[options.imageStyle]
    ? STYLE_PROMPTS[options.imageStyle]
    : 'Minimal flat vector style. Clean lines.'
  const colorHint = options.mainColor && options.mainColor !== 'auto' && COLOR_PROMPTS[options.mainColor]
    ? ` ${COLOR_PROMPTS[options.mainColor]}`
    : ' Single solid pastel color background.'
  const extraHint = options.extra ? ` ${options.extra}.` : ''

  const results = []
  for (const card of cards) {
    const promptText = card.imagePrompt || `${card.headline || ''} ${card.content || ''}`
    try {
      const instaPrompt = `Generate an image: ${styleHint}${colorHint} ${promptText.trim()}. No text, no letters, no words anywhere. Only flat vector decorations, simple icons, and subtle patterns. Soft, cute aesthetic.${extraHint}`
      const imageUrl = await generateImage(instaPrompt)
      results.push({ cardNumber: card.cardNumber, imageUrl })
    } catch (err) {
      results.push({ cardNumber: card.cardNumber, imageUrl: null, error: err.message })
    }
  }
  return results
}

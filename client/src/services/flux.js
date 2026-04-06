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

export async function generateBlogImages(sections) {
  const results = []
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    try {
      const colorVariations = [
        { tone: 'soft peach, warm cream', icons: 'books, pencils, speech bubbles, paper scrolls, reading glasses' },
        { tone: 'soft sky blue, light cyan', icons: 'calculator, ruler, compass, geometric shapes, graph paper' },
        { tone: 'soft mint green, light teal', icons: 'microscope, test tubes, magnifying glass, lightbulb, seedling' },
        { tone: 'soft lavender, light purple', icons: 'notebook, graduation cap, star, clock, abacus' },
        { tone: 'warm yellow, soft apricot', icons: 'trophy, target, checklist, heart, pencil case' },
      ]
      const variation = colorVariations[i % colorVariations.length]
      const bgPrompt = `Generate a 1:1 square illustration for a Korean education blog thumbnail about "${section.heading}". STRICT: PASTEL palette ONLY (${variation.tone}). Cute 3D rendered icons on edges: ${variation.icons}. Warm rounded friendly style. CENTER MUST BE EMPTY - leave middle 60% blank for text overlay. Icons ONLY on edges and corners. NO text, NO letters, NO words, NO numbers. NO realistic photos, NO people. Cute Korean educational style.`
      const imageUrl = await generateImage(bgPrompt)
      results.push({
        heading: section.heading,
        imageUrl,
        keyPhrase: section.keyPhrase || section.heading,
        style: 'overlay',
      })
    } catch (err) {
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

export async function generateInstagramImages(cards) {
  const results = []
  for (const card of cards) {
    const promptText = card.imagePrompt || `${card.headline || ''} ${card.content || ''}`
    try {
      const instaPrompt = `Generate an image: Minimal clean presentation slide background. Single solid pastel color background. ${promptText.trim()}. No text, no letters, no words anywhere. Only flat vector decorations, simple icons, and subtle patterns. Soft, cute aesthetic.`
      const imageUrl = await generateImage(instaPrompt)
      results.push({ cardNumber: card.cardNumber, imageUrl })
    } catch (err) {
      results.push({ cardNumber: card.cardNumber, imageUrl: null, error: err.message })
    }
  }
  return results
}

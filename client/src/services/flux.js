const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent'

// Gemini 이미지 생성으로 대체 (Flux BFL API 접속 불가)
async function generateImage(prompt) {
  const res = await fetch(`${BASE_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate an image: ${prompt}. Make it professional, clean, and suitable for a blog or social media post. No text in the image.` }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  })

  if (!res.ok) {
    // Gemini 이미지 생성 미지원 시 placeholder 반환
    return null
  }

  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find(p => p.inlineData)

  if (imagePart?.inlineData) {
    const { mimeType, data: base64 } = imagePart.inlineData
    return `data:${mimeType};base64,${base64}`
  }

  return null
}

export async function generateBlogImages(sections) {
  const results = []
  for (const section of sections) {
    if (section.imagePrompt) {
      try {
        const imageUrl = await generateImage(section.imagePrompt)
        results.push({ heading: section.heading, imageUrl })
      } catch (err) {
        results.push({ heading: section.heading, imageUrl: null, error: err.message })
      }
    }
  }
  return results
}

export async function generateInstagramImages(cards) {
  const results = []
  for (const card of cards) {
    if (card.imagePrompt) {
      try {
        const imageUrl = await generateImage(card.imagePrompt)
        results.push({ cardNumber: card.cardNumber, imageUrl })
      } catch (err) {
        results.push({ cardNumber: card.cardNumber, imageUrl: null, error: err.message })
      }
    }
  }
  return results
}

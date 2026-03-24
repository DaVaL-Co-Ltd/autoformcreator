const API_KEY = import.meta.env.VITE_FLUX_API_KEY
const PROXY_URL = '/api/flux'

async function generateImage(prompt, width = 1024, height = 1024) {
  // Step 1: 이미지 생성 요청
  const createRes = await fetch(`${PROXY_URL}/flux-pro-1.1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ prompt, width, height }),
  })

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}))
    throw new Error(`Flux 생성 요청 실패: ${createRes.status} - ${err.detail || err.error || ''}`)
  }

  const { id: taskId } = await createRes.json()
  if (!taskId) throw new Error('Flux 작업 ID를 받지 못했습니다.')

  // Step 2: 결과 폴링 (최대 120초)
  let attempts = 0
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 2000))

    const resultRes = await fetch(`${PROXY_URL}/result/${taskId}`, {
      headers: { 'x-api-key': API_KEY },
    })

    if (!resultRes.ok) {
      attempts++
      continue
    }

    const resultData = await resultRes.json()

    if (resultData.status === 'Ready') {
      const imageUrl = resultData.result?.sample
      if (imageUrl) return imageUrl
      throw new Error('Flux 이미지 URL을 받지 못했습니다.')
    }

    if (resultData.status === 'Error') {
      throw new Error(`Flux 이미지 생성 실패: ${resultData.error || '알 수 없는 오류'}`)
    }

    // Pending / Processing
    attempts++
  }

  throw new Error('Flux 이미지 생성 시간 초과 (120초)')
}

export async function generateBlogImages(sections) {
  const results = []
  for (const section of sections) {
    if (section.imagePrompt) {
      try {
        // 블로그: 가로형 16:9 비율, 전문적이고 깔끔한 스타일
        const blogPrompt = `Professional blog header image. ${section.imagePrompt}. Clean, modern, high-quality editorial photography style. No text overlay, no watermark.`
        const imageUrl = await generateImage(blogPrompt, 1440, 816)
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
        // 인스타그램: 정사각형 1:1, 시각적으로 강렬하고 생생한 스타일
        const instaPrompt = `Vibrant Instagram card news visual. ${card.imagePrompt}. Bold colors, eye-catching, social media optimized, visually striking. No text overlay, no watermark.`
        const imageUrl = await generateImage(instaPrompt, 1024, 1024)
        results.push({ cardNumber: card.cardNumber, imageUrl })
      } catch (err) {
        results.push({ cardNumber: card.cardNumber, imageUrl: null, error: err.message })
      }
    }
  }
  return results
}

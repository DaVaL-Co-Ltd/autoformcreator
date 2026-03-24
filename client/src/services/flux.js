const API_KEY = import.meta.env.VITE_FAL_API_KEY
const PROXY_URL = 'http://localhost:3001/api/fal'

async function generateImage(prompt, width = 1024, height = 1024) {
  // Step 1: 큐에 이미지 생성 요청
  const createRes = await fetch(`${PROXY_URL}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'x-fal-model': 'fal-ai/flux-pro',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width, height },
      num_images: 1,
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}))
    throw new Error(`Flux 생성 요청 실패: ${createRes.status} - ${err.detail || err.message || ''}`)
  }

  const result = await createRes.json()

  // fal.ai 동기 응답 (바로 결과가 오는 경우)
  if (result.images?.[0]?.url) {
    return result.images[0].url
  }

  // 큐 응답인 경우 폴링
  const requestId = result.request_id
  const responseUrl = result.response_url
  if (!requestId || !responseUrl) throw new Error('fal.ai 요청 ID를 받지 못했습니다.')

  // Step 2: 결과 폴링 (최대 120초)
  let attempts = 0
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 2000))

    const resultRes = await fetch(`${PROXY_URL}/result/${requestId}`, {
      headers: { 'x-api-key': API_KEY, 'x-fal-response-url': responseUrl },
    })

    if (!resultRes.ok) {
      attempts++
      continue
    }

    const resultData = await resultRes.json()

    if (resultData.images?.[0]?.url) {
      return resultData.images[0].url
    }

    if (resultData.status === 'FAILED') {
      throw new Error(`Flux 이미지 생성 실패: ${resultData.error || '알 수 없는 오류'}`)
    }

    attempts++
  }

  throw new Error('Flux 이미지 생성 시간 초과 (120초)')
}

export async function generateBlogImages(sections) {
  const results = []
  for (const section of sections) {
    if (section.imagePrompt) {
      try {
        // 블로그: 가로형 16:9 비율, 글자 절대 없는 순수 사진/일러스트
        const blogPrompt = `A beautiful photograph or illustration related to the concept of "${section.heading}". The image must contain ZERO text, ZERO letters, ZERO writing, ZERO symbols, ZERO logos, ZERO watermarks, ZERO signs, ZERO labels, ZERO captions in any language. No books with visible text, no screens with text, no signs, no banners. Only pure visual scenery, objects, or abstract art. Professional photography style, soft bokeh, warm natural lighting, cinematic composition.`
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
        // 인스타그램: 정사각형 1:1, 미리캔버스/Canva PPT 스타일
        const instaPrompt = `Minimal clean presentation slide background for Instagram card news. Single solid pastel color background (soft pink, mint, lavender, sky blue, or cream). ${card.imagePrompt}. Style exactly like Canva or Miricanvas template: simple geometric shapes, small cute vector icons, minimal decorative elements in corners. Absolutely NO text, NO letters, NO words, NO characters anywhere. NO photo-realistic images. Only flat vector decorations, simple icons, and subtle patterns. Very clean with lots of white space in the center for text overlay. Soft, cute, student-friendly aesthetic.`
        const imageUrl = await generateImage(instaPrompt, 1024, 1024)
        results.push({ cardNumber: card.cardNumber, imageUrl })
      } catch (err) {
        results.push({ cardNumber: card.cardNumber, imageUrl: null, error: err.message })
      }
    }
  }
  return results
}

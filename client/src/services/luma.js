const API_KEY = import.meta.env.VITE_LUMA_API_KEY
const PROXY_URL = 'http://localhost:3001/api/luma'

async function generateVideo(prompt, aspectRatio = '9:16') {
  // Step 1: Luma AI 직접 영상 생성 요청
  const createRes = await fetch(`${PROXY_URL}/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspectRatio,
      model: 'ray-flash-2',
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}))
    throw new Error(`Luma 생성 요청 실패: ${createRes.status} - ${err.detail || err.error || ''}`)
  }

  const { id: generationId } = await createRes.json()
  if (!generationId) throw new Error('Luma 작업 ID를 받지 못했습니다.')

  // Step 2: 결과 폴링 (최대 5분)
  let attempts = 0
  while (attempts < 150) {
    await new Promise(r => setTimeout(r, 2000))

    const statusRes = await fetch(`${PROXY_URL}/generations/${generationId}`, {
      headers: { 'x-api-key': API_KEY },
    })

    if (!statusRes.ok) {
      attempts++
      continue
    }

    const statusData = await statusRes.json()

    if (statusData.state === 'completed') {
      const videoUrl = statusData.assets?.video
      if (videoUrl) return { videoUrl, thumbnailUrl: statusData.assets?.thumbnail }
      throw new Error('Luma 영상 URL을 받지 못했습니다.')
    }

    if (statusData.state === 'failed') {
      throw new Error(`Luma 영상 생성 실패: ${statusData.failure_reason || '알 수 없는 오류'}`)
    }

    attempts++
  }

  throw new Error('Luma 영상 생성 시간 초과 (5분)')
}

export async function generateShortsVideos(scenes, onProgress) {
  const results = []
  const total = scenes.filter(s => s.visualDescription).length
  let completed = 0

  for (const scene of scenes) {
    if (scene.visualDescription) {
      onProgress?.({ completed, total, current: scene.sceneNumber })
      try {
        const shortsPrompt = `Short-form vertical video clip. ${scene.visualDescription}. Dynamic camera movement, cinematic quality, engaging visual for social media shorts.`
        const result = await generateVideo(shortsPrompt, '9:16')
        results.push({
          sceneNumber: scene.sceneNumber,
          videoUrl: result.videoUrl,
          thumbnailUrl: result.thumbnailUrl,
        })
      } catch (err) {
        results.push({
          sceneNumber: scene.sceneNumber,
          videoUrl: null,
          error: err.message,
        })
      }
      completed++
      onProgress?.({ completed, total, current: null })
    }
  }
  return results
}

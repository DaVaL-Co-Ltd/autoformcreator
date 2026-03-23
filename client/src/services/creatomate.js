const API_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const BASE_URL = 'https://api.creatomate.com/v1'

export async function generateLongformVideo(script) {
  // 영상 섹션별 요소 구성
  const elements = []
  let currentTime = 0

  // 인트로
  if (script.intro) {
    elements.push({
      type: 'text',
      text: script.title,
      duration: 5,
      time: currentTime,
      style: { fontSize: '48px', fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center' },
    })
    currentTime += 5
  }

  // 각 섹션
  for (const section of script.sections || []) {
    const sectionDuration = parseInt(section.duration) || 30

    // 섹션 제목
    elements.push({
      type: 'text',
      text: section.title,
      duration: 3,
      time: currentTime,
      style: { fontSize: '36px', fontWeight: 'bold', color: '#FFFFFF' },
    })
    currentTime += 3

    // 나레이션 텍스트 (자막)
    elements.push({
      type: 'text',
      text: section.narration,
      duration: sectionDuration - 3,
      time: currentTime,
      style: { fontSize: '24px', color: '#FFFFFF', textAlign: 'center' },
    })

    // 데이터 포인트 표시
    if (section.dataPoints?.length > 0) {
      elements.push({
        type: 'text',
        text: section.dataPoints.join('\n'),
        duration: sectionDuration - 3,
        time: currentTime,
        style: { fontSize: '20px', color: '#FFD700' },
      })
    }

    currentTime += sectionDuration - 3
  }

  // 아웃트로
  if (script.outro) {
    elements.push({
      type: 'text',
      text: script.outro.summary,
      duration: 5,
      time: currentTime,
      style: { fontSize: '32px', color: '#FFFFFF', textAlign: 'center' },
    })
    currentTime += 5

    elements.push({
      type: 'text',
      text: script.outro.cta,
      duration: 5,
      time: currentTime,
      style: { fontSize: '28px', color: '#FF4444', textAlign: 'center' },
    })
    currentTime += 5
  }

  // Creatomate API 호출
  const res = await fetch(`${BASE_URL}/renders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      output_format: 'mp4',
      width: 1920,
      height: 1080,
      duration: currentTime,
      elements: elements.map(el => ({
        type: el.type,
        text: el.text,
        time: `${el.time} s`,
        duration: `${el.duration} s`,
        ...el.style,
      })),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Creatomate API 오류: ${res.status} - ${err}`)
  }

  const renders = await res.json()
  const renderId = renders[0]?.id

  if (!renderId) throw new Error('Creatomate 렌더 ID 없음')

  // Poll for completion
  let attempts = 0
  while (attempts < 120) {
    await new Promise(r => setTimeout(r, 5000))
    const statusRes = await fetch(`${BASE_URL}/renders/${renderId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    const data = await statusRes.json()

    if (data.status === 'succeeded') return data.url
    if (data.status === 'failed') throw new Error(`Creatomate 렌더 실패: ${data.error_message}`)
    attempts++
  }

  throw new Error('Creatomate 렌더 시간 초과')
}

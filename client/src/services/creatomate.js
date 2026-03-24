const API_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const PROXY_URL = 'http://localhost:3001/api/creatomate'

/**
 * 롱폼 스크립트를 기반으로 영상 source를 동적 생성
 */
function buildLongformSource(script, narrationUrl) {
  const elements = []
  let currentTime = 0

  // 배경 (전체 길이에 걸쳐)
  // 나중에 duration 계산 후 설정

  // 인트로
  if (script.intro) {
    const introDuration = 8
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: introDuration, text: script.title, y: '35%', width: '80%', x: '10%', font_size: '5.5 vmin', font_weight: '800', fill_color: '#ffffff', text_align: 'center', background_color: '#1a1a2e' },
      { type: 'text', track: 2, time: currentTime, duration: introDuration, text: script.intro.hook || '', y: '55%', width: '70%', x: '15%', font_size: '3.5 vmin', fill_color: '#94a3b8', text_align: 'center' },
    )
    currentTime += introDuration
  }

  // 각 섹션
  for (const section of script.sections || []) {
    const sectionDuration = Math.max(parseInt(section.duration) || 30, 10)
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: sectionDuration, text: section.title, y: '10%', width: '80%', x: '10%', font_size: '4.5 vmin', font_weight: '700', fill_color: '#e2e8f0', text_align: 'left', background_color: '#0f172a' },
      { type: 'text', track: 2, time: currentTime, duration: sectionDuration, text: section.narration?.slice(0, 200) || '', y: '30%', width: '80%', x: '10%', font_size: '3 vmin', fill_color: '#94a3b8', line_height: '160%', text_align: 'left' },
    )
    if (section.dataPoints?.length > 0) {
      elements.push(
        { type: 'text', track: 3, time: currentTime, duration: sectionDuration, text: section.dataPoints.join(' · '), y: '75%', width: '80%', x: '10%', font_size: '3.5 vmin', font_weight: '700', fill_color: '#818cf8' },
      )
    }
    currentTime += sectionDuration
  }

  // 아웃트로
  if (script.outro) {
    const outroDuration = 8
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: outroDuration, text: script.outro.summary || '', y: '35%', width: '80%', x: '10%', font_size: '4.5 vmin', font_weight: '700', fill_color: '#ffffff', text_align: 'center', background_color: '#1a1a2e' },
      { type: 'text', track: 2, time: currentTime, duration: outroDuration, text: script.outro.cta || '', y: '60%', width: '70%', x: '15%', font_size: '3.5 vmin', fill_color: '#818cf8', text_align: 'center' },
    )
    currentTime += outroDuration
  }

  return {
    output_format: 'mp4',
    frame_rate: '30 fps',
    width: 1920,
    height: 1080,
    duration: currentTime,
    elements,
  }
}

/**
 * 롱폼 영상 렌더링 요청
 */
export async function renderVideo(script, narrationUrl) {
  const source = buildLongformSource(script, narrationUrl)
  console.log('[Creatomate] source duration:', source.duration, 'elements:', source.elements.length)
  console.log('[Creatomate] source:', JSON.stringify(source).slice(0, 500))

  const res = await fetch(`${PROXY_URL}/renders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ output_format: 'mp4', source }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Creatomate API 오류: ${res.status} - ${err}`)
  }

  const renders = await res.json()
  const render = Array.isArray(renders) ? renders[0] : renders

  if (!render?.id) throw new Error('Creatomate 렌더 ID 없음')

  return render
}

/**
 * 렌더 상태 조회
 */
export async function getRenderStatus(renderId) {
  const res = await fetch(`${PROXY_URL}/renders/${renderId}`, {
    headers: { 'x-api-key': API_KEY },
  })
  if (!res.ok) throw new Error(`상태 조회 실패: ${res.status}`)
  return res.json()
}

/**
 * 롱폼 영상 렌더 요청 후 완료까지 폴링
 */
export async function renderVideoAndWait(script, narrationUrl) {
  const render = await renderVideo(script, narrationUrl)

  if (render.status === 'succeeded') return render.url
  if (render.status === 'failed') throw new Error(`렌더 실패: ${render.error_message}`)

  let attempts = 0
  while (attempts < 180) {
    await new Promise(r => setTimeout(r, 5000))
    const data = await getRenderStatus(render.id)

    if (data.status === 'succeeded') return data.url
    if (data.status === 'failed') throw new Error(`Creatomate 렌더 실패: ${data.error_message}`)
    attempts++
  }

  throw new Error('Creatomate 렌더 시간 초과')
}

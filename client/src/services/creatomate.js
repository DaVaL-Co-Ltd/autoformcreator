const API_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const PROXY_URL = 'http://localhost:3001/api/creatomate'

// true일 때만 실제 유료 렌더링 (mp4, 1920x1080)
// false면 preview 모드 (snapshot, 640x360, 3초 미만)
const isProduction = false

/**
 * 롱폼 스크립트를 기반으로 영상 source를 동적 생성
 */
function buildLongformSource(script, narrationUrl) {
  const elements = []
  let currentTime = 0

  const width = isProduction ? 1920 : 640
  const height = isProduction ? 1080 : 360

  // 인트로
  if (script.intro) {
    const introDuration = isProduction ? 8 : 1
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: introDuration, text: script.title, y: '35%', width: '80%', x: '10%', font_size: '5.5 vmin', font_weight: '800', fill_color: '#ffffff', text_align: 'center', background_color: '#1a1a2e' },
      { type: 'text', track: 2, time: currentTime, duration: introDuration, text: script.intro.hook || '', y: '55%', width: '70%', x: '15%', font_size: '3.5 vmin', fill_color: '#94a3b8', text_align: 'center' },
    )
    currentTime += introDuration
  }

  // 각 섹션 (preview: 첫 1개만, 1초씩)
  const sections = isProduction ? (script.sections || []) : (script.sections || []).slice(0, 1)
  for (const section of sections) {
    const sectionDuration = isProduction ? Math.max(parseInt(section.duration) || 30, 10) : 1
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
    const outroDuration = isProduction ? 8 : 1
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: outroDuration, text: script.outro.summary || '', y: '35%', width: '80%', x: '10%', font_size: '4.5 vmin', font_weight: '700', fill_color: '#ffffff', text_align: 'center', background_color: '#1a1a2e' },
      { type: 'text', track: 2, time: currentTime, duration: outroDuration, text: script.outro.cta || '', y: '60%', width: '70%', x: '15%', font_size: '3.5 vmin', fill_color: '#818cf8', text_align: 'center' },
    )
    currentTime += outroDuration
  }

  return {
    output_format: isProduction ? 'mp4' : 'jpg',
    frame_rate: '30 fps',
    width,
    height,
    duration: currentTime,
    elements,
  }
}

/**
 * 롱폼 영상 렌더링 요청 (preview: snapshot / production: mp4)
 */
export async function renderVideo(script, narrationUrl) {
  const source = buildLongformSource(script, narrationUrl)
  console.log(`[Creatomate] ${isProduction ? 'PRODUCTION' : 'PREVIEW'} mode | duration: ${source.duration}s | ${source.width}x${source.height}`)

  const res = await fetch(`${PROXY_URL}/renders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({
      output_format: isProduction ? 'mp4' : 'jpg',
      source,
    }),
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
  const maxAttempts = isProduction ? 180 : 30
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, isProduction ? 5000 : 2000))
    const data = await getRenderStatus(render.id)

    if (data.status === 'succeeded') return data.url
    if (data.status === 'failed') throw new Error(`Creatomate 렌더 실패: ${data.error_message}`)
    attempts++
  }

  throw new Error('Creatomate 렌더 시간 초과')
}

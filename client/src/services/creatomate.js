const API_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const PROXY_URL = 'http://localhost:3001/api/creatomate'

// true일 때만 실제 유료 렌더링 (mp4, 1920x1080)
// false면 preview 모드 (640x360, 3초 미만)
// isProduction을 true로 변경하기 전에 반드시 사용자에게 확인
const isProduction = false

/**
 * 롱폼 스크립트를 기반으로 Creatomate render body 생성
 */
function buildLongformBody(script) {
  const elements = []
  let currentTime = 0

  // 인트로
  if (script.intro) {
    const dur = isProduction ? 8 : 1
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: dur, text: script.title, font_family: 'Noto Sans', font_size: '5.5 vmin', font_weight: '800', fill_color: '#ffffff', y: '35%' },
      { type: 'text', track: 2, time: currentTime, duration: dur, text: script.intro.hook || '', font_family: 'Noto Sans', font_size: '3.5 vmin', fill_color: '#94a3b8', y: '55%' },
    )
    currentTime += dur
  }

  // 각 섹션 (preview: 첫 1개만)
  const sections = isProduction ? (script.sections || []) : (script.sections || []).slice(0, 1)
  for (const section of sections) {
    const dur = isProduction ? Math.max(parseInt(section.duration) || 30, 10) : 1
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: dur, text: section.title, font_family: 'Noto Sans', font_size: '4.5 vmin', font_weight: '700', fill_color: '#e2e8f0', y: '15%' },
      { type: 'text', track: 2, time: currentTime, duration: dur, text: (section.narration || '').slice(0, 200), font_family: 'Noto Sans', font_size: '3 vmin', fill_color: '#94a3b8', y: '45%' },
    )
    if (section.dataPoints?.length > 0) {
      elements.push(
        { type: 'text', track: 3, time: currentTime, duration: dur, text: section.dataPoints.join(' · '), font_family: 'Noto Sans', font_size: '3.5 vmin', font_weight: '700', fill_color: '#818cf8', y: '75%' },
      )
    }
    currentTime += dur
  }

  // 아웃트로
  if (script.outro) {
    const dur = isProduction ? 8 : 1
    elements.push(
      { type: 'text', track: 1, time: currentTime, duration: dur, text: script.outro.summary || '', font_family: 'Noto Sans', font_size: '4.5 vmin', font_weight: '700', fill_color: '#ffffff', y: '35%' },
      { type: 'text', track: 2, time: currentTime, duration: dur, text: script.outro.cta || '', font_family: 'Noto Sans', font_size: '3.5 vmin', fill_color: '#818cf8', y: '60%' },
    )
    currentTime += dur
  }

  return {
    output_format: 'mp4',
    frame_rate: '30 fps',
    fill_color: '#1a1a2e',
    width: isProduction ? 1920 : 640,
    height: isProduction ? 1080 : 360,
    duration: currentTime,
    elements,
  }
}

/**
 * 롱폼 영상 렌더링 요청
 */
export async function renderVideo(script) {
  const body = buildLongformBody(script)
  console.log(`[Creatomate] ${isProduction ? 'PRODUCTION' : 'PREVIEW'} mode | duration: ${body.duration}s | ${body.width}x${body.height}`)

  const res = await fetch(`${PROXY_URL}/renders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(body),
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
  const render = await renderVideo(script)

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

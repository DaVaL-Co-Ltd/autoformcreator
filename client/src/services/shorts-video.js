/**
 * 숏폼 영상 생성
 * 첫/마지막 씬 Veo 애니메이션, 중간 씬 Gemini 이미지 + 고양이 캐릭터 오버레이
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const VEO_URL = 'https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-generate-001:predictLongRunning'
const VEO_OPS_URL = 'https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-generate-001/operations'
const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict`

const W = 1080
const H = 1920
const FPS = 30
const GAP_SECONDS = 1
const FALLBACK_DURATION = 5

// ── Veo 영상 생성 ──
async function generateSceneVideo(visualDescription, retryCount = 0) {
  if (!visualDescription || !GEMINI_API_KEY) return null
  const MAX_RETRIES = 3
  try {
    const prompt = `${visualDescription}. Anime kawaii style, cute cat character animation, smooth motion, expressive, 9:16 vertical format, soft pastel lighting. STRICT: Do NOT include any Korean, Chinese, Japanese or non-Latin text. Only English words and numbers allowed.`
    const res = await fetch(`${VEO_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { aspectRatio: '9:16', sampleCount: 1, durationSeconds: 6 },
      }),
    })
    if (res.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        console.error('[Veo] Rate limit 최대 재시도 초과')
        return null
      }
      const waitSec = 30 * (retryCount + 1)
      console.warn(`[Veo] Rate limit - ${waitSec}초 대기 (${retryCount + 1}/${MAX_RETRIES})`)
      await new Promise(r => setTimeout(r, waitSec * 1000))
      return generateSceneVideo(visualDescription, retryCount + 1)
    }
    if (!res.ok) return null
    const { name } = await res.json()
    const opId = name.split('/').pop()

    // 폴링 (최대 3분)
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const poll = await fetch(`${VEO_OPS_URL}/${opId}?key=${GEMINI_API_KEY}`)
      const data = await poll.json()
      if (data.done) {
        const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
        if (!uri) return null
        return `${uri}&key=${GEMINI_API_KEY}`
      }
    }
    return null
  } catch { return null }
}

// ── Gemini Imagen 배경 이미지 생성 (V2 중간 씬용) ──
async function generateSceneImage(narration, visualDescription) {
  if (!GEMINI_API_KEY) return null
  try {
    const prompt = `${visualDescription || narration}. Cute anime style background illustration, 9:16 vertical format, vibrant soft colors, no characters. STRICT: Do NOT include any Korean, Chinese, Japanese or non-Latin text anywhere in the image. Only English words and numbers allowed if needed. No text is preferred.`
    const res = await fetch(`${IMAGEN_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '9:16' },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const b64 = data.predictions?.[0]?.bytesBase64Encoded
    if (!b64) return null
    return `data:image/png;base64,${b64}`
  } catch { return null }
}

// ── 고양이 캐릭터 아이콘 생성 (Gemini Imagen, V2 오버레이용) ──
async function generateCatCharacterIcon() {
  if (!GEMINI_API_KEY) return null
  try {
    const prompt = 'A cute kawaii cat teacher character, circular avatar, wearing glasses and school uniform, soft pastel colors, anime style, white background, round face, big eyes, minimal design. No text, no letters, no words of any language.'
    const res = await fetch(`${IMAGEN_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const b64 = data.predictions?.[0]?.bytesBase64Encoded
    if (!b64) return null
    return `data:image/png;base64,${b64}`
  } catch { return null }
}

// ── 영상 URL → Blob → HTMLVideoElement 로드 ──
async function loadVideo(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.oncanplaythrough = () => resolve(video)
      video.onerror = () => resolve(null)
      video.src = blobUrl
    })
  } catch { return null }
}

// ── 이미지 URL (data: or http) → HTMLImageElement 로드 ──
async function loadImage(url) {
  if (!url) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}

// 오디오 URL에서 실제 길이(초) 측정
function getAudioDuration(audioUrl) {
  return new Promise((resolve) => {
    if (!audioUrl) { resolve(FALLBACK_DURATION); return }
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(Math.ceil(audio.duration) + 1)
    audio.onerror = () => resolve(FALLBACK_DURATION)
    audio.src = audioUrl
  })
}

function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const char of text.split('')) {
    const testLine = line + char
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line)
      line = char
    } else {
      line = testLine
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawSubtitleOverlay(ctx, scene, sceneIndex, totalScenes, opacity) {
  ctx.globalAlpha = opacity

  // 하단 그라데이션
  const gradH = 450
  const grad = ctx.createLinearGradient(0, H - gradH, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.4, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.fillStyle = grad
  ctx.fillRect(0, H - gradH, W, gradH)

  // textOverlay 뱃지
  if (scene.textOverlay) {
    const accent = ['#e57a00', '#2e7d32', '#1565c0', '#7b1fa2', '#f59e0b', '#10b981'][sceneIndex % 6]
    ctx.font = 'bold 26px Pretendard, sans-serif'
    ctx.fillStyle = accent
    const badgeW = ctx.measureText(scene.textOverlay).width + 40
    ctx.beginPath(); ctx.roundRect(60, H - 420, badgeW, 42, 16); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'
    ctx.fillText(scene.textOverlay, 80, H - 392)
  }

  // 나레이션 자막
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 42px Pretendard, sans-serif'
  ctx.textAlign = 'left'
  const lines = wrapText(ctx, scene.narration || '', W - 140)
  const lineHeight = 54
  const maxLines = Math.min(lines.length, 6)
  const startY = H - 280 - (maxLines - 1) * (lineHeight / 2) + (maxLines * lineHeight / 2)
  lines.slice(0, maxLines).forEach((line, i) => {
    ctx.fillText(line, 70, startY + i * lineHeight)
  })

  ctx.globalAlpha = 1
  // 프로그레스 바
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, 0, W, 4)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W * ((sceneIndex + 1) / totalScenes), 4)
}

// ── V2 중간 씬: 배경 이미지 + 고양이 아이콘 + 자막 렌더링 ──
function drawV2MiddleScene(ctx, bgImg, catImg, scene, sceneIndex, totalScenes, opacity) {
  ctx.globalAlpha = 1
  // 검은 배경
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(0, 0, W, H)

  // 배경 이미지 (cover)
  if (bgImg) {
    const r = bgImg.width / bgImg.height
    const cr = W / H
    let dx = 0, dy = 0, dw = W, dh = H
    if (r > cr) { dh = H; dw = H * r; dx = (W - dw) / 2 }
    else { dw = W; dh = W / r; dy = (H - dh) / 2 }
    ctx.drawImage(bgImg, dx, dy, dw, dh)
  } else {
    // 폴백 그라데이션
    const colors = ['#1a1a2e', '#16213e', '#0f3460', '#2d1b69', '#1b2838']
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, colors[sceneIndex % colors.length])
    grad.addColorStop(1, '#000')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  ctx.globalAlpha = opacity

  // 고양이 캐릭터 아이콘 (오른쪽 상단, 120px 원형)
  const iconSize = 120
  const iconMargin = 40
  const iconX = W - iconSize - iconMargin
  const iconY = iconMargin

  if (catImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(catImg, iconX, iconY, iconSize, iconSize)
    ctx.restore()
    // 아이콘 테두리
    ctx.beginPath()
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 3
    ctx.stroke()
  } else {
    // 폴백: 귀여운 원형 배지
    ctx.fillStyle = 'rgba(255,190,100,0.9)'
    ctx.beginPath()
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `bold ${iconSize * 0.5}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🐱', iconX + iconSize / 2, iconY + iconSize / 2)
    ctx.textBaseline = 'alphabetic'
  }

  // 자막 오버레이
  drawSubtitleOverlay(ctx, scene, sceneIndex, totalScenes, opacity)
}

// ── 공통: 타이밍 계산 + 오디오 디코딩 + 녹화 ──
async function buildAndRecord(canvas, ctx, scenes, sceneFrameBuilders, sceneDurations, narrations) {
  const sceneTimings = []
  let currentTime = 0
  const frameInfo = scenes.map((scene, i) => {
    const narDur = sceneDurations[i]
    const totalDur = narDur + GAP_SECONDS
    const totalFrames = Math.round(totalDur * FPS)
    sceneTimings.push({ sceneNumber: scene.sceneNumber, startTime: currentTime, duration: totalDur, narrationDuration: narDur })
    currentTime += totalDur
    return { totalFrames, narDur }
  })

  const totalFrameCount = frameInfo.reduce((sum, f) => sum + f.totalFrames, 0)

  let frameOffset = 0
  const sceneRanges = frameInfo.map((info, i) => {
    const start = frameOffset
    const end = start + info.totalFrames
    frameOffset = end
    return { sceneIdx: i, sceneStart: start, sceneEnd: end }
  })

  // 오디오 디코딩
  const audioCtx = new AudioContext()
  const audioBuffers = await Promise.all(
    scenes.map(async (scene) => {
      const nar = narrations?.find(n => n.sceneNumber === scene.sceneNumber)
      if (!nar?.audioUrl) return null
      try {
        const res = await fetch(nar.audioUrl)
        const arrayBuf = await res.arrayBuffer()
        return await audioCtx.decodeAudioData(arrayBuf)
      } catch { return null }
    })
  )

  const audioDest = audioCtx.createMediaStreamDestination()
  const videoStream = canvas.captureStream(FPS)
  const combinedStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ])

  const chunks = []
  const recorder = new MediaRecorder(combinedStream, {
    mimeType: 'video/webm;codecs=vp9,opus',
    videoBitsPerSecond: 5000000,
  })
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
  const recordingDone = new Promise((resolve) => { recorder.onstop = () => resolve() })
  recorder.start()

  // 나레이션 오디오 스케줄
  sceneTimings.forEach((timing, i) => {
    const buf = audioBuffers[i]
    if (!buf) return
    const source = audioCtx.createBufferSource()
    source.buffer = buf
    source.connect(audioDest)
    source.start(audioCtx.currentTime + timing.startTime)
  })

  // 프레임 렌더링
  for (let frame = 0; frame < totalFrameCount; frame++) {
    const range = sceneRanges.find(r => frame >= r.sceneStart && frame < r.sceneEnd)
    if (range) {
      const localFrame = frame - range.sceneStart
      const fadeIn = Math.min(localFrame / 10, 1)
      sceneFrameBuilders[range.sceneIdx](localFrame, fadeIn)
    }
    await new Promise(r => setTimeout(r, 1000 / FPS))
  }

  recorder.stop()
  await recordingDone
  audioCtx.close()

  const combinedBlob = new Blob(chunks, { type: 'video/webm' })
  return { combinedVideoUrl: URL.createObjectURL(combinedBlob), sceneTimings }
}

/**
 * 숏폼 영상 생성: 첫/마지막 씬 Veo 애니메이션, 중간 씬 Gemini 이미지 + 고양이 캐릭터 오버레이
 * @param {Array} scenes
 * @param {string} title
 * @param {Function} onProgress
 * @param {Array} narrations
 */
export async function generateShortsVideo(scenes, title, onProgress, narrations) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // 나레이션 오디오 길이 측정
  const sceneDurations = await Promise.all(
    scenes.map(async (scene) => {
      const nar = narrations?.find(n => n.sceneNumber === scene.sceneNumber)
      if (nar?.duration > 0) return Math.ceil(nar.duration) + 1
      return getAudioDuration(nar?.audioUrl)
    })
  )

  // 씬이 2개 이하면 모두 Veo 애니메이션 (V1과 동일)
  const allVeo = scenes.length <= 2

  const firstIdx = 0
  const lastIdx = scenes.length - 1

  // Veo 애니메이션 생성 (첫/마지막 씬)
  const veoVideos = []
  for (let i = 0; i < scenes.length; i++) {
    const isFirst = i === firstIdx
    const isLast = i === lastIdx && scenes.length > 1
    if (allVeo || isFirst || isLast) {
      onProgress?.({ phase: 'video-gen', completed: i, total: scenes.length, current: scenes[i].sceneNumber })
      const url = await generateSceneVideo(scenes[i].visualDescription || '')
      const vid = url ? await loadVideo(url) : null
      if (i < scenes.length - 1) await new Promise(r => setTimeout(r, 2000))
      veoVideos[i] = vid
    } else {
      veoVideos[i] = null
    }
  }

  // 중간 씬용 배경 이미지 생성 (씬 2개 이하면 스킵)
  const bgImages = []
  for (let i = 0; i < scenes.length; i++) {
    const isFirst = i === firstIdx
    const isLast = i === lastIdx && scenes.length > 1
    if (!allVeo && !isFirst && !isLast) {
      onProgress?.({ phase: 'image-gen', completed: i, total: scenes.length, current: scenes[i].sceneNumber })
      const img = await generateSceneImage(scenes[i].narration, scenes[i].visualDescription)
      bgImages[i] = img ? await loadImage(img) : null
    } else {
      bgImages[i] = null
    }
  }

  // 고양이 캐릭터 아이콘 생성 (1회, 모든 중간 씬 공유)
  onProgress?.({ phase: 'cat-icon', completed: 0, total: 1, current: null })
  const catIconDataUrl = await generateCatCharacterIcon()
  const catIconImg = catIconDataUrl ? await loadImage(catIconDataUrl) : null

  onProgress?.({ phase: 'render', completed: 0, total: scenes.length, current: 1 })

  // 씬별 프레임 빌더
  const sceneFrameBuilders = scenes.map((scene, i) => {
    const isFirst = i === firstIdx
    const isLast = i === lastIdx && scenes.length > 1
    const isVeo = allVeo || isFirst || isLast
    const vid = veoVideos[i]
    const bgImg = bgImages[i]

    return (localFrame, fadeIn) => {
      if (isVeo) {
        // Veo 영상 씬 (첫/마지막)
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, W, H)
        if (vid && vid.readyState >= 2) {
          const r = vid.videoWidth / vid.videoHeight
          const cr = W / H
          let dx = 0, dy = 0, dw = W, dh = H
          if (r > cr) { dh = H; dw = H * r; dx = (W - dw) / 2 }
          else { dw = W; dh = W / r; dy = (H - dh) / 2 }
          ctx.drawImage(vid, dx, dy, dw, dh)
          if (localFrame === 0) { vid.currentTime = 0; vid.play().catch(() => {}) }
        } else {
          const colors = ['#1a1a2e', '#2d1b69']
          ctx.fillStyle = colors[i % colors.length]
          ctx.fillRect(0, 0, W, H)
        }
        drawSubtitleOverlay(ctx, scene, i, scenes.length, fadeIn)
      } else {
        // 이미지 + 고양이 아이콘 씬 (중간)
        drawV2MiddleScene(ctx, bgImg, catIconImg, scene, i, scenes.length, fadeIn)
      }
    }
  })

  const result = await buildAndRecord(canvas, ctx, scenes, sceneFrameBuilders, sceneDurations, narrations)
  onProgress?.({ phase: 'done', completed: scenes.length, total: scenes.length, current: null })
  return result
}


/**
 * 숏폼 영상 생성 - Gemini AI 이미지 배경 + 자막 오버레이
 * 나레이션 오디오 길이 기반으로 씬 길이 결정
 */

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const GEMINI_IMAGE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'

const W = 1080
const H = 1920
const FPS = 30
const GAP_SECONDS = 1
const FALLBACK_DURATION = 5 // 나레이션 없을 때 기본 씬 길이

const ACCENT_COLORS = ['#e57a00', '#2e7d32', '#1565c0', '#7b1fa2', '#f59e0b', '#10b981']
const PASTEL_FALLBACK = ['#FFF3E0', '#E8F5E9', '#E3F2FD', '#F3E5F5', '#FFF8E1', '#ECFDF5']

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

async function generateSceneImage(visualDescription, textOverlay) {
  if (!visualDescription || !GEMINI_API_KEY) return null
  try {
    const textRule = `STRICT: Do NOT include ANY Korean, Chinese, Japanese, or non-Latin text. Only English words and numbers are allowed if needed. Do NOT invent or guess any text. No Korean characters (한글) whatsoever.`
    const prompt = `Generate a vertical portrait image with exact 9:16 aspect ratio (1080x1920). Taller than wide, like a phone screen. ${visualDescription}. ${textRule} Cinematic photography style.`
    const res = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const imgPart = (data.candidates?.[0]?.content?.parts || []).find(p => p.inlineData)
    if (!imgPart) return null
    return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`
  } catch { return null }
}

function loadImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

// 오디오 URL에서 실제 길이(초) 측정
function getAudioDuration(audioUrl) {
  return new Promise((resolve) => {
    if (!audioUrl) { resolve(FALLBACK_DURATION); return }
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => resolve(Math.ceil(audio.duration) + 1) // +1초 여유
    audio.onerror = () => resolve(FALLBACK_DURATION)
    audio.src = audioUrl
  })
}

function drawSceneFrame(ctx, scene, sceneIndex, totalScenes, bgImage, opacity) {
  const accent = ACCENT_COLORS[sceneIndex % ACCENT_COLORS.length]

  // 배경 먼저 채우기
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, W, H)

  if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight
    const canvasRatio = W / H
    let dx = 0, dy = 0, dw = W, dh = H

    if (imgRatio > canvasRatio) {
      // 이미지가 더 넓음 → 높이 맞추고 좌우 중앙
      dh = H
      dw = H * imgRatio
      dx = (W - dw) / 2
    } else {
      // 이미지가 더 높거나 같음 → 너비 맞추고 상하 중앙
      dw = W
      dh = W / imgRatio
      dy = (H - dh) / 2
    }
    ctx.drawImage(bgImage, 0, 0, bgImage.naturalWidth, bgImage.naturalHeight, dx, dy, dw, dh)
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.fillRect(0, 0, W, H)
  } else {
    ctx.fillStyle = PASTEL_FALLBACK[sceneIndex % PASTEL_FALLBACK.length]
    ctx.fillRect(0, 0, W, H)
  }

  const gradH = 550
  const grad = ctx.createLinearGradient(0, H - gradH, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(0.35, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.fillStyle = grad
  ctx.fillRect(0, H - gradH, W, gradH)

  ctx.globalAlpha = opacity

  // 상단: textOverlay 뱃지 (씬 번호 대신)
  if (scene.textOverlay) {
    ctx.font = 'bold 26px Pretendard, sans-serif'
    ctx.fillStyle = accent
    const badgeW = ctx.measureText(scene.textOverlay).width + 40
    ctx.beginPath(); ctx.roundRect(60, H - 420, badgeW, 42, 16); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'
    ctx.fillText(scene.textOverlay, 80, H - 392)
  }

  // 나레이션 자막: 전체 문장 표시 (줄바꿈 적용)
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 42px Pretendard, sans-serif'; ctx.textAlign = 'left'
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

/**
 * 숏폼 영상 생성
 * @param {Array} scenes - 씬 배열 (shortsScript.scenes)
 * @param {string} title - 영상 제목
 * @param {Function} onProgress - 진행률 콜백
 * @param {Array} narrations - 나레이션 배열 [{sceneNumber, audioUrl}] (optional)
 */
export async function generateShortsVideoLocal(scenes, title, onProgress, narrations) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Step 1: 나레이션 오디오 길이 측정 → 씬 실제 길이 결정
  const sceneDurations = await Promise.all(
    scenes.map(async (scene) => {
      const nar = narrations?.find(n => n.sceneNumber === scene.sceneNumber)
      // duration이 있으면 사용 (더 정확)
      if (nar?.duration > 0) return Math.ceil(nar.duration) + 1
      return getAudioDuration(nar?.audioUrl)
    })
  )

  // Step 2: 씬별 Gemini 이미지 생성
  const images = []
  for (let i = 0; i < scenes.length; i++) {
    onProgress?.({ phase: 'image', completed: i, total: scenes.length, current: scenes[i].sceneNumber })
    const dataUrl = await generateSceneImage(scenes[i].visualDescription || '', scenes[i].textOverlay || '')
    images.push(dataUrl ? await loadImage(dataUrl) : null)
    if (i < scenes.length - 1) await new Promise(r => setTimeout(r, 2000))
  }

  // Step 3: 타이밍 계산 (각 씬 끝에 2초 공백 포함, 나레이션은 씬 시작 시 재생)
  const sceneTimings = []
  let currentTime = 0
  const frameInfo = scenes.map((scene, i) => {
    const narDur = sceneDurations[i]
    const totalDur = narDur + GAP_SECONDS // 나레이션 길이 + 2초 공백
    const totalFrames = totalDur * FPS
    sceneTimings.push({ sceneNumber: scene.sceneNumber, startTime: currentTime, duration: totalDur, narrationDuration: narDur })
    currentTime += totalDur
    return { totalFrames, narDur }
  })

  const totalFrameCount = frameInfo.reduce((sum, f) => sum + f.totalFrames, 0)

  // Step 4: 프레임 범위 계산
  let frameOffset = 0
  const sceneRanges = frameInfo.map((info, i) => {
    const start = frameOffset
    const end = start + info.totalFrames
    frameOffset = end
    return { sceneIdx: i, sceneStart: start, sceneEnd: end }
  })

  // Step 5: 나레이션 오디오 디코딩 (Web Audio API)
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

  // Step 6: 비디오 + 오디오 스트림 합성 후 녹화
  onProgress?.({ phase: 'video', completed: 0, total: scenes.length, current: 1 })

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

  const recordingDone = new Promise((resolve) => {
    recorder.onstop = () => resolve()
  })

  recorder.start()

  // 각 씬 시작 시점에 나레이션 오디오 스케줄
  sceneTimings.forEach((timing, i) => {
    const buf = audioBuffers[i]
    if (!buf) return
    const source = audioCtx.createBufferSource()
    source.buffer = buf
    source.connect(audioDest)
    source.start(audioCtx.currentTime + timing.startTime)
  })

  let lastReportedScene = -1
  for (let frame = 0; frame < totalFrameCount; frame++) {
    const range = sceneRanges.find(r => frame >= r.sceneStart && frame < r.sceneEnd)
    if (range) {
      const localFrame = frame - range.sceneStart
      const fadeIn = Math.min(localFrame / 10, 1)
      drawSceneFrame(ctx, scenes[range.sceneIdx], range.sceneIdx, scenes.length, images[range.sceneIdx], fadeIn)
      if (range.sceneIdx !== lastReportedScene) {
        lastReportedScene = range.sceneIdx
        onProgress?.({ phase: 'video', completed: range.sceneIdx, total: scenes.length, current: scenes[range.sceneIdx].sceneNumber })
      }
    }
    await new Promise(r => setTimeout(r, 1000 / FPS))
  }

  recorder.stop()
  await recordingDone
  audioCtx.close()

  const combinedBlob = new Blob(chunks, { type: 'video/webm' })
  const combinedVideoUrl = URL.createObjectURL(combinedBlob)

  onProgress?.({ phase: 'video', completed: scenes.length, total: scenes.length, current: null })

  return { combinedVideoUrl, sceneTimings }
}

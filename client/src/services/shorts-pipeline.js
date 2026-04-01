/**
 * Shorts Pipeline Service
 * 5-Step: Script → Voice → Video Source → Lip-sync → Assembly
 * 10초 테스트 모드 / 하이브리드 모드 / 업스케일 옵션 지원
 */

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY
const CREATOMATE_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const PUBLIC_SERVER_URL = import.meta.env.VITE_PUBLIC_SERVER_URL || '' // ngrok URL

const VOICE_ID = 'iyvXhCAqzDxKnq3FDjZl' // 한국어 보이스
const VEO_MODEL = 'veo-3.0-generate-001' // TODO: veo-3.1-generate-001 사용 가능 시 교체

// ===== Logging =====
const _logs = []

export function pipelineLog(step, msg, data) {
  const ts = new Date().toISOString().slice(11, 23)
  const entry = { ts, step, msg, data }
  _logs.push(entry)
  console.log(`[${ts}] [Step ${step}] ${msg}`, data != null ? data : '')
  return entry
}

export function getPipelineLogs() { return [..._logs] }
export function clearPipelineLogs() { _logs.length = 0 }

// ===== Output saving =====
export async function saveToOutput(filename, data, encoding = 'utf8') {
  try {
    const res = await fetch('/api/output/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data, encoding }),
    })
    if (res.ok) {
      const result = await res.json()
      pipelineLog('output', `Saved: ${filename} (${result.size} bytes)`)
    }
  } catch (err) {
    pipelineLog('output', `Save failed: ${filename}`, err.message)
  }
}

// ===== Upload to server → public URL =====
async function uploadToServer(blobOrDataUrl, filename) {
  let base64Data
  if (!blobOrDataUrl) return null

  if (blobOrDataUrl.startsWith('data:')) {
    base64Data = blobOrDataUrl.split(',')[1]
  } else if (blobOrDataUrl.startsWith('blob:')) {
    const res = await fetch(blobOrDataUrl)
    const blob = await res.blob()
    base64Data = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } else {
    // Already a public URL (e.g., Google Storage)
    return blobOrDataUrl
  }

  if (!base64Data) {
    pipelineLog('upload', `base64 변환 실패: ${filename}`)
    return null
  }

  const sizeMB = (base64Data.length * 0.75 / 1024 / 1024).toFixed(1)
  pipelineLog('upload', `업로드 시작: ${filename} (${sizeMB}MB)`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000) // 60초 타임아웃 (이미지 용량 대비)

    const res = await fetch('/api/output/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: base64Data, encoding: 'base64' }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      pipelineLog('upload', `업로드 실패 (${res.status}): ${filename}`, errText.slice(0, 200))
      return null
    }
    const { url } = await res.json()
    // ngrok URL이 있으면 사용, 없으면 localhost (Creatomate 접근 불가)
    const base = PUBLIC_SERVER_URL || `${window.location.protocol}//${window.location.host}`
    const abs = `${base}${url}`
    pipelineLog('upload', `업로드 완료: ${filename}`, abs)
    return abs
  } catch (err) {
    pipelineLog('upload', `업로드 에러: ${filename}`, err.name === 'AbortError' ? '30초 타임아웃' : err.message)
    return null
  }
}

// ===== Helper =====
async function blobUrlToBase64(blobUrl) {
  if (!blobUrl) return null
  if (blobUrl.startsWith('data:')) return blobUrl.split(',')[1]
  try {
    const res = await fetch(blobUrl)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// ======================================================================
// Step 1: 대본 생성 (Gemini)
// ======================================================================
export async function generatePipelineScript(summary, rawText, emphasis, options = {}) {
  const { targetDuration = 10, hybridMode = false } = options
  const sceneCount = Math.max(2, Math.ceil(targetDuration / 5))
  const charTarget = Math.round((targetDuration / 60) * 600)

  pipelineLog(1, '대본 생성 시작', { targetDuration, sceneCount, hybridMode })

  const prompt = `한국 대학 입시 정보 숏폼 대본을 JSON으로 작성하세요.

${targetDuration}초 분량, ${sceneCount}개 씬.
${emphasis ? `강조: ${emphasis}` : ''}

## 규칙
- 씬 duration 합계 = 정확히 ${targetDuration}초
- 나레이션: 친근한 한국어 존댓말, 씬당 1~2문장, 총 ${charTarget}자 내외
- 마지막 씬 나레이션: "자세한 건 프로필 링크를 클릭하세요!" 같은 CTA
- imagePrompt: 영어로, 해당 씬 내용과 관련된 구체적 장면 묘사
- textOverlay: 숫자/기호만 (예: "1,906", "82.5%"). 한국어 음역 금지. 없으면 빈 문자열

## 요약
${summary?.summary || ''}
${summary?.keyData?.map(d => `- ${d.label}: ${d.value}`).join('\n') || ''}

## 원문
${(rawText || '').slice(0, 1500)}

## JSON 형식 (이 구조 그대로 출력)
{"title":"제목","totalDuration":${targetDuration},"scenes":[{"sceneNumber":1,"duration":5,"narration":"나레이션","imagePrompt":"English image description","textOverlay":"1,906"}],"bgmStyle":"upbeat"}`

  // 모델 폴백: 429 발생 시 다른 모델로 자동 전환
  // 모델 우선순위: 2.0-flash(빠름) → 2.5-flash → 2.0-flash-lite
  const models = ['gemini-2.5-flash']
  let text = null

  for (const model of models) {
    pipelineLog(1, `모델 ${model} 시도 중...`)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000) // 60초 타임아웃

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 8192, responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)

      if (res.status === 429) {
        pipelineLog(1, `${model} Rate limit → 다음 모델로 폴백`)
        await new Promise(r => setTimeout(r, 3000))
        continue
      }

      if (!res.ok) {
        const errText = await res.text()
        pipelineLog(1, `${model} 오류 (${res.status}) → 다음 모델 시도`)
        continue
      }

      const data = await res.json()
      text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) { pipelineLog(1, `${model} 응답 수신 완료`); break }
    } catch (err) {
      if (err.name === 'AbortError') {
        pipelineLog(1, `${model} 60초 타임아웃 → 다음 모델로 폴백`)
        continue
      }
      pipelineLog(1, `${model} 에러: ${err.message} → 다음 모델 시도`)
      continue
    }
  }

  if (!text) throw new Error('모든 Gemini 모델에서 응답을 받지 못했습니다')

  // 마크다운 코드블록 제거 (```json ... ``` → 순수 JSON)
  let jsonText = text.trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }

  // JSON 파싱 전 정리: 제어 문자 제거, 문자열 내 줄바꿈 이스케이프
  const sanitizeJson = (str) => {
    return str
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '') // 제어 문자 제거
      .replace(/,\s*([}\]])/g, '$1') // trailing comma 제거
  }

  let script
  try {
    script = JSON.parse(sanitizeJson(jsonText))
  } catch (e1) {
    pipelineLog(1, `JSON 직접 파싱 실패: ${e1.message}`, jsonText.slice(0, 200))
    // { } 블록 추출 후 재시도
    const match = jsonText.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        script = JSON.parse(sanitizeJson(match[0]))
      } catch (e2) {
        pipelineLog(1, `JSON 블록 추출 후에도 파싱 실패: ${e2.message}`, match[0].slice(0, 200))
        throw new Error(`대본 JSON 파싱 실패: ${e2.message}`)
      }
    } else {
      throw new Error('대본 JSON 파싱 실패: JSON 블록을 찾을 수 없음')
    }
  }
  pipelineLog(1, '대본 생성 완료', { title: script.title, scenes: script.scenes?.length })

  // 비동기 저장 (UI 블로킹 방지)
  saveToOutput('step1_script.json', JSON.stringify(script, null, 2)).catch(() => {})
  return script
}

// ======================================================================
// Step 2: 음성 생성 (ElevenLabs TTS — 전체 나레이션 한번에 생성 → 씬별 분할)
// ======================================================================

// AudioBuffer → WAV Blob 변환
function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitsPerSample = 16
  const samples = buffer.length
  const dataSize = samples * numCh * (bitsPerSample / 8)
  const headerSize = 44
  const buf = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buf)
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, format, true)
  view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numCh * (bitsPerSample / 8), true)
  view.setUint16(32, numCh * (bitsPerSample / 8), true); view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data'); view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

export async function generatePipelineVoice(scenes) {
  pipelineLog(2, '음성 생성 시작 (전체 통합 TTS)', { sceneCount: scenes.length })

  // ── 1) 모든 씬 나레이션을 하나로 합치고, 씬 경계 문자 위치 기록 ──
  const sceneTexts = scenes.map(s => s.narration.trim())
  const combinedText = sceneTexts.join(' ')
  // 각 씬의 시작/끝 문자 인덱스 (combined 기준)
  const sceneBounds = []
  let charIdx = 0
  for (let i = 0; i < sceneTexts.length; i++) {
    const start = charIdx
    const end = charIdx + sceneTexts[i].length - 1
    sceneBounds.push({ sceneNumber: scenes[i].sceneNumber, charStart: start, charEnd: end, text: sceneTexts[i] })
    charIdx = end + 2 // +1 for char, +1 for space separator
  }

  pipelineLog(2, `통합 텍스트 생성 완료 (${combinedText.length}자, ${scenes.length}씬)`)

  // ── 2) 한번에 TTS + 타임스탬프 호출 ──
  let data
  try {
    const ttsController = new AbortController()
    const ttsTimeout = setTimeout(() => ttsController.abort(), 60000) // 전체이므로 60초
    const res = await fetch(`/api/elevenlabs/tts-timestamps/${VOICE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ELEVENLABS_KEY },
      body: JSON.stringify({
        text: combinedText,
        model_id: 'eleven_turbo_v2_5',
        language_code: 'ko',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      }),
      signal: ttsController.signal,
    })
    clearTimeout(ttsTimeout)
    if (!res.ok) throw new Error(`ElevenLabs 오류: ${res.status}`)
    data = await res.json()
    pipelineLog(2, '통합 TTS 응답 수신 완료')
  } catch (err) {
    pipelineLog(2, `통합 TTS 실패: ${err.message} — 씬별 개별 생성으로 폴백`)
    return generatePipelineVoiceFallback(scenes)
  }

  // ── 3) 오디오 디코딩 ──
  const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0))
  const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' })

  const alignment = data.alignment || {}
  const chars = alignment.characters || []
  const charStarts = alignment.character_start_times_seconds || []
  const charEnds = alignment.character_end_times_seconds || []
  const totalDuration = charEnds.length > 0 ? charEnds[charEnds.length - 1] : 0

  if (!totalDuration || chars.length === 0) {
    pipelineLog(2, '타임스탬프 데이터 없음 — 씬별 개별 생성으로 폴백')
    return generatePipelineVoiceFallback(scenes)
  }

  // AudioContext로 전체 오디오 디코딩
  let fullBuffer
  try {
    const actx = new (window.AudioContext || window.webkitAudioContext)()
    fullBuffer = await actx.decodeAudioData(await audioBlob.arrayBuffer())
    actx.close()
  } catch (err) {
    pipelineLog(2, `오디오 디코딩 실패: ${err.message} — 씬별 개별 생성으로 폴백`)
    return generatePipelineVoiceFallback(scenes)
  }

  pipelineLog(2, `오디오 디코딩 완료 (${fullBuffer.duration.toFixed(1)}s, ${fullBuffer.sampleRate}Hz)`)

  // ── 4) 씬 경계 시간 계산 + 오디오 분할 ──
  const results = []
  for (let si = 0; si < sceneBounds.length; si++) {
    const bound = sceneBounds[si]
    const scene = scenes[si]

    // 이 씬의 첫 문자 시작 시간 / 마지막 문자 끝 시간
    const sceneStartTime = charStarts[bound.charStart] || 0
    // 다음 씬이 있으면 다음 씬 첫 문자 시작 시간, 없으면 전체 끝
    const sceneEndTime = si < sceneBounds.length - 1
      ? (charStarts[sceneBounds[si + 1].charStart] || totalDuration)
      : totalDuration

    const sceneDur = sceneEndTime - sceneStartTime

    // AudioBuffer에서 해당 구간 추출
    const sampleRate = fullBuffer.sampleRate
    const startSample = Math.floor(sceneStartTime * sampleRate)
    const endSample = Math.min(Math.ceil(sceneEndTime * sampleRate), fullBuffer.length)
    const sliceLength = endSample - startSample

    let sceneAudioUrl = null
    let sceneAudioBlob = null
    if (sliceLength > 0) {
      const offlineCtx = new OfflineAudioContext(fullBuffer.numberOfChannels, sliceLength, sampleRate)
      const sliceBuffer = offlineCtx.createBuffer(fullBuffer.numberOfChannels, sliceLength, sampleRate)
      for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
        const src = fullBuffer.getChannelData(ch)
        const dst = sliceBuffer.getChannelData(ch)
        for (let j = 0; j < sliceLength; j++) dst[j] = src[startSample + j]
      }
      sceneAudioBlob = audioBufferToWav(sliceBuffer)
      sceneAudioUrl = URL.createObjectURL(sceneAudioBlob)
    }

    // 이 씬 범위 내의 문장별 타이밍 (씬 시작 기준으로 오프셋 보정)
    const sentenceTimings = []
    let sentText = ''
    let sentStartIdx = bound.charStart
    for (let ci = bound.charStart; ci <= Math.min(bound.charEnd, chars.length - 1); ci++) {
      sentText += chars[ci]
      const isEnd = /[.!?。！？]/.test(chars[ci]) && (ci === bound.charEnd || ci === chars.length - 1 || /\s/.test(chars[ci + 1] || ''))
      if (isEnd || ci === bound.charEnd) {
        const trimmed = sentText.trim()
        if (trimmed.length > 0) {
          sentenceTimings.push({
            text: trimmed,
            start: (charStarts[sentStartIdx] || sceneStartTime) - sceneStartTime,
            end: (charEnds[ci] || sceneEndTime) - sceneStartTime,
          })
        }
        sentText = ''
        sentStartIdx = ci + 1
      }
    }

    results.push({
      sceneNumber: scene.sceneNumber,
      audioUrl: sceneAudioUrl,
      audioBlob: sceneAudioBlob,
      duration: sceneDur,
      text: scene.narration,
      sentenceTimings: sentenceTimings.length > 0 ? sentenceTimings : null,
    })
    pipelineLog(2, `씬 ${scene.sceneNumber} 분할 완료 (${sceneDur.toFixed(1)}s, ${sentenceTimings.length}문장)`)
  }

  // 서버 저장 (전체 오디오, 비동기)
  Promise.race([
    saveToOutput('step2_narration_full.mp3', data.audio_base64, 'base64'),
    new Promise(r => setTimeout(r, 5000)),
  ]).catch(() => {})

  pipelineLog(2, '음성 생성 완료 (통합 방식)', { success: results.filter(r => r.audioUrl).length, total: results.length })
  return results
}

// 폴백: 씬별 개별 TTS (통합 방식 실패 시)
async function generatePipelineVoiceFallback(scenes) {
  pipelineLog(2, '씬별 개별 TTS 폴백 시작', { sceneCount: scenes.length })
  const results = []
  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si]
    if (si > 0) await new Promise(r => setTimeout(r, 3000))
    pipelineLog(2, `[폴백] 씬 ${scene.sceneNumber} TTS 생성 중...`)
    try {
      const ctrl = new AbortController()
      const tm = setTimeout(() => ctrl.abort(), 30000)
      const res = await fetch(`/api/elevenlabs/tts-timestamps/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ELEVENLABS_KEY },
        body: JSON.stringify({
          text: scene.narration,
          model_id: 'eleven_turbo_v2_5',
          language_code: 'ko',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
        signal: ctrl.signal,
      })
      clearTimeout(tm)
      if (!res.ok) throw new Error(`ElevenLabs 오류: ${res.status}`)
      const data = await res.json()
      const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0))
      const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)
      const charEndsAll = data.alignment?.character_end_times_seconds || []
      const duration = charEndsAll.length > 0 ? charEndsAll[charEndsAll.length - 1] : (scene.duration || 5)

      // 문장 타이밍
      const al = data.alignment || {}
      const sentenceTimings = []
      let sentText = '', sentStart = 0
      for (let ci = 0; ci < (al.characters || []).length; ci++) {
        sentText += al.characters[ci]
        const isEnd = /[.!?。！？]/.test(al.characters[ci]) && (ci === al.characters.length - 1 || /\s/.test(al.characters[ci + 1] || ''))
        if (isEnd || ci === al.characters.length - 1) {
          const trimmed = sentText.trim()
          if (trimmed) sentenceTimings.push({ text: trimmed, start: al.character_start_times_seconds?.[sentStart] || 0, end: al.character_end_times_seconds?.[ci] || duration })
          sentText = ''; sentStart = ci + 1
        }
      }
      results.push({ sceneNumber: scene.sceneNumber, audioUrl, audioBlob, duration, text: scene.narration, sentenceTimings: sentenceTimings.length > 0 ? sentenceTimings : null })
      pipelineLog(2, `[폴백] 씬 ${scene.sceneNumber} 완료 (${duration.toFixed(1)}s)`)
    } catch (err) {
      results.push({ sceneNumber: scene.sceneNumber, audioUrl: null, error: err.message, duration: scene.duration || 5, sentenceTimings: null })
      pipelineLog(2, `[폴백] 씬 ${scene.sceneNumber} 실패`, err.message)
    }
  }
  pipelineLog(2, '음성 생성 완료 (폴백)', { success: results.filter(r => r.audioUrl).length, total: results.length })
  return results
}

// ======================================================================
// Step 3: 영상 소스 생성 (Veo / Imagen)
// ======================================================================
async function pollVeoOperation(opName) {
  const opId = opName.split('/').pop()
  let attempts = 0
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}/operations/${opId}?key=${GEMINI_KEY}`)
    if (!res.ok) { attempts++; continue }
    const data = await res.json()
    if (data.done) {
      const uri = data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
      if (!uri) {
        pipelineLog(3, 'Veo 응답 구조 확인:', JSON.stringify(data.response || data).slice(0, 500))
        throw new Error('Veo 비디오 URL 없음')
      }
      return `${uri}&key=${GEMINI_KEY}`
    }
    if (data.error) throw new Error(`Veo 오류: ${data.error.message}`)
    attempts++
  }
  throw new Error('Veo 생성 시간 초과 (3분)')
}

async function generateVeoClip(scene, retryCount = 0) {
  const isCatScene = scene.sceneType === 'cat_intro' || scene.sceneType === 'cat_outro'
  const baseRules = isCatScene
    ? 'Kawaii anime style, pastel colors, warm lighting, cute and friendly mood. No speech audio, no text overlays.'
    : 'Smooth animation, clean design, vibrant colors. No people, no faces, no speech, no audio.'
  const prompt = `${scene.videoPrompt}. ${baseRules} ABSOLUTE RULE: Do NOT render ANY Korean, Chinese, Japanese, Arabic, or Cyrillic characters. Only English alphabet and numbers are allowed if text appears.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { aspectRatio: '9:16', sampleCount: 1, durationSeconds: 6 },
      }),
    }
  )

  if (res.status === 429 && retryCount < 5) {
    const waitTimes = [30000, 60000, 90000, 120000, 180000]
    const wait = waitTimes[retryCount]
    pipelineLog(3, `Rate limit → ${wait / 1000}s 대기 후 재시도 (${retryCount + 1}/5)`)
    await new Promise(r => setTimeout(r, wait))
    return generateVeoClip(scene, retryCount + 1)
  }

  if (!res.ok) throw new Error(`Veo API 오류: ${res.status}`)

  const data = await res.json()
  if (!data.name) throw new Error('Veo operation name 없음')
  return pollVeoOperation(data.name)
}

async function generateImagenStill(scene, retryCount = 0) {
  const basePrompt = scene.imagePrompt || scene.videoPrompt || ''
  const keyword = scene.textOverlay ? scene.textOverlay.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g, '').trim() : ''
  const prompt = `${basePrompt}. ${keyword ? `Key data: ${keyword}.` : ''} High quality cinematic photograph with dynamic action — people walking, studying, interacting, or objects in motion. NOT a static posed shot. Dramatic cinematic lighting with depth. ABSOLUTE RULE: The image must contain ZERO non-Latin characters. No Korean, No Chinese, No Japanese, No Arabic, No Cyrillic. If any text appears in the image it must be English alphabet or numbers ONLY.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { aspectRatio: '9:16', sampleCount: 1 },
      }),
    }
  )

  if (res.status === 429 && retryCount < 3) {
    const wait = 15000 * (retryCount + 1)
    pipelineLog(3, `Imagen Rate limit → ${wait / 1000}s 대기 후 재시도 (${retryCount + 1}/3)`)
    await new Promise(r => setTimeout(r, wait))
    return generateImagenStill(scene, retryCount + 1)
  }

  if (!res.ok) throw new Error(`Imagen 오류: ${res.status}`)
  const data = await res.json()
  const b64 = data.predictions?.[0]?.bytesBase64Encoded
  if (!b64) throw new Error('Imagen 이미지 없음')
  return `data:image/png;base64,${b64}`
}

export async function generateVideoSource(scenes, narrations, options = {}) {
  const { hybridMode = false, existingClips = [] } = options
  const pending = scenes.filter(s => {
    const existing = existingClips.find(c => c.sceneNumber === s.sceneNumber)
    return !existing || existing.type === 'error'
  })
  pipelineLog(3, '영상 소스 생성 시작', { total: scenes.length, skip: scenes.length - pending.length, pending: pending.length, hybridMode })

  // 기존 완료된 클립 유지
  const results = existingClips.filter(c => c.type !== 'error')

  let generated = 0
  for (let idx = 0; idx < pending.length; idx++) {
    const scene = pending[idx]
    // 씬 간 딜레이 — Veo Rate Limit 방지
    if (generated > 0) {
      const delayMs = generated < 2 ? 10000 : 5000
      pipelineLog(3, `씬 간 딜레이 ${delayMs / 1000}초 대기... (${generated + 1}/${pending.length})`)
      await new Promise(r => setTimeout(r, delayMs))
    }
    const useVideo = !hybridMode || scene.useVideo
    const label = useVideo ? 'Veo 영상' : 'Imagen 이미지'
    pipelineLog(3, `씬 ${scene.sceneNumber}/${scenes.length}: ${label} 생성 중...`)

    try {
      if (useVideo) {
        const url = await generateVeoClip(scene)
        results.push({ sceneNumber: scene.sceneNumber, type: 'video', url })
        pipelineLog(3, `씬 ${scene.sceneNumber} Veo 영상 완료`)
      } else {
        const url = await generateImagenStill(scene)
        results.push({ sceneNumber: scene.sceneNumber, type: 'image', url })
        pipelineLog(3, `씬 ${scene.sceneNumber} 이미지 완료`)
        const b64 = url.split(',')[1]
        if (b64) saveToOutput(`step3_image_scene${scene.sceneNumber}.png`, b64, 'base64').catch(() => {})
      }
    } catch (err) {
      results.push({ sceneNumber: scene.sceneNumber, type: 'error', error: err.message })
      pipelineLog(3, `씬 ${scene.sceneNumber} 실패`, err.message)
    }
    generated++
  }

  // 씬 번호 순으로 정렬
  results.sort((a, b) => a.sceneNumber - b.sceneNumber)
  pipelineLog(3, '영상 소스 생성 완료', { success: results.filter(r => r.type !== 'error').length, total: scenes.length })
  return results
}

// ======================================================================
// Step 4: 최종 조립 (Creatomate)
// ======================================================================
export async function assembleShorts(scenes, clips, narrations, options = {}) {
  const { bgmUrl, logoUrl, schoolName } = options

  pipelineLog(5, '최종 조립 시작 — 소스 파일 업로드 중...')

  // 모든 소스를 서버에 업로드 → ngrok 공개 URL 확보
  const uploadedClips = []
  for (const clip of clips) {
    if (clip.url) {
      const ext = clip.type === 'video' ? 'mp4' : 'png'
      const publicUrl = await uploadToServer(clip.url, `scene${clip.sceneNumber}_${clip.type}.${ext}`)
      uploadedClips.push({ ...clip, publicUrl })
    } else {
      uploadedClips.push({ ...clip, publicUrl: null })
    }
  }

  const uploadedNarrations = []
  for (const n of narrations) {
    if (n.audioUrl) {
      const publicUrl = await uploadToServer(n.audioUrl, `narration_scene${n.sceneNumber}.mp3`)
      uploadedNarrations.push({ ...n, publicUrl })
    } else {
      uploadedNarrations.push({ ...n, publicUrl: null })
    }
  }

  pipelineLog(5, '업로드 완료, Creatomate 렌더 구성 중...')

  const elements = []
  let currentTime = 0

  for (const clip of uploadedClips) {
    const scene = scenes.find(s => s.sceneNumber === clip.sceneNumber)
    const narration = uploadedNarrations.find(n => n.sceneNumber === clip.sceneNumber)
    const dur = narration?.duration || scene?.duration || 5

    // Video or Image track
    if (clip.type === 'video' && clip.publicUrl) {
      elements.push({ type: 'video', track: 1, time: currentTime, duration: dur, source: clip.publicUrl, fit: 'cover' })
    } else if (clip.publicUrl) {
      elements.push({
        type: 'image', track: 1, time: currentTime, duration: dur,
        source: clip.publicUrl, fit: 'cover',
        animations: [{ type: 'scale', time: 0, duration: dur, from: '100%', to: '110%', easing: 'linear' }],
      })
    }

    // Narration audio
    if (narration?.publicUrl) {
      elements.push({ type: 'audio', track: 2, time: currentTime, duration: dur, source: narration.publicUrl })
    }

    // Subtitle — 나레이션 타임스탬프 싱크 or 글자수 비례 분배
    if (scene?.narration) {
      const timings = narration?.sentenceTimings
      if (timings && timings.length > 0) {
        const chunks = []
        for (let t = 0; t < timings.length; t += 2) {
          const group = timings.slice(t, t + 2)
          chunks.push({ text: group.map(g => g.text).join(' '), start: group[0].start, end: group[group.length - 1].end })
        }
        for (const chunk of chunks) {
          const chunkDur = Math.max(chunk.end - chunk.start, 0.5)
          const fadeOut = Math.min(0.3, chunkDur * 0.15)
          elements.push({
            type: 'text', track: 3, time: currentTime + chunk.start, duration: chunkDur,
            text: chunk.text,
            font_family: 'Noto Sans KR', font_size: '3.2 vmin', font_weight: '700',
            fill_color: '#ffffff', stroke_color: '#000000', stroke_width: '0.3 vmin',
            y: '78%', width: '90%', height: '18%', x_alignment: '50%', y_alignment: '50%',
            line_height: '150%', text_wrap: 'word',
            background_color: 'rgba(0,0,0,0.55)',
            background_x_padding: '3%', background_y_padding: '2%', background_border_radius: '2%',
            animations: [
              { type: 'text-appear', time: 0, duration: 0.25, easing: 'ease-out' },
              { type: 'fade', time: chunkDur - fadeOut, duration: fadeOut, from: '100%', to: '0%' },
            ],
          })
        }
      } else {
        const sentences = scene.narration.split(/(?<=[.!?。！？])\s*/).map(s => s.trim()).filter(s => s.length > 0)
        if (sentences.length <= 1) {
          elements.push({
            type: 'text', track: 3, time: currentTime, duration: dur,
            text: scene.narration,
            font_family: 'Noto Sans KR', font_size: '3.2 vmin', font_weight: '700',
            fill_color: '#ffffff', stroke_color: '#000000', stroke_width: '0.3 vmin',
            y: '78%', width: '90%', height: '18%', x_alignment: '50%', y_alignment: '50%',
            line_height: '150%', text_wrap: 'word',
            background_color: 'rgba(0,0,0,0.55)',
            background_x_padding: '3%', background_y_padding: '2%', background_border_radius: '2%',
            animations: [{ type: 'text-appear', time: 0, duration: 0.3, easing: 'ease-out' }],
          })
        } else {
          const chunks = []
          for (let s = 0; s < sentences.length; s += 2) chunks.push(sentences.slice(s, s + 2).join(' '))
          const totalChars = chunks.reduce((sum, c) => sum + c.length, 0)
          let offset = 0
          for (const chunk of chunks) {
            const chunkDur = (chunk.length / totalChars) * dur
            const fadeOut = Math.min(0.3, chunkDur * 0.15)
            elements.push({
              type: 'text', track: 3, time: currentTime + offset, duration: chunkDur,
              text: chunk,
              font_family: 'Noto Sans KR', font_size: '3.2 vmin', font_weight: '700',
              fill_color: '#ffffff', stroke_color: '#000000', stroke_width: '0.3 vmin',
              y: '78%', width: '90%', height: '18%', x_alignment: '50%', y_alignment: '50%',
              line_height: '150%', text_wrap: 'word',
              background_color: 'rgba(0,0,0,0.55)',
              background_x_padding: '3%', background_y_padding: '2%', background_border_radius: '2%',
              animations: [
                { type: 'text-appear', time: 0, duration: 0.25, easing: 'ease-out' },
                { type: 'fade', time: chunkDur - fadeOut, duration: fadeOut, from: '100%', to: '0%' },
              ],
            })
            offset += chunkDur
          }
        }
      }
    }

    // Text overlay (key stat) — 상단 배치
    if (scene?.textOverlay) {
      elements.push({
        type: 'text', track: 4, time: currentTime, duration: dur,
        text: scene.textOverlay,
        font_family: 'Noto Sans KR', font_size: '7 vmin', font_weight: '900',
        fill_color: '#FFD700', stroke_color: '#000000', stroke_width: '0.3 vmin',
        y: '8%', x_alignment: '50%',
        background_color: 'rgba(0,0,0,0.5)',
        background_x_padding: '4%', background_y_padding: '2%', background_border_radius: '2%',
        animations: [{ type: 'scale', time: 0, duration: 0.3, from: '0%', to: '100%', easing: 'back-out' }],
      })
    }

    currentTime += dur
  }

  // BGM
  if (bgmUrl) {
    elements.push({ type: 'audio', track: 5, time: 0, duration: currentTime, source: bgmUrl, volume: '20%', audio_fade_out: '2 s' })
  }

  // School logo
  if (logoUrl) {
    elements.push({ type: 'image', track: 6, time: 0, duration: currentTime, source: logoUrl, x: '90%', y: '5%', width: '12%', opacity: '80%' })
  }

  // School name watermark
  if (schoolName) {
    elements.push({
      type: 'text', track: 7, time: 0, duration: currentTime, text: schoolName,
      font_family: 'Noto Sans KR', font_size: '2.5 vmin', font_weight: '600',
      fill_color: 'rgba(255,255,255,0.6)', x: '50%', y: '3%', x_alignment: '50%',
    })
  }

  const renderBody = {
    output_format: 'mp4', frame_rate: '30 fps',
    width: 1080, height: 1920,
    duration: currentTime, elements,
  }

  pipelineLog(5, 'Creatomate 렌더 요청', { duration: currentTime.toFixed(1), elements: elements.length })

  const submitRes = await fetch('/api/creatomate/renders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CREATOMATE_KEY },
    body: JSON.stringify(renderBody),
  })
  if (!submitRes.ok) {
    const errText = await submitRes.text()
    throw new Error(`Creatomate 오류 (${submitRes.status}): ${errText.slice(0, 200)}`)
  }

  const renders = await submitRes.json()
  const render = Array.isArray(renders) ? renders[0] : renders
  if (!render?.id) throw new Error('Creatomate 렌더 ID 없음')
  if (render.status === 'succeeded') {
    pipelineLog(5, '렌더 즉시 완료', render.url)
    return { url: render.url, duration: currentTime }
  }

  // Poll (max 5 min)
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollRes = await fetch(`/api/creatomate/renders/${render.id}`, { headers: { 'x-api-key': CREATOMATE_KEY } })
    if (!pollRes.ok) continue
    const d = await pollRes.json()
    if (d.status === 'succeeded') {
      pipelineLog(5, '최종 렌더 완료', d.url)
      saveToOutput('step5_final_info.json', JSON.stringify({ url: d.url, duration: currentTime })).catch(() => {})
      return { url: d.url, duration: currentTime }
    }
    if (d.status === 'failed') throw new Error(`렌더 실패: ${d.error_message}`)
  }
  throw new Error('Creatomate 렌더 시간 초과')
}

// ======================================================================
// Creatomate-Only: 이미지 + 애니메이션으로 영상 제작 (Veo 없이)
// ======================================================================
export async function assembleCreatomateOnly(scenes, narrations, options = {}) {
  const { bgmUrl, logoUrl, schoolName, title, checkpoint, onCheckpoint, signal } = options
  const notify = (phase, data) => { if (typeof onCheckpoint === 'function') onCheckpoint(phase, data) }
  const checkAbort = () => { if (signal?.aborted) throw new Error('사용자가 중단했습니다') }

  // ── 1) Imagen 이미지 생성 (체크포인트에 완료된 이미지가 있으면 건너뜀) ──
  const existingImages = checkpoint?.images || []
  const doneImageNums = new Set(existingImages.filter(img => img.url).map(img => img.sceneNumber))
  const pendingImageScenes = scenes.filter(s => !doneImageNums.has(s.sceneNumber))

  if (pendingImageScenes.length < scenes.length) {
    pipelineLog('lite', `체크포인트: ${doneImageNums.size}개 이미지 재사용, ${pendingImageScenes.length}개 생성 필요`)
  } else {
    pipelineLog('lite', 'Creatomate-Only 제작 시작 — 씬별 이미지 생성 중...')
  }

  const images = [...existingImages.filter(img => img.url)]
  for (let i = 0; i < pendingImageScenes.length; i++) {
    checkAbort()
    const scene = pendingImageScenes[i]
    pipelineLog('lite', `씬 ${scene.sceneNumber}/${scenes.length}: Imagen 이미지 생성 중...`)
    try {
      const url = await generateImagenStill(scene)
      images.push({ sceneNumber: scene.sceneNumber, url })
      pipelineLog('lite', `씬 ${scene.sceneNumber} 이미지 완료`)
      // 씬 이미지 완료될 때마다 체크포인트 알림
      notify('images', images)
    } catch (err) {
      if (signal?.aborted) { notify('images', images); throw new Error('사용자가 중단했습니다') }
      pipelineLog('lite', `씬 ${scene.sceneNumber} 이미지 실패: ${err.message}`)
      images.push({ sceneNumber: scene.sceneNumber, url: null, error: err.message })
      notify('images', images)
    }
    // Imagen Rate Limit 방지
    if (i < pendingImageScenes.length - 1) await new Promise(r => setTimeout(r, 2000))
  }
  images.sort((a, b) => a.sceneNumber - b.sceneNumber)

  const failedImages = images.filter(img => !img.url)
  if (failedImages.length === images.length) throw new Error('모든 이미지 생성 실패')

  // ── 2) 서버 업로드 (체크포인트에 업로드된 URL이 있으면 건너뜀) ──
  const existingUploaded = checkpoint?.uploadedImages || []
  const doneUploadNums = new Set(existingUploaded.filter(u => u.publicUrl).map(u => u.sceneNumber))
  const existingUploadedNar = checkpoint?.uploadedNarrations || []
  const doneNarUploadNums = new Set(existingUploadedNar.filter(u => u.publicUrl).map(u => u.sceneNumber))

  pipelineLog('lite', '이미지/나레이션 업로드 중...')

  const uploadedImages = [...existingUploaded.filter(u => u.publicUrl)]
  for (let i = 0; i < images.length; i++) {
    checkAbort()
    const img = images[i]
    if (doneUploadNums.has(img.sceneNumber)) continue // 이미 업로드 완료
    if (img.url) {
      pipelineLog('lite', `이미지 업로드 (씬 ${img.sceneNumber})...`)
      const publicUrl = await uploadToServer(img.url, `lite_scene${img.sceneNumber}.png`)
      if (!publicUrl) pipelineLog('lite', `씬 ${img.sceneNumber} 이미지 업로드 실패 — 건너뜀`)
      uploadedImages.push({ ...img, publicUrl })
    } else {
      uploadedImages.push({ ...img, publicUrl: null })
    }
  }
  uploadedImages.sort((a, b) => a.sceneNumber - b.sceneNumber)
  notify('uploadedImages', uploadedImages)

  checkAbort()

  const uploadedNarrations = [...existingUploadedNar.filter(u => u.publicUrl)]
  for (let i = 0; i < narrations.length; i++) {
    checkAbort()
    const n = narrations[i]
    if (doneNarUploadNums.has(n.sceneNumber)) continue // 이미 업로드 완료
    if (n.audioUrl) {
      pipelineLog('lite', `나레이션 업로드 (씬 ${n.sceneNumber})...`)
      const publicUrl = await uploadToServer(n.audioUrl, `lite_narration${n.sceneNumber}.mp3`)
      if (!publicUrl) pipelineLog('lite', `씬 ${n.sceneNumber} 나레이션 업로드 실패 — 건너뜀`)
      uploadedNarrations.push({ ...n, publicUrl })
    } else {
      uploadedNarrations.push({ ...n, publicUrl: null })
    }
  }
  uploadedNarrations.sort((a, b) => a.sceneNumber - b.sceneNumber)
  notify('uploadedNarrations', uploadedNarrations)

  // 3) Creatomate 렌더 구성
  pipelineLog('lite', 'Creatomate 렌더 구성 중...')

  const elements = []
  let currentTime = 0
  const transitionDur = 0.6

  // 이미지 모션 프리셋: pan(시작/끝 좌표+줌) 기반 시네마틱 카메라 워크
  const imageMotionPresets = [
    // 좌→우 시네마틱 패닝 + 줌인
    (dur) => [
      { type: 'pan', time: 0, duration: dur, easing: 'ease-in-out', start_scale: '110%', end_scale: '125%', start_x: '-10%', start_y: '0%', end_x: '10%', end_y: '0%' },
    ],
    // 우→좌 패닝 + 줌아웃 (역방향)
    (dur) => [
      { type: 'pan', time: 0, duration: dur, easing: 'ease-in-out', start_scale: '130%', end_scale: '110%', start_x: '10%', start_y: '3%', end_x: '-10%', end_y: '-3%' },
    ],
    // 상→하 틸트 + 줌인 (세로 이동)
    (dur) => [
      { type: 'pan', time: 0, duration: dur, easing: 'ease-in-out', start_scale: '115%', end_scale: '130%', start_x: '0%', start_y: '-8%', end_x: '0%', end_y: '8%' },
    ],
    // 대각선 드리프트 + 줌아웃
    (dur) => [
      { type: 'pan', time: 0, duration: dur, easing: 'ease-in-out', start_scale: '135%', end_scale: '112%', start_x: '-8%', start_y: '-6%', end_x: '8%', end_y: '6%' },
    ],
  ]

  // 씬 전환 효과 프리셋 (첫 씬 제외)
  const sceneTransitionPresets = [
    { type: 'circular-wipe', duration: transitionDur, easing: 'ease-in-out' },
    { type: 'color-wipe', duration: transitionDur, easing: 'ease-out', color: '#1a1a2e' },
    { type: 'film-roll', duration: transitionDur, easing: 'ease-in-out' },
    { type: 'flip', duration: transitionDur, easing: 'ease-in-out' },
  ]

  // 숫자 오버레이: 항상 text-counter 포함 + 추가 이펙트 로테이션
  const overlayExtras = [
    // 스케일 팝 + 바운스
    (dur) => [
      { type: 'scale', time: 0, duration: 0.5, from: '50%', to: '100%', easing: 'back-out' },
      { type: 'bounce', time: 0.5, duration: 0.4, easing: 'ease-out' },
    ],
    // 스케일 팝 + shake
    (dur) => [
      { type: 'scale', time: 0, duration: 0.4, from: '0%', to: '100%', easing: 'back-out' },
      { type: 'shake', time: 0.4, duration: 0.3 },
    ],
    // 슬라이드 업 + 스케일
    (dur) => [
      { type: 'slide', time: 0, duration: 0.5, from_y: '20%', y: '0%', easing: 'back-out' },
      { type: 'scale', time: 0, duration: 0.5, from: '60%', to: '100%', easing: 'back-out' },
    ],
  ]

  // 자막 텍스트: 긴 문장 → 최대 2줄로 자동 줄바꿈 (약 18자 기준)
  const wrapSubtitle = (text) => {
    if (text.length <= 20) return text
    // 중간 지점 근처 공백/조사에서 줄바꿈
    const mid = Math.floor(text.length / 2)
    let breakIdx = -1
    for (let d = 0; d < 8; d++) {
      if (mid + d < text.length && /[\s,.]/.test(text[mid + d])) { breakIdx = mid + d; break }
      if (mid - d >= 0 && /[\s,.]/.test(text[mid - d])) { breakIdx = mid - d; break }
    }
    if (breakIdx === -1) breakIdx = mid
    return text.slice(0, breakIdx + 1).trim() + '\n' + text.slice(breakIdx + 1).trim()
  }

  for (let i = 0; i < uploadedImages.length; i++) {
    const img = uploadedImages[i]
    const scene = scenes.find(s => s.sceneNumber === img.sceneNumber)
    const narration = uploadedNarrations.find(n => n.sceneNumber === img.sceneNumber)
    const dur = narration?.duration || scene?.duration || 5

    // 이미지 + 시네마틱 카메라 워크 (pan 기반)
    if (img.publicUrl) {
      const motionAnims = imageMotionPresets[i % imageMotionPresets.length](dur)
      const transitionAnim = i > 0 ? [{ ...sceneTransitionPresets[i % sceneTransitionPresets.length], time: 0 }] : []
      elements.push({
        type: 'image', track: 1, time: currentTime, duration: dur,
        source: img.publicUrl, fit: 'cover',
        animations: [...motionAnims, ...transitionAnim],
      })
    }

    // 나레이션 오디오
    if (narration?.publicUrl) {
      elements.push({ type: 'audio', track: 2, time: currentTime, duration: dur, source: narration.publicUrl })
    }

    // ── 자막 (하단, 나레이션 처음~끝 연속 표시) ──
    if (scene?.narration) {
      const timings = narration?.sentenceTimings

      if (timings && timings.length > 0) {
        // 타임스탬프 기반: 문장 1개씩 표시 (연속, 빈 구간 없이)
        for (let t = 0; t < timings.length; t++) {
          const sent = timings[t]
          const nextStart = t < timings.length - 1 ? timings[t + 1].start : dur
          const chunkDur = Math.max(nextStart - sent.start, 0.3)
          elements.push({
            type: 'text', track: 3, time: currentTime + sent.start, duration: chunkDur,
            text: wrapSubtitle(sent.text),
            font_family: 'Noto Sans KR', font_size: '3.2 vmin', font_weight: '700',
            fill_color: '#ffffff', stroke_color: '#000000', stroke_width: '0.3 vmin',
            y: '78%', width: '90%', height: '18%', x_alignment: '50%', y_alignment: '50%',
            line_height: '150%', text_wrap: 'word',
            background_color: 'rgba(0,0,0,0.6)',
            background_x_padding: '4%', background_y_padding: '2%', background_border_radius: '1.5%',
            animations: [
              { type: 'text-appear', time: 0, duration: 0.2, easing: 'ease-out' },
            ],
          })
        }
        pipelineLog('lite', `씬 ${scene.sceneNumber} 자막 싱크 (타임스탬프, ${timings.length}문장)`)
      } else {
        // 폴백: 전체 나레이션을 문장 단위로 분할, 글자수 비례 배분 (빈 구간 없이)
        const sentences = scene.narration.split(/(?<=[.!?。！？])\s*/).map(s => s.trim()).filter(s => s.length > 0)
        const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1
        let offset = 0
        for (const sent of sentences) {
          const chunkDur = Math.max((sent.length / totalChars) * dur, 0.5)
          elements.push({
            type: 'text', track: 3, time: currentTime + offset, duration: chunkDur,
            text: wrapSubtitle(sent),
            font_family: 'Noto Sans KR', font_size: '3.2 vmin', font_weight: '700',
            fill_color: '#ffffff', stroke_color: '#000000', stroke_width: '0.3 vmin',
            y: '78%', width: '90%', height: '18%', x_alignment: '50%', y_alignment: '50%',
            line_height: '150%', text_wrap: 'word',
            background_color: 'rgba(0,0,0,0.6)',
            background_x_padding: '4%', background_y_padding: '2%', background_border_radius: '1.5%',
            animations: [
              { type: 'text-appear', time: 0, duration: 0.2, easing: 'ease-out' },
            ],
          })
          offset += chunkDur
        }
        pipelineLog('lite', `씬 ${scene.sceneNumber} 자막 싱크 (글자수 비례 폴백, ${sentences.length}문장)`)
      }
    }

    // ── 수치 오버레이 + 모션그래픽 (숫자/영어만, 비라틴 문자 완전 제거) ──
    if (scene?.textOverlay) {
      const cleanOverlay = scene.textOverlay.replace(/[^a-zA-Z0-9.,% +\-]/g, '').trim()
      if (cleanOverlay && /\d/.test(cleanOverlay)) {
        // 모션그래픽 배경: 반투명 다크 박스 + 글로우 라인
        elements.push({
          type: 'shape', track: 9, time: currentTime + 0.1, duration: dur - 0.1,
          shape_type: 'rectangle',
          width: '75%', height: '18%', y: '5%', x_alignment: '50%',
          fill_color: 'rgba(0,0,0,0.45)',
          border_radius: '2 vmin',
          animations: [
            { type: 'scale', time: 0, duration: 0.4, from: '80%', to: '100%', easing: 'back-out' },
            { type: 'fade', time: 0, duration: 0.3, from: '0%', to: '100%' },
          ],
        })
        // 글로우 구분선
        elements.push({
          type: 'shape', track: 10, time: currentTime + 0.3, duration: dur - 0.3,
          shape_type: 'rectangle',
          width: '50%', height: '0.3%', y: '15%', x_alignment: '50%',
          fill_color: '#FFD700',
          shadow_color: 'rgba(255,215,0,0.5)', shadow_blur: '1 vmin',
          animations: [
            { type: 'scale', time: 0, duration: 0.5, x_anchor: '50%', from: '0%', to: '100%', easing: 'ease-out' },
          ],
        })
        // 숫자 카운트업 텍스트 (길이에 따라 폰트 크기 자동 조절)
        const numSize = cleanOverlay.length <= 5 ? '12 vmin' : cleanOverlay.length <= 10 ? '9 vmin' : '7 vmin'
        elements.push({
          type: 'text', track: 4, time: currentTime, duration: dur,
          text: cleanOverlay,
          font_family: 'Montserrat', font_size: numSize, font_weight: '900',
          fill_color: '#FFD700', stroke_color: '#000000', stroke_width: '0.4 vmin',
          y: '7%', width: '80%', x_alignment: '50%', line_height: '130%',
          shadow_color: 'rgba(255,215,0,0.3)', shadow_blur: '2 vmin',
          animations: [
            { type: 'text-counter', time: 0, duration: Math.min(1.5, dur * 0.3), easing: 'ease-out' },
            ...overlayExtras[i % overlayExtras.length](dur),
          ],
        })
      } else if (cleanOverlay) {
        // 숫자 없는 영어 텍스트
        const txtSize = cleanOverlay.length <= 8 ? '8 vmin' : cleanOverlay.length <= 15 ? '6 vmin' : '5 vmin'
        elements.push({
          type: 'text', track: 4, time: currentTime, duration: dur,
          text: cleanOverlay,
          font_family: 'Montserrat', font_size: txtSize, font_weight: '900',
          fill_color: '#FFD700', stroke_color: '#000000', stroke_width: '0.3 vmin',
          y: '7%', width: '80%', x_alignment: '50%', line_height: '130%',
          shadow_color: 'rgba(0,0,0,0.5)', shadow_blur: '2 vmin',
          animations: overlayExtras[i % overlayExtras.length](dur),
        })
      }
    }

    currentTime += dur
  }

  // 타이틀 제거됨 (사용자 요청)

  // BGM
  if (bgmUrl) {
    elements.push({ type: 'audio', track: 5, time: 0, duration: currentTime, source: bgmUrl, volume: '20%', audio_fade_out: '2 s' })
  }
  // Logo
  if (logoUrl) {
    elements.push({
      type: 'image', track: 6, time: 0, duration: currentTime, source: logoUrl,
      x: '90%', y: '5%', width: '12%', opacity: '80%',
      animations: [{ type: 'fade', time: 0, duration: 0.8, from: '0%', to: '80%', easing: 'ease-out' }],
    })
  }
  // School name
  if (schoolName) {
    elements.push({
      type: 'text', track: 7, time: 0, duration: currentTime, text: schoolName,
      font_family: 'Noto Sans KR', font_size: '2.5 vmin', font_weight: '600',
      fill_color: 'rgba(255,255,255,0.6)', x: '50%', y: '3%', x_alignment: '50%',
    })
  }

  const renderBody = {
    output_format: 'mp4', frame_rate: '30 fps',
    width: 1080, height: 1920,
    duration: currentTime, elements,
  }

  pipelineLog('lite', 'Creatomate 렌더 요청', { duration: currentTime.toFixed(1), elements: elements.length })

  const submitRes = await fetch('/api/creatomate/renders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CREATOMATE_KEY },
    body: JSON.stringify(renderBody),
  })
  if (!submitRes.ok) {
    const errText = await submitRes.text()
    throw new Error(`Creatomate 오류 (${submitRes.status}): ${errText.slice(0, 200)}`)
  }

  const renders = await submitRes.json()
  const render = Array.isArray(renders) ? renders[0] : renders
  if (!render?.id) throw new Error('Creatomate 렌더 ID 없음')
  if (render.status === 'succeeded') {
    pipelineLog('lite', '렌더 즉시 완료', render.url)
    return { url: render.url, duration: currentTime }
  }

  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollRes = await fetch(`/api/creatomate/renders/${render.id}`, { headers: { 'x-api-key': CREATOMATE_KEY } })
    if (!pollRes.ok) continue
    const d = await pollRes.json()
    if (d.status === 'succeeded') {
      pipelineLog('lite', '최종 렌더 완료', d.url)
      return { url: d.url, duration: currentTime }
    }
    if (d.status === 'failed') throw new Error(`렌더 실패: ${d.error_message}`)
  }
  throw new Error('Creatomate 렌더 시간 초과')
}

// ======================================================================
// Optional: 업스케일 (ElevenLabs Video Upscaler)
// ======================================================================
export async function upscaleVideo(videoUrl) {
  pipelineLog('upscale', '영상 업스케일 시작')

  const res = await fetch('/api/elevenlabs/upscale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ELEVENLABS_KEY },
    body: JSON.stringify({ videoUrl }),
  })
  if (!res.ok) throw new Error(`업스케일 API 오류: ${res.status}`)
  const { id: taskId } = await res.json()

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const pollRes = await fetch(`/api/elevenlabs/upscale/${taskId}`, { headers: { 'x-api-key': ELEVENLABS_KEY } })
    if (!pollRes.ok) continue
    const d = await pollRes.json()
    if (d.status === 'completed') {
      pipelineLog('upscale', '업스케일 완료', d.output_url)
      return d.output_url
    }
    if (d.status === 'failed') throw new Error('업스케일 실패')
  }
  throw new Error('업스케일 시간 초과')
}

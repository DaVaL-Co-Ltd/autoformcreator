/**
 * Shorts Pipeline Service
 * 5-Step: Script → Voice → Video Source → Lip-sync → Assembly
 * 10초 테스트 모드 / 하이브리드 모드 / 업스케일 옵션 지원
 */

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY
const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY
const CREATOMATE_KEY = import.meta.env.VITE_CREATOMATE_API_KEY
const PUBLIC_SERVER_URL = import.meta.env.VITE_PUBLIC_SERVER_URL || '' // ngrok URL

const VOICE_ID = '4JJwo477JUAx3HV0T7n7' // 한국어 보이스
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

  if (!base64Data) return null

  try {
    const res = await fetch('/api/output/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data: base64Data, encoding: 'base64' }),
    })
    if (!res.ok) return null
    const { url } = await res.json()
    // ngrok URL이 있으면 사용, 없으면 localhost (Creatomate 접근 불가)
    const base = PUBLIC_SERVER_URL || `${window.location.protocol}//${window.location.host}`
    const abs = `${base}${url}`
    pipelineLog('upload', `업로드 완료: ${filename}`, abs)
    return abs
  } catch {
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

  const prompt = `당신은 한국 대학 입시 정보를 재밌게 전달하는 숏폼 영상 대본 작가입니다.

아래 요약과 원문을 바탕으로 정확히 ${targetDuration}초 분량의 유쾌한 한국어 숏폼 대본을 작성하세요.
${emphasis ? `\n특별히 강조할 내용: ${emphasis}` : ''}

## 요구사항
- 반드시 ${sceneCount}개 이상의 씬 (최소 2개 씬 필수), 각 씬의 duration 합계가 정확히 ${targetDuration}초가 되도록
- 나레이션 총 ${charTarget}자 내외의 친근한 한국어 (존댓말), 각 씬 1~2문장
- 첫 씬: 시선을 끄는 Hook / 마지막 씬: CTA (행동 유도)
- 숫자/통계는 원본 그대로 보존
${hybridMode ? '- 하이브리드 모드: 가장 핵심적인 1개 씬만 useVideo: true, 나머지는 false' : '- 모든 씬 useVideo: true'}

## imagePrompt 규칙 (매우 중요!)
- 반드시 영어로 작성
- 대본 내용/문서 분석 결과와 직접 관련된 구체적 장면을 묘사할 것
  예) 입시 → 학생들이 캠퍼스를 걷는 장면, 도서관에서 공부하는 장면, 대학 건물 전경
  예) 통계 → 데이터 차트, 그래프, 인포그래픽
  예) 특정 학과 → 해당 분야 실험실, 작업 공간
- 사람이 활동하는 모습, 물체가 움직이는 장면 등 역동적인 이미지를 요청할 것
- "generic abstract background" 같은 무의미한 프롬프트 금지

## textOverlay 규칙 (매우 중요!)
- 반드시 영어 알파벳 또는 숫자만 사용 (한국어, 한자 등 비라틴 문자 절대 금지)
- 핵심 수치(예: "1,906", "82.5%")나 영문 키워드(예: "TOP 3", "SNU 2025")만 허용
- 한국어 텍스트를 넣어야 할 경우 영어로 번역하거나 숫자로 대체

## 요약
${summary?.summary || ''}
${summary?.keyData?.map(d => `- ${d.label}: ${d.value}${d.context ? ' (' + d.context + ')' : ''}`).join('\n') || ''}

## 원문 (발췌)
${(rawText || '').slice(0, 2000)}

## 출력 (JSON만, 다른 텍스트 없이)
{
  "title": "영상 제목 (한국어)",
  "totalDuration": ${targetDuration},
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": 5,
      "narration": "한국어 나레이션 텍스트",
      "videoPrompt": "Clean motion graphics animation showing university campus with floating data charts and numbers. Smooth transitions, vibrant blue and purple colors. No people, no faces, no audio. 9:16 vertical format.",
      "imagePrompt": "Students walking through a prestigious Korean university campus with cherry blossoms, modern buildings in background, warm afternoon sunlight, cinematic 9:16 portrait",
      "textOverlay": "1,906",
      "useVideo": true
    }
  ],
  "bgmStyle": "upbeat"
}`

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
            generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
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

  let script
  try {
    script = JSON.parse(jsonText)
  } catch {
    // JSON 파싱 실패 시 텍스트에서 { } 블록 추출 후 재시도
    const match = jsonText.match(/\{[\s\S]*\}/)
    if (match) {
      script = JSON.parse(match[0])
    } else {
      throw new Error('대본 JSON 파싱 실패')
    }
  }
  pipelineLog(1, '대본 생성 완료', { title: script.title, scenes: script.scenes?.length })

  // 비동기 저장 (UI 블로킹 방지)
  saveToOutput('step1_script.json', JSON.stringify(script, null, 2)).catch(() => {})
  return script
}

// ======================================================================
// Step 2: 음성 생성 (ElevenLabs TTS)
// ======================================================================
export async function generatePipelineVoice(scenes) {
  pipelineLog(2, '음성 생성 시작', { sceneCount: scenes.length })

  const results = []
  for (const scene of scenes) {
    pipelineLog(2, `씬 ${scene.sceneNumber} TTS 생성 중...`)
    try {
      const res = await fetch(`/api/elevenlabs/tts/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ELEVENLABS_KEY },
        body: JSON.stringify({
          text: scene.narration,
          model_id: 'eleven_turbo_v2_5',
          language_code: 'ko',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
        }),
      })
      if (!res.ok) throw new Error(`ElevenLabs 오류: ${res.status}`)

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      const duration = await new Promise((resolve) => {
        const a = new Audio()
        a.preload = 'metadata'
        a.onloadedmetadata = () => resolve(a.duration)
        a.onerror = () => resolve(scene.duration || 5)
        a.src = audioUrl
      })

      results.push({ sceneNumber: scene.sceneNumber, audioUrl, audioBlob, duration, text: scene.narration })
      pipelineLog(2, `씬 ${scene.sceneNumber} TTS 완료 (${duration.toFixed(1)}s)`)

      // 서버 저장 (타임아웃 5초, 실패해도 무시)
      Promise.race([
        blobUrlToBase64(audioUrl).then(b64 => b64 && saveToOutput(`step2_narration_scene${scene.sceneNumber}.mp3`, b64, 'base64')),
        new Promise(r => setTimeout(r, 5000)),
      ]).catch(() => {})

    } catch (err) {
      results.push({ sceneNumber: scene.sceneNumber, audioUrl: null, error: err.message, duration: scene.duration || 5 })
      pipelineLog(2, `씬 ${scene.sceneNumber} TTS 실패`, err.message)
    }
  }

  pipelineLog(2, '음성 생성 완료', { success: results.filter(r => r.audioUrl).length, total: results.length })
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
  const prompt = `${scene.videoPrompt}. Smooth motion graphics animation, clean design, vibrant colors. 9:16 portrait vertical format. No people, no faces, no speech, no audio. ABSOLUTE RULE: Do NOT render ANY Korean, Chinese, Japanese, Arabic, or Cyrillic characters. Only English alphabet and numbers are allowed if text appears.`

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
  const prompt = `${basePrompt}. ${keyword ? `Key data: ${keyword}.` : ''} High quality cinematic photograph with dynamic action — people walking, studying, interacting, or objects in motion. NOT a static posed shot. 9:16 vertical portrait, dramatic cinematic lighting with depth. ABSOLUTE RULE: The image must contain ZERO non-Latin characters. No Korean, No Chinese, No Japanese, No Arabic, No Cyrillic. If any text appears in the image it must be English alphabet or numbers ONLY.`

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

    // Subtitle (motion graphic)
    if (scene?.narration) {
      elements.push({
        type: 'text', track: 3, time: currentTime, duration: dur,
        text: scene.narration,
        font_family: 'Noto Sans KR', font_size: '4 vmin', font_weight: '700',
        fill_color: '#ffffff', stroke_color: '#000000', stroke_width: '0.4 vmin',
        y: '82%', width: '90%', x_alignment: '50%',
        background_color: 'rgba(0,0,0,0.5)',
        background_x_padding: '3%', background_y_padding: '1.5%', background_border_radius: '2%',
        animations: [{ type: 'text-appear', time: 0, duration: 0.4, easing: 'ease-out' }],
      })
    }

    // Text overlay (key stat)
    if (scene?.textOverlay) {
      elements.push({
        type: 'text', track: 4, time: currentTime, duration: dur,
        text: scene.textOverlay,
        font_family: 'Noto Sans KR', font_size: '7 vmin', font_weight: '900',
        fill_color: '#FFD700', stroke_color: '#000000', stroke_width: '0.3 vmin',
        y: '30%', x_alignment: '50%',
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
  const { bgmUrl, logoUrl, schoolName } = options

  pipelineLog('lite', 'Creatomate-Only 제작 시작 — 씬별 이미지 생성 중...')

  // 1) Imagen으로 씬별 이미지 생성
  const images = []
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]
    pipelineLog('lite', `씬 ${scene.sceneNumber}/${scenes.length}: Imagen 이미지 생성 중...`)
    try {
      const url = await generateImagenStill(scene)
      images.push({ sceneNumber: scene.sceneNumber, url })
      pipelineLog('lite', `씬 ${scene.sceneNumber} 이미지 완료`)
    } catch (err) {
      pipelineLog('lite', `씬 ${scene.sceneNumber} 이미지 실패: ${err.message}`)
      images.push({ sceneNumber: scene.sceneNumber, url: null, error: err.message })
    }
    // Imagen Rate Limit 방지
    if (i < scenes.length - 1) await new Promise(r => setTimeout(r, 2000))
  }

  const failedImages = images.filter(img => !img.url)
  if (failedImages.length === images.length) throw new Error('모든 이미지 생성 실패')

  // 2) 서버에 업로드 → 공개 URL
  pipelineLog('lite', '이미지/나레이션 업로드 중...')

  const uploadedImages = []
  for (const img of images) {
    if (img.url) {
      const publicUrl = await uploadToServer(img.url, `lite_scene${img.sceneNumber}.png`)
      uploadedImages.push({ ...img, publicUrl })
    } else {
      uploadedImages.push({ ...img, publicUrl: null })
    }
  }

  const uploadedNarrations = []
  for (const n of narrations) {
    if (n.audioUrl) {
      const publicUrl = await uploadToServer(n.audioUrl, `lite_narration${n.sceneNumber}.mp3`)
      uploadedNarrations.push({ ...n, publicUrl })
    } else {
      uploadedNarrations.push({ ...n, publicUrl: null })
    }
  }

  // 3) Creatomate 렌더 구성
  pipelineLog('lite', 'Creatomate 렌더 구성 중...')

  const elements = []
  let currentTime = 0
  const transitionDur = 0.5

  // 다양한 모션 애니메이션 프리셋 (단순 줌이 아닌 역동적 효과)
  const motionPresets = [
    // 좌→우 패닝 + 약간 줌인
    (dur, transitionDur, isFirst) => [
      { type: 'scale', time: 0, duration: dur, from: '110%', to: '120%', easing: 'linear' },
      { type: 'slide', time: 0, duration: dur, from_x: '-8%', from_y: '0%', x: '8%', y: '0%', easing: 'ease-in-out' },
      ...(isFirst ? [] : [{ type: 'fade', time: 0, duration: transitionDur, from: '0%', to: '100%' }]),
    ],
    // 우→좌 패닝 + 줌아웃
    (dur, transitionDur, isFirst) => [
      { type: 'scale', time: 0, duration: dur, from: '125%', to: '110%', easing: 'linear' },
      { type: 'slide', time: 0, duration: dur, from_x: '8%', from_y: '0%', x: '-8%', y: '0%', easing: 'ease-in-out' },
      ...(isFirst ? [] : [{ type: 'fade', time: 0, duration: transitionDur, from: '0%', to: '100%' }]),
    ],
    // 상→하 틸트 + 줌인
    (dur, transitionDur, isFirst) => [
      { type: 'scale', time: 0, duration: dur, from: '115%', to: '125%', easing: 'linear' },
      { type: 'slide', time: 0, duration: dur, from_x: '0%', from_y: '-6%', x: '0%', y: '6%', easing: 'ease-in-out' },
      ...(isFirst ? [] : [{ type: 'fade', time: 0, duration: transitionDur, from: '0%', to: '100%' }]),
    ],
    // 대각선 이동 + 줌아웃
    (dur, transitionDur, isFirst) => [
      { type: 'scale', time: 0, duration: dur, from: '130%', to: '112%', easing: 'linear' },
      { type: 'slide', time: 0, duration: dur, from_x: '-5%', from_y: '-4%', x: '5%', y: '4%', easing: 'ease-in-out' },
      ...(isFirst ? [] : [{ type: 'fade', time: 0, duration: transitionDur, from: '0%', to: '100%' }]),
    ],
  ]

  for (let i = 0; i < uploadedImages.length; i++) {
    const img = uploadedImages[i]
    const scene = scenes.find(s => s.sceneNumber === img.sceneNumber)
    const narration = uploadedNarrations.find(n => n.sceneNumber === img.sceneNumber)
    const dur = narration?.duration || scene?.duration || 5

    // 이미지 + 다양한 모션 효과 (패닝, 틸트, 대각선 이동 등 순환)
    if (img.publicUrl) {
      const preset = motionPresets[i % motionPresets.length]
      elements.push({
        type: 'image', track: 1, time: currentTime, duration: dur,
        source: img.publicUrl, fit: 'cover',
        animations: preset(dur, transitionDur, i === 0),
      })
    }

    // 나레이션 오디오
    if (narration?.publicUrl) {
      elements.push({ type: 'audio', track: 2, time: currentTime, duration: dur, source: narration.publicUrl })
    }

    // 자막 (하단)
    if (scene?.narration) {
      elements.push({
        type: 'text', track: 3, time: currentTime, duration: dur,
        text: scene.narration,
        font_family: 'Noto Sans KR', font_size: '4 vmin', font_weight: '700',
        fill_color: '#ffffff', stroke_color: '#000000', stroke_width: '0.4 vmin',
        y: '90%', width: '90%', x_alignment: '50%',
        background_color: 'rgba(0,0,0,0.5)',
        background_x_padding: '3%', background_y_padding: '1.5%', background_border_radius: '2%',
        animations: [{ type: 'text-appear', time: 0, duration: 0.4, easing: 'ease-out' }],
      })
    }

    // 텍스트 오버레이 (핵심 수치 — 영어/숫자만)
    if (scene?.textOverlay) {
      const cleanOverlay = scene.textOverlay.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ\u4e00-\u9fff]/g, '').trim()
      if (cleanOverlay) {
        elements.push({
          type: 'text', track: 4, time: currentTime, duration: dur,
          text: cleanOverlay,
          font_family: 'Montserrat', font_size: '7 vmin', font_weight: '900',
          fill_color: '#FFD700', stroke_color: '#000000', stroke_width: '0.3 vmin',
          y: '30%', x_alignment: '50%',
          animations: [
            { type: 'scale', time: 0, duration: 0.3, from: '0%', to: '100%', easing: 'back-out' },
            { type: 'slide', time: 0, duration: 0.5, from_y: '10%', y: '0%', easing: 'ease-out' },
          ],
        })
      }
    }

    currentTime += dur
  }

  // BGM
  if (bgmUrl) {
    elements.push({ type: 'audio', track: 5, time: 0, duration: currentTime, source: bgmUrl, volume: '20%', audio_fade_out: '2 s' })
  }
  // Logo
  if (logoUrl) {
    elements.push({ type: 'image', track: 6, time: 0, duration: currentTime, source: logoUrl, x: '90%', y: '5%', width: '12%', opacity: '80%' })
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

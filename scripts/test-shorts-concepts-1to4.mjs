// 컨셉 1~4 테스트 영상 생성 (각 컨셉 내장 15초 testScript 사용).
// ExtractionPage.jsx 의 쇼츠 영상 생성 로직을 그대로 복제한다:
//   - briefing_dongwan, pet_dictionary → Video Agent (/v1/video_agent/generate)
//   - dongwan_secret  → 표준 (/v2/video/generate) + randomVariantPerVideo
//   - godsaeng_routine → 표준 + shuffleSceneVariants + full-vlog(Gemini 배경)
//
// 사용: node scripts/test-shorts-concepts-1to4.mjs [conceptId ...]
//   인자 없으면 4개 전부. 예) node scripts/test-shorts-concepts-1to4.mjs dongwan_secret

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'concept-test-videos-1to4')

async function loadDotenv(envPath) {
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!(key in process.env)) process.env[key] = val
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

await loadDotenv(path.join(ROOT, 'server', '.env'))
await loadDotenv(path.join(ROOT, '.env.local'))

const HEYGEN_API_KEY = (process.env.HEYGEN_API_KEY || '').trim()
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim()
if (!HEYGEN_API_KEY) {
  console.error('HEYGEN_API_KEY 없음 (server/.env 또는 .env.local)')
  process.exit(1)
}

// client/src/utils 모듈을 Node 에서 쓰기 위해 tmp 디렉터리로 복사 (상대 import 확장자 보정).
async function importModules() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-concept-test')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygenSource = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  let conceptsSource = await fs.readFile(path.join(srcDir, 'shortsVideoConcepts.js'), 'utf8')
  conceptsSource = conceptsSource.replace(
    /from\s+(['"])\.\/heygenAvatars\1/g,
    "from './heygenAvatars.js'",
  )
  const agentSource = await fs.readFile(path.join(srcDir, 'shortsVideoAgent.js'), 'utf8')
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygenSource, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoConcepts.js'), conceptsSource, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoAgent.js'), agentSource, 'utf8')
  const concepts = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href)
  const avatars = await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
  const agent = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoAgent.js')).href)
  return { concepts, avatars, agent }
}

const { concepts: conceptsMod, avatars: avatarsMod, agent: agentMod } = await importModules()
const { findShortsVideoConcept, buildShortsConceptExtra } = conceptsMod
const { HEYGEN_AVATAR_LIST } = avatarsMod
const { buildShortsVideoAgentPrompt } = agentMod

function avatarMeta(avatarId) {
  return HEYGEN_AVATAR_LIST.find((a) => a.avatarId === avatarId) || null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

// server/index.js 의 /api/heygen/shorts-vlog-background 복제:
// Gemini 이미지 생성 → HeyGen 자산 업로드 → image_key 반환.
const VLOG_MOOD_VARIATIONS = [
  'warm beige and cream color palette',
  'cool white and soft sage color palette',
  'pastel pink and dusty rose color palette',
  'soft mint and cream color palette',
  'muted cream and oat tone palette',
  'warm honey and amber color palette',
]
async function generateVlogBackground(visualDescription) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 없음 — full-vlog 배경 생성 불가')
  const seedMood = VLOG_MOOD_VARIATIONS[Math.floor(Math.random() * VLOG_MOOD_VARIATIONS.length)]
  const prompt = `${visualDescription}, ${seedMood}, vertical 9:16 composition, no people visible, no text overlays, no logos, no watermarks, professional vlog photography, high quality realistic photo`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gemini image ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  const parts = data?.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart) throw new Error('Gemini 이미지 미반환')
  const buffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const mimeType = imagePart.inlineData.mimeType || 'image/png'
  const up = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': mimeType },
    body: buffer,
  })
  const upData = await up.json().catch(() => ({}))
  if (!up.ok) throw new Error(`HeyGen upload ${up.status}: ${JSON.stringify(upData).slice(0, 200)}`)
  // background.image_asset_id 는 asset UUID 만 받는다 — data.id 우선, 없으면 image_key 의 UUID 토큰.
  return upData.data?.id || String(upData.data?.image_key || '').split('/')[1] || ''
}

// 표준 엔드포인트 video_inputs 빌드 (ExtractionPage standard 경로 복제).
// 솔로/멀티 아바타, variant 랜덤·셔플, full-vlog / dialogue·quiz·solo-shared-bg 레이아웃 처리.
async function buildStandardInputs(concept, script) {
  const useMultiAvatar = concept.preferredAvatarIds.length > 1
  const hasSceneAvatars = !useMultiAvatar
    && Array.isArray(concept.sceneAvatarIds) && concept.sceneAvatarIds.length > 0
  const randomVariantPerVideo = hasSceneAvatars && concept.randomVariantPerVideo === true
  const shuffleSceneVariants = hasSceneAvatars && !randomVariantPerVideo && concept.shuffleSceneVariants === true
  const baseAvatarId = concept.preferredAvatarIds[0]

  let conceptAvatarIds
  if (useMultiAvatar) {
    conceptAvatarIds = concept.preferredAvatarIds
  } else if (randomVariantPerVideo) {
    const picked = concept.sceneAvatarIds[Math.floor(Math.random() * concept.sceneAvatarIds.length)]
    conceptAvatarIds = [picked]
    console.log(`  randomVariantPerVideo → 변형 ${picked} (전 씬 동일)`)
  } else if (shuffleSceneVariants) {
    conceptAvatarIds = shuffle(concept.sceneAvatarIds)
    console.log(`  shuffleSceneVariants → ${conceptAvatarIds.slice(0, script.scenes.length).join(', ')}`)
  } else if (hasSceneAvatars) {
    conceptAvatarIds = concept.sceneAvatarIds
  } else {
    conceptAvatarIds = [baseAvatarId]
  }

  // 공유 배경: dialogue/quiz/solo-shared-bg 씬이 있으면 sharedBackground 로 1회만 생성.
  let sharedBgId = null
  const needsSharedBg = script.scenes.some((s) =>
    s?.layout === 'dialogue-shared-bg' || s?.layout === 'quiz-shared-bg' || s?.layout === 'solo-shared-bg')
  if (needsSharedBg && script.sharedBackground?.visualDescription) {
    try {
      sharedBgId = await generateVlogBackground(script.sharedBackground.visualDescription)
      console.log(`  공유 배경 생성 OK`)
    } catch (e) {
      console.warn(`  공유 배경 생성 실패: ${e.message}`)
    }
  }

  const inputs = []
  for (let idx = 0; idx < script.scenes.length; idx++) {
    const scene = script.scenes[idx]
    const narration = String(scene?.narration || '').trim()
    const avatarId = scene?.avatarId || conceptAvatarIds[idx % conceptAvatarIds.length]
    // voice: 그 씬 아바타의 voice (멀티 아바타는 인물마다 다름). variant ID 는 메타에 없어 base 로 fallback.
    const voiceId = avatarMeta(avatarId)?.defaultVoiceId || avatarMeta(baseAvatarId)?.defaultVoiceId
    const isCountdown = scene?.layout === 'quiz-countdown'
    const input = {
      character: { type: 'talking_photo', talking_photo_id: avatarId },
      voice: isCountdown
        ? { type: 'silence', duration: Number(scene?.duration) || 3 }
        : { type: 'text', input_text: narration, voice_id: voiceId },
    }
    if (scene?.layout === 'full-vlog' && scene?.visualDescription) {
      try {
        const key = await generateVlogBackground(scene.visualDescription)
        if (key) {
          input.background = { type: 'image', image_asset_id: key }
          console.log(`  씬 ${idx + 1} 배경 생성 OK`)
        }
      } catch (e) {
        console.warn(`  씬 ${idx + 1} 배경 실패: ${e.message}`)
      }
    } else if (scene?.layout === 'dialogue-shared-bg' && sharedBgId) {
      // 공유 배경 + speakerSide 로 좌우 배치.
      const side = scene?.speakerSide === 'right' ? 0.30 : -0.30
      input.character.scale = 0.85
      input.character.offset = { x: side, y: 0 }
      input.background = { type: 'image', image_asset_id: sharedBgId }
    } else if ((scene?.layout === 'quiz-shared-bg' || scene?.layout === 'solo-shared-bg') && sharedBgId) {
      // 공유 배경 + 아바타 중앙 풀샷 (scale·offset 기본값).
      input.background = { type: 'image', image_asset_id: sharedBgId }
    }
    // 컨셉 backgroundColor 지정 시, 배경 미설정 씬에 단색 배경 적용 (프레이밍 통일).
    if (!input.background && concept.backgroundColor) {
      input.background = { type: 'color', value: concept.backgroundColor }
    }
    inputs.push(input)
  }
  return inputs.filter((i) =>
    i.voice?.type === 'silence'
      ? Number(i.voice.duration) > 0
      : (i.voice?.input_text && i.voice?.voice_id),
  )
}

async function createStandardVideo(concept, script) {
  const video_inputs = await buildStandardInputs(concept, script)
  if (!video_inputs.length) throw new Error('video_inputs 비어있음')
  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_inputs, dimension: { width: 720, height: 1280 } }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`generate ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return data?.data?.video_id || data?.video_id
}

async function createVideoAgentVideo(concept, script) {
  const baseAvatarId = concept.preferredAvatarIds[0]
  const meta = avatarMeta(baseAvatarId)
  const prompt = buildShortsVideoAgentPrompt({
    script,
    avatar: { id: baseAvatarId, kind: 'talking_photo', name: meta?.name || 'avatar' },
    extraPrompt: buildShortsConceptExtra(concept.id),
  })
  const res = await fetch('https://api.heygen.com/v1/video_agent/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, config: { avatar_id: baseAvatarId } }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`video_agent ${res.status}: ${JSON.stringify(data).slice(0, 400)}`)
  return data?.data?.video_id || data?.data?.id || data?.video_id || data?.id
}

async function pollStatus(videoId) {
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`status ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return data?.data || {}
}

async function downloadFile(url, outFile) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const stream = createWriteStream(outFile)
  await finished(Readable.fromWeb(res.body).pipe(stream))
}

const ALL = ['briefing_dongwan', 'dongwan_secret', 'godsaeng_routine', 'pet_dictionary']

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const argIds = process.argv.slice(2).filter(Boolean)
  const ids = argIds.length ? argIds : ALL
  console.log(`대상 컨셉: ${ids.join(', ')}`)
  console.log(`출력 폴더: ${OUT_DIR}\n`)

  const jobs = []
  for (const id of ids) {
    const concept = findShortsVideoConcept(id)
    if (!concept) { console.error(`[${id}] 컨셉 정의 없음, 건너뜀`); continue }
    const script = concept.testScript
    if (!script?.scenes?.length) { console.error(`[${id}] testScript 없음, 건너뜀`); continue }
    const useMultiAvatar = concept.preferredAvatarIds.length > 1
    const useStandard = useMultiAvatar || concept.useStandardEndpoint === true
    console.log(`[${id}] ${concept.label} — ${useStandard ? '표준 엔드포인트' : 'Video Agent'} (씬 ${script.scenes.length}개)`)
    try {
      const videoId = useStandard
        ? await createStandardVideo(concept, script)
        : await createVideoAgentVideo(concept, script)
      if (!videoId) throw new Error('video_id 를 받지 못함')
      console.log(`  video_id: ${videoId}\n`)
      jobs.push({ id, label: concept.label, mode: useStandard ? 'standard' : 'video_agent', videoId, status: 'pending', startedAt: Date.now() })
    } catch (e) {
      console.error(`  생성 실패: ${e.message}\n`)
      jobs.push({ id, label: concept.label, status: 'create_failed', error: e.message })
    }
  }

  if (!jobs.some((j) => j.videoId)) {
    console.error('모든 생성 요청 실패. 종료.')
    await fs.writeFile(path.join(OUT_DIR, '_summary.json'), JSON.stringify(jobs, null, 2), 'utf8')
    return
  }

  console.log('폴링 시작 (30초 간격, 최대 20분/작업)\n')
  const maxWaitMs = 20 * 60 * 1000
  while (jobs.some((j) => j.videoId && j.status === 'pending')) {
    await sleep(30000)
    for (const job of jobs.filter((j) => j.videoId && j.status === 'pending')) {
      try {
        const st = await pollStatus(job.videoId)
        const el = ((Date.now() - job.startedAt) / 1000).toFixed(0)
        if (st.status === 'completed') {
          job.status = 'completed'; job.videoUrl = st.video_url; job.duration = st.duration
          console.log(`  ✅ [${job.id}] 완료 (${el}s)${st.duration ? ` ${st.duration}s` : ''}`)
        } else if (st.status === 'failed') {
          job.status = 'failed'; job.error = st.error?.message || JSON.stringify(st.error)
          console.log(`  ❌ [${job.id}] 실패 (${el}s): ${job.error}`)
        } else {
          console.log(`  ⏳ [${job.id}] ${st.status} (${el}s)`)
        }
        if (job.status === 'pending' && Date.now() - job.startedAt > maxWaitMs) {
          job.status = 'timeout'
          console.log(`  ⏰ [${job.id}] 타임아웃`)
        }
      } catch (e) {
        console.log(`  ⚠️ [${job.id}] 폴링 에러: ${e.message}`)
      }
    }
  }

  console.log('\n다운로드 시작')
  for (const job of jobs.filter((j) => j.status === 'completed' && j.videoUrl)) {
    const outFile = path.join(OUT_DIR, `${job.id}.mp4`)
    try {
      await downloadFile(job.videoUrl, outFile)
      const stat = await fs.stat(outFile)
      job.localFile = outFile
      console.log(`  ⬇️  [${job.id}] ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
    } catch (e) {
      console.log(`  ❌ [${job.id}] 다운로드 실패: ${e.message}`)
    }
  }

  await fs.writeFile(path.join(OUT_DIR, '_summary.json'), JSON.stringify(jobs, null, 2), 'utf8')
  console.log(`\n=== 결과 요약 ===`)
  for (const j of jobs) {
    console.log(`  ${j.id} (${j.mode || '-'}): ${j.status}${j.duration ? ` · ${j.duration}s` : ''}${j.error ? ` — ${j.error}` : ''}`)
  }
  console.log(`\n완료. ${OUT_DIR}`)
}

await main()

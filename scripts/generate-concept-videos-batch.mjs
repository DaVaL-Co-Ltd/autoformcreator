// 숏폼 컨셉 여러 개를 일괄 생성한다:
//   HeyGen 렌더 → 자막 번인(ffmpeg) → Supabase Storage 업로드 → extractions 테이블 저장.
// 자막 번인은 server/index.js 의 /api/subtitle/burn 로직을 그대로 복제했다.
// Gemini 배경 합성은 사용하지 않는다 (아바타 자체 배경 / 컨셉 단색만).
//
// 사용: node scripts/generate-concept-videos-batch.mjs [conceptId ...]
//   인자 없으면 기본 6개(briefing_dongwan godsaeng_routine pet_dictionary study_dialogue parent_mental_care mock_interview)

import fs from 'node:fs/promises'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'output')
const FONTS_DIR = path.join(ROOT, 'server', 'fonts')

// @ffmpeg-installer/ffmpeg 는 server/node_modules 에 있으므로 server 기준으로 resolve.
const serverRequire = createRequire(path.join(ROOT, 'server', 'index.js'))
const ffmpegPath = serverRequire('@ffmpeg-installer/ffmpeg').path

// ---- env 로딩 (server/.env → .env.local → client/.env.local) ----
async function loadDotenv(envPath) {
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!(k in process.env)) process.env[k] = v
    }
  } catch (err) { if (err.code !== 'ENOENT') throw err }
}
await loadDotenv(path.join(ROOT, 'server', '.env'))
await loadDotenv(path.join(ROOT, '.env.local'))
await loadDotenv(path.join(ROOT, 'client', '.env.local'))

const HEYGEN_API_KEY = (process.env.HEYGEN_API_KEY || process.env.VITE_HEYGEN_API_KEY || '').trim()
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const VIDEOS_BUCKET = 'extraction-videos'
if (!HEYGEN_API_KEY) { console.error('HEYGEN_API_KEY / VITE_HEYGEN_API_KEY 없음'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1) }

const DEFAULT_CONCEPTS = ['briefing_dongwan', 'godsaeng_routine', 'pet_dictionary', 'study_dialogue', 'parent_mental_care', 'mock_interview']
// --avatar-iv: HeyGen Avatar IV 모델 사용 (립싱크·표정 더 자연스러움, 표준 엔드포인트 컨셉에만 적용).
const ARGS = process.argv.slice(2).filter(Boolean)
const USE_AVATAR_IV = ARGS.includes('--avatar-iv')
const CONCEPT_ARGS = ARGS.filter((a) => !a.startsWith('--'))
const CONCEPT_IDS = CONCEPT_ARGS.length ? CONCEPT_ARGS : DEFAULT_CONCEPTS

// 컨셉별 해시태그 (대략)
const CONCEPT_HASHTAGS = {
  briefing_dongwan: ['#Shorts', '#입시', '#입시정보', '#수능', '#N수생', '#대학입시', '#고등학생', '#입시전략'],
  godsaeng_routine: ['#Shorts', '#갓생', '#공부자극', '#공부루틴', '#스터디', '#study', '#고등학생', '#집중력'],
  pet_dictionary: ['#Shorts', '#입시용어', '#수시', '#입시', '#고등학생', '#입시정보', '#대학입시', '#공부'],
  study_dialogue: ['#Shorts', '#공부법', '#공부스타일', '#스터디', '#고등학생', '#공부자극', '#study', '#학습법'],
  parent_mental_care: ['#Shorts', '#학부모', '#수능', '#입시맘', '#자녀교육', '#입시', '#멘탈관리', '#고3'],
  mock_interview: ['#Shorts', '#면접', '#대입면접', '#학종', '#입시', '#면접준비', '#고등학생', '#자기소개'],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- client/src/utils 모듈 import (상대 import 확장자 보정) ----
async function importModules() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-concept-batch')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygen = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  let conceptsSrc = await fs.readFile(path.join(srcDir, 'shortsVideoConcepts.js'), 'utf8')
  conceptsSrc = conceptsSrc.replace(/from\s+(['"])\.\/heygenAvatars\1/g, "from './heygenAvatars.js'")
  const agent = await fs.readFile(path.join(srcDir, 'shortsVideoAgent.js'), 'utf8')
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygen, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoConcepts.js'), conceptsSrc, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoAgent.js'), agent, 'utf8')
  const concepts = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href)
  const avatars = await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
  const agentMod = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoAgent.js')).href)
  return { concepts, avatars, agentMod }
}

const { concepts: conceptsMod, avatars: avatarsMod, agentMod } = await importModules()
const { findShortsVideoConcept, buildShortsConceptExtra } = conceptsMod
const { HEYGEN_AVATAR_LIST } = avatarsMod
const { buildShortsVideoAgentPrompt } = agentMod
const avatarMeta = (id) => HEYGEN_AVATAR_LIST.find((a) => a.avatarId === id) || null

// 등록 아바타에 avatarGroupId 가 있으면 그룹 안 룩 중 랜덤 1개를 반환. 그 외엔 그대로.
const avatarGroupCache = new Map()
async function resolveAvatarGroupLook(avatarId) {
  if (!avatarId) return avatarId
  const entry = HEYGEN_AVATAR_LIST.find((a) => a.avatarId === avatarId)
  if (!entry?.avatarGroupId) return avatarId
  try {
    let looks = avatarGroupCache.get(entry.avatarGroupId)
    if (!looks) {
      const r = await fetch(`https://api.heygen.com/v2/avatar_group/${entry.avatarGroupId}/avatars`, {
        headers: { 'X-Api-Key': HEYGEN_API_KEY },
      })
      const d = await r.json().catch(() => ({}))
      const raw = d?.data?.avatar_list || d?.data?.avatars || (Array.isArray(d?.data) ? d.data : [])
      looks = (Array.isArray(raw) ? raw : [])
        .map((l) => l.id || l.avatar_id || l.talking_photo_id || l.image_key)
        .filter(Boolean)
      avatarGroupCache.set(entry.avatarGroupId, looks)
    }
    if (!looks.length) return avatarId
    const picked = looks[Math.floor(Math.random() * looks.length)]
    if (picked !== avatarId) console.log(`  avatar group 랜덤 룩: ${avatarId} → ${picked}`)
    return picked
  } catch {
    return avatarId
  }
}

// ---- 표준 엔드포인트 video_inputs 빌드 (배경 합성 없음) ----
function buildStandardInputs(concept, script) {
  const baseAvatarId = concept.preferredAvatarIds[0]
  const isMulti = concept.preferredAvatarIds.length > 1
  const hasSceneAvatars = !isMulti && Array.isArray(concept.sceneAvatarIds) && concept.sceneAvatarIds.length > 0
  const randomVariant = hasSceneAvatars && concept.randomVariantPerVideo === true

  let avatarIds
  if (isMulti) {
    avatarIds = concept.preferredAvatarIds
  } else if (randomVariant) {
    const picked = concept.sceneAvatarIds[Math.floor(Math.random() * concept.sceneAvatarIds.length)]
    avatarIds = [picked]
    console.log(`  randomVariantPerVideo → variant ${picked}`)
  } else if (hasSceneAvatars) {
    avatarIds = concept.sceneAvatarIds
  } else {
    avatarIds = [baseAvatarId]
  }

  const baseVoiceId = avatarMeta(baseAvatarId)?.defaultVoiceId

  // 솔로 컨셉(한 아바타가 전 씬 동일)은 나레이션을 모두 이어붙여 video_input 1개로 만든다
  // → HeyGen 이 끊김 없는 연속 테이크로 렌더(씬 전환 컷 제거). 자막은 이후 씬별로 번인.
  const canMergeSoloTake = !isMulti
    && avatarIds.length === 1
    && script.scenes.every((s) => !s?.avatarId
      && s?.layout !== 'quiz-countdown'
      && s?.layout !== 'infographic-full')
  if (canMergeSoloTake) {
    const avatarId = avatarIds[0]
    const voiceId = avatarMeta(avatarId)?.defaultVoiceId || baseVoiceId
    const mergedText = script.scenes
      .map((s) => String(s?.narration || '').trim())
      .filter(Boolean)
      .join(' ')
    const input = {
      character: { type: 'talking_photo', talking_photo_id: avatarId },
      voice: { type: 'text', input_text: mergedText, voice_id: voiceId },
    }
    if (concept.backgroundColor) input.background = { type: 'color', value: concept.backgroundColor }
    console.log(`  솔로 연속 테이크 — 씬 ${script.scenes.length}개 → video_input 1개 병합`)
    return (input.voice.input_text && input.voice.voice_id) ? [input] : []
  }

  const inputs = []
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]
    const avatarId = scene?.avatarId || avatarIds[i % avatarIds.length]
    const voiceId = avatarMeta(avatarId)?.defaultVoiceId || baseVoiceId
    const isCountdown = scene?.layout === 'quiz-countdown'
    const input = {
      character: { type: 'talking_photo', talking_photo_id: avatarId },
      voice: isCountdown
        ? { type: 'silence', duration: Number(scene?.duration) || 3 }
        : { type: 'text', input_text: String(scene?.narration || '').trim(), voice_id: voiceId },
    }
    if (concept.backgroundColor) input.background = { type: 'color', value: concept.backgroundColor }
    inputs.push(input)
  }
  return inputs.filter((i) =>
    i.voice?.type === 'silence' ? Number(i.voice.duration) > 0 : (i.voice?.input_text && i.voice?.voice_id))
}

// ---- HeyGen ----
async function heygenGenerateStandard(concept, script) {
  const videoInputs = buildStandardInputs(concept, script)
  if (!videoInputs.length) throw new Error('video_inputs 비어있음')
  const body = { video_inputs: videoInputs, dimension: { width: 720, height: 1280 } }
  if (USE_AVATAR_IV) body.use_avatar_iv_model = true
  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`generate ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return data?.data?.video_id || data?.video_id
}

async function heygenGenerateVideoAgent(concept, script) {
  const baseAvatarId = concept.preferredAvatarIds[0]
  const meta = avatarMeta(baseAvatarId)
  // avatar group 이 있으면 그룹 안 룩 중 랜덤 1개 사용 (name 은 원래 아바타 기준 유지).
  const resolvedAvatarId = await resolveAvatarGroupLook(baseAvatarId)
  const prompt = buildShortsVideoAgentPrompt({
    script,
    avatar: { id: resolvedAvatarId, kind: 'talking_photo', name: meta?.name || 'avatar' },
    extraPrompt: buildShortsConceptExtra(concept.id),
  })
  const res = await fetch('https://api.heygen.com/v1/video_agent/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, config: { avatar_id: resolvedAvatarId } }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`video_agent ${res.status}: ${JSON.stringify(data).slice(0, 400)}`)
  return data?.data?.video_id || data?.data?.id || data?.video_id || data?.id
}

async function heygenPoll(videoId) {
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`status ${res.status}`)
  return data?.data || {}
}

// ---- 자막 번인 (server/index.js /api/subtitle/burn 복제) ----
function splitNarration(text, maxCharsPerLine = 18) {
  const chunks = []
  let remaining = String(text || '').trim()
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) { chunks.push(remaining); break }
    let cut = -1
    for (let i = Math.min(maxCharsPerLine, remaining.length) - 1; i >= Math.floor(maxCharsPerLine * 0.5); i--) {
      if (/[.!?。！？、，,\s]/.test(remaining[i])) { cut = i + 1; break }
    }
    if (cut === -1) cut = maxCharsPerLine
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  return chunks
}

const subtitleFontConfigs = {
  default: { fontName: 'Pretendard Variable', fontSize: 10, marginV: 20, bold: 0, italic: 0, spacing: 0 },
  bold: { fontName: 'A2z', fontSize: 10.8, marginV: 20, bold: -1, italic: 0, spacing: 0.2 },
  dongle: { fontName: 'TmoneyRoundWind', fontSize: 11.2, marginV: 18, bold: 0, italic: 0, spacing: 0 },
  handwriting: { fontName: 'Maplestory', fontSize: 10.4, marginV: 20, bold: 0, italic: 0, spacing: 0.05 },
  gothic: { fontName: 'KBODiaGothic', fontSize: 10.2, marginV: 20, bold: 0, italic: 0, spacing: 0.35 },
}
const getSubtitleFontConfig = (k) => subtitleFontConfigs[k] || subtitleFontConfigs.default
function getForceStyle(style, fontKey = 'default') {
  const font = getSubtitleFontConfig(fontKey)
  const base = [
    `FontName=${font.fontName}`, `FontSize=${font.fontSize}`, 'Alignment=2',
    `MarginV=${font.marginV}`, `Bold=${font.bold}`, `Italic=${font.italic}`, `Spacing=${font.spacing}`,
  ].join(',')
  const styles = {
    classic: `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,BorderStyle=3,BackColour=&HB0000000,Shadow=0`,
    classic2: `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=0.8,BorderStyle=1,Shadow=0`,
  }
  return styles[style] || styles.classic
}

function measureDuration(inputPath, fallback) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-i', inputPath], { timeout: 10000 }, (err, stdout, stderr) => {
      const m = (stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
      if (m) resolve(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100)
      else resolve(fallback)
    })
  })
}

function buildSrt(scenes, duration) {
  const maxCharsPerLine = 16
  const totalChars = scenes.reduce((sum, s) => sum + (s.narration || '').length, 0) || 1
  const fmt = (t) => {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60)
    const s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }
  let srt = ''
  let idx = 1
  let currentTime = 0
  for (const scene of scenes) {
    const narration = String(scene.narration || '')
    if (!narration.trim()) continue
    const sceneDur = (narration.length / totalChars) * duration
    const lines = splitNarration(narration, maxCharsPerLine)
    const blocks = []
    const linesPerBlock = lines.length === 3 ? 3 : 2
    for (let j = 0; j < lines.length; j += linesPerBlock) blocks.push(lines.slice(j, j + linesPerBlock).join('\n'))
    const blockChars = blocks.map((b) => b.replace(/\n/g, '').length)
    const blockTotalChars = blockChars.reduce((s, c) => s + c, 0) || 1
    for (let b = 0; b < blocks.length; b++) {
      const blockDur = (blockChars[b] / blockTotalChars) * sceneDur
      srt += `${idx++}\n${fmt(currentTime)} --> ${fmt(currentTime + blockDur)}\n${blocks[b]}\n\n`
      currentTime += blockDur
    }
  }
  return srt
}

async function burnSubtitles(inputPath, scenes, outputPath, ts) {
  const fallback = scenes.reduce((s, sc) => s + (Number(sc.duration) || 5), 0)
  const duration = await measureDuration(inputPath, fallback)
  const srtPath = path.join(OUT_DIR, `subtitle_${ts}.srt`)
  writeFileSync(srtPath, buildSrt(scenes, duration), 'utf8')

  const srtEsc = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
  const fontsEsc = FONTS_DIR.replace(/\\/g, '/').replace(/:/g, '\\:')
  const forceStyle = getForceStyle('classic', 'default')

  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-i', inputPath,
      '-vf', `subtitles='${srtEsc}':fontsdir='${fontsEsc}':force_style='${forceStyle}'`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2',
      '-c:a', 'copy', '-y', outputPath,
    ], { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`FFmpeg: ${err.message}\n${(stderr || '').slice(-400)}`))
      else resolve()
    })
  })
  return { srtPath, duration }
}

// ---- Supabase ----
async function uploadToStorage(buffer, objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${VIDEOS_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY,
      'Content-Type': 'video/mp4', 'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) throw new Error(`Storage ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return `${SUPABASE_URL}/storage/v1/object/public/${VIDEOS_BUCKET}/${objectPath}`
}

async function insertExtraction(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/extractions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`insert ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return Array.isArray(data) ? data[0] : data
}

// ---- main ----
async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  console.log(`대상 컨셉 ${CONCEPT_IDS.length}개: ${CONCEPT_IDS.join(', ')}`)
  console.log(`엔진: ${USE_AVATAR_IV ? 'HeyGen Avatar IV (use_avatar_iv_model)' : '표준 토킹포토'}\n`)

  // Phase 1: HeyGen 생성 요청
  const jobs = []
  for (const id of CONCEPT_IDS) {
    const concept = findShortsVideoConcept(id)
    if (!concept?.testScript?.scenes?.length) { console.error(`[${id}] 컨셉/testScript 없음 — 건너뜀`); continue }
    const script = concept.testScript
    const useStandard = concept.preferredAvatarIds.length > 1 || concept.useStandardEndpoint === true
    try {
      console.log(`[${id}] ${concept.label} — ${useStandard ? '표준' : 'Video Agent'} (씬 ${script.scenes.length}개)`)
      const videoId = useStandard
        ? await heygenGenerateStandard(concept, script)
        : await heygenGenerateVideoAgent(concept, script)
      if (!videoId) throw new Error('video_id 없음')
      console.log(`  video_id: ${videoId}\n`)
      jobs.push({ id, concept, script, videoId, status: 'pending', startedAt: Date.now() })
    } catch (e) {
      console.error(`  생성 실패: ${e.message}\n`)
      jobs.push({ id, status: 'create_failed', error: e.message })
    }
  }

  // Phase 2: 폴링
  const pending = jobs.filter((j) => j.videoId)
  if (pending.length) {
    console.log(`폴링 시작 (20초 간격, 최대 20분)\n`)
    const maxWait = 20 * 60 * 1000
    while (pending.some((j) => j.status === 'pending')) {
      await sleep(20000)
      for (const job of pending.filter((j) => j.status === 'pending')) {
        try {
          const st = await heygenPoll(job.videoId)
          const el = ((Date.now() - job.startedAt) / 1000).toFixed(0)
          if (st.status === 'completed') {
            job.status = 'rendered'; job.videoUrl = st.video_url
            console.log(`  ✅ [${job.id}] 렌더 완료 (${el}s)`)
          } else if (st.status === 'failed') {
            job.status = 'render_failed'; job.error = st.error?.message || JSON.stringify(st.error)
            console.log(`  ❌ [${job.id}] 렌더 실패: ${job.error}`)
          } else if (Date.now() - job.startedAt > maxWait) {
            job.status = 'timeout'
            console.log(`  ⏰ [${job.id}] 타임아웃`)
          } else {
            console.log(`  ⏳ [${job.id}] ${st.status} (${el}s)`)
          }
        } catch (e) {
          console.log(`  ⚠️ [${job.id}] 폴링 에러: ${e.message}`)
        }
      }
    }
  }

  // Phase 3: 자막 번인 → 업로드 → DB 저장 (순차)
  console.log('\n자막 번인 + 업로드 + DB 저장\n')
  for (const job of jobs.filter((j) => j.status === 'rendered')) {
    const { id, concept, script, videoUrl } = job
    try {
      const ts = Date.now()
      console.log(`[${id}] 처리 중...`)
      // 원본 다운로드
      const dl = await fetch(videoUrl)
      if (!dl.ok) throw new Error(`다운로드 ${dl.status}`)
      const rawPath = path.join(OUT_DIR, `heygen_raw_${id}_${ts}.mp4`)
      writeFileSync(rawPath, Buffer.from(await dl.arrayBuffer()))

      // 자막 번인
      const finalPath = path.join(OUT_DIR, `concept_${id}_${ts}.mp4`)
      const { srtPath, duration } = await burnSubtitles(rawPath, script.scenes, finalPath, ts)
      const finalBuf = await fs.readFile(finalPath)
      console.log(`  자막 번인 완료 (${duration.toFixed(1)}s, ${(finalBuf.length / 1024 / 1024).toFixed(1)}MB)`)

      // Supabase 업로드
      const publicUrl = await uploadToStorage(finalBuf, `shorts_${id}_${ts}.mp4`)

      // DB 저장
      const shortsScript = {
        ...script,
        uploadTitle: (script.title.includes('#Shorts') ? script.title : `${script.title} #Shorts`).slice(0, 100),
        uploadDescription: [script.hook, ...script.scenes.map((s) => s.narration).filter(Boolean), script.cta]
          .filter(Boolean).join('\n'),
        hashtags: CONCEPT_HASHTAGS[id] || ['#Shorts'],
      }
      const inserted = await insertExtraction({
        file_name: `숏폼 컨셉 테스트 - ${concept.label}`,
        summary: null, blog_content: null, newsletter_content: null, instagram_content: null,
        shorts_script: shortsScript,
        blog_images: null, instagram_images: null,
        shorts_video: { url: publicUrl, videoUrl: publicUrl, combinedVideoUrl: publicUrl, heygenVideoId: job.videoId, subtitleStatus: 'done' },
        upload_status: {},
        parsed_text: null,
      })
      job.status = 'saved'
      job.extractionId = inserted?.id
      job.publicUrl = publicUrl
      console.log(`  ✅ DB 저장 — extraction id: ${inserted?.id}\n`)
      // 임시 파일 정리 (자막 입힌 최종본은 output/ 에 남김)
      try { await fs.unlink(rawPath) } catch {}
      try { await fs.unlink(srtPath) } catch {}
    } catch (e) {
      job.status = 'save_failed'
      job.error = e.message
      console.error(`  ❌ [${id}] 실패: ${e.message}\n`)
    }
  }

  // tmp 정리
  try { await fs.rm(path.join(ROOT, '.tmp-concept-batch'), { recursive: true, force: true }) } catch {}

  // 요약
  console.log('=== 결과 요약 ===')
  for (const j of jobs) {
    if (j.status === 'saved') console.log(`  ✅ ${j.id} — extraction ${j.extractionId}`)
    else console.log(`  ❌ ${j.id} — ${j.status}${j.error ? ` (${j.error})` : ''}`)
  }
  const ok = jobs.filter((j) => j.status === 'saved')
  console.log(`\n완료: ${ok.length}/${jobs.length}개 DB 저장`)
}

main().catch((err) => { console.error('\n치명적 오류:', err.message); process.exit(1) })

// 숏폼 컨셉 1개의 내장 testScript 로 HeyGen 영상을 생성하고,
// Supabase Storage 업로드 + extractions 테이블 저장까지 한 번에 수행한다.
// (Gemini 배경 합성은 제거됨 — 아바타 자체 배경만 사용)
//
// 사용: node scripts/generate-concept-video-to-db.mjs [conceptId]
//   conceptId 생략 시 dongwan_secret.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'output')

// ---- env 로딩 (server/.env, .env.local, client/.env.local 순) ----
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
await loadDotenv(path.join(ROOT, 'client', '.env.local'))

const HEYGEN_API_KEY = (process.env.HEYGEN_API_KEY || process.env.VITE_HEYGEN_API_KEY || '').trim()
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const VIDEOS_BUCKET = 'extraction-videos'

if (!HEYGEN_API_KEY) { console.error('HEYGEN_API_KEY / VITE_HEYGEN_API_KEY 없음'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1) }

const CONCEPT_ID = process.argv[2] || 'dongwan_secret'

// ---- client/src/utils 모듈을 Node 에서 import (상대 import 확장자 보정) ----
async function importModules() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-concept-video')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygenSource = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  let conceptsSource = await fs.readFile(path.join(srcDir, 'shortsVideoConcepts.js'), 'utf8')
  conceptsSource = conceptsSource.replace(/from\s+(['"])\.\/heygenAvatars\1/g, "from './heygenAvatars.js'")
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygenSource, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoConcepts.js'), conceptsSource, 'utf8')
  const concepts = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href)
  const avatars = await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
  return { concepts, avatars }
}

const { concepts: conceptsMod, avatars: avatarsMod } = await importModules()
const { findShortsVideoConcept } = conceptsMod
const { HEYGEN_AVATAR_LIST } = avatarsMod

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const avatarMeta = (id) => HEYGEN_AVATAR_LIST.find((a) => a.avatarId === id) || null

// ---- 표준 엔드포인트 video_inputs 빌드 (배경 합성 없음) ----
function buildStandardInputs(concept, script) {
  const baseAvatarId = concept.preferredAvatarIds[0]
  const hasSceneAvatars = concept.preferredAvatarIds.length === 1
    && Array.isArray(concept.sceneAvatarIds) && concept.sceneAvatarIds.length > 0
  const randomVariant = hasSceneAvatars && concept.randomVariantPerVideo === true

  let avatarIds
  if (concept.preferredAvatarIds.length > 1) {
    avatarIds = concept.preferredAvatarIds
  } else if (randomVariant) {
    const picked = concept.sceneAvatarIds[Math.floor(Math.random() * concept.sceneAvatarIds.length)]
    avatarIds = [picked]
    console.log(`  randomVariantPerVideo → variant ${picked} (전 씬 동일)`)
  } else if (hasSceneAvatars) {
    avatarIds = concept.sceneAvatarIds
  } else {
    avatarIds = [baseAvatarId]
  }

  const baseVoiceId = avatarMeta(baseAvatarId)?.defaultVoiceId
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
    // 배경: 컨셉이 backgroundColor 를 지정한 경우에만 단색. 그 외엔 아바타 자체 배경.
    if (concept.backgroundColor) {
      input.background = { type: 'color', value: concept.backgroundColor }
    }
    inputs.push(input)
  }
  return inputs.filter((i) =>
    i.voice?.type === 'silence' ? Number(i.voice.duration) > 0 : (i.voice?.input_text && i.voice?.voice_id))
}

async function heygenGenerate(videoInputs) {
  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_inputs: videoInputs, dimension: { width: 720, height: 1280 } }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`HeyGen generate ${res.status}: ${JSON.stringify(data).slice(0, 400)}`)
  return data?.data?.video_id || data?.video_id
}

async function heygenPoll(videoId) {
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`HeyGen status ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  return data?.data || {}
}

async function uploadToSupabaseStorage(buffer, objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${VIDEOS_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
      'Content-Type': 'video/mp4',
      'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Storage upload ${res.status}: ${txt.slice(0, 300)}`)
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${VIDEOS_BUCKET}/${objectPath}`
}

async function insertExtraction(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/extractions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`extractions insert ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return Array.isArray(data) ? data[0] : data
}

async function main() {
  const concept = findShortsVideoConcept(CONCEPT_ID)
  if (!concept) { console.error(`컨셉 정의 없음: ${CONCEPT_ID}`); process.exit(1) }
  const script = concept.testScript
  if (!script?.scenes?.length) { console.error(`testScript 없음: ${CONCEPT_ID}`); process.exit(1) }
  console.log(`[${CONCEPT_ID}] ${concept.label} — 씬 ${script.scenes.length}개`)

  // 1) HeyGen 영상 생성
  const videoInputs = buildStandardInputs(concept, script)
  if (!videoInputs.length) throw new Error('video_inputs 가 비어있음')
  console.log('HeyGen 영상 생성 요청...')
  const videoId = await heygenGenerate(videoInputs)
  if (!videoId) throw new Error('video_id 를 받지 못함')
  console.log(`  video_id: ${videoId}`)

  // 2) 폴링 (20초 간격, 최대 15분)
  const startedAt = Date.now()
  let videoUrl = null
  while (Date.now() - startedAt < 15 * 60 * 1000) {
    await sleep(20000)
    const st = await heygenPoll(videoId)
    const el = ((Date.now() - startedAt) / 1000).toFixed(0)
    if (st.status === 'completed') {
      videoUrl = st.video_url
      console.log(`  ✅ 완료 (${el}s)${st.duration ? ` · ${st.duration}s` : ''}`)
      break
    }
    if (st.status === 'failed') {
      throw new Error(`HeyGen 렌더 실패: ${st.error?.message || JSON.stringify(st.error)}`)
    }
    console.log(`  ⏳ ${st.status} (${el}s)`)
  }
  if (!videoUrl) throw new Error('렌더 타임아웃 (15분)')

  // 3) mp4 다운로드
  console.log('mp4 다운로드...')
  const dlRes = await fetch(videoUrl)
  if (!dlRes.ok) throw new Error(`다운로드 실패 ${dlRes.status}`)
  const buffer = Buffer.from(await dlRes.arrayBuffer())
  await fs.mkdir(OUT_DIR, { recursive: true })
  const ts = Date.now()
  const localPath = path.join(OUT_DIR, `concept_${CONCEPT_ID}_${ts}.mp4`)
  await fs.writeFile(localPath, buffer)
  console.log(`  로컬 저장: ${localPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`)

  // 4) Supabase Storage 업로드
  console.log('Supabase Storage 업로드...')
  const objectPath = `shorts_${CONCEPT_ID}_${ts}.mp4`
  const publicUrl = await uploadToSupabaseStorage(buffer, objectPath)
  console.log(`  public URL: ${publicUrl}`)

  // 5) extractions 행 저장 (제목/설명/태그 포함)
  console.log('extractions 테이블 저장...')
  const shortsScript = {
    ...script,
    uploadTitle: `${script.title} #Shorts`.slice(0, 100),
    uploadDescription: [
      script.hook,
      ...script.scenes.map((s) => s.narration).filter(Boolean),
      script.cta,
    ].filter(Boolean).join('\n'),
    hashtags: ['#Shorts', '#수행평가', '#학생부', '#입시', '#고등학생', '#공부법', '#내신', '#세특'],
  }
  const row = {
    file_name: `숏폼 컨셉 테스트 - ${concept.label}`,
    summary: null,
    blog_content: null,
    newsletter_content: null,
    instagram_content: null,
    shorts_script: shortsScript,
    blog_images: null,
    instagram_images: null,
    shorts_video: { url: publicUrl, videoUrl: publicUrl, combinedVideoUrl: publicUrl, heygenVideoId: videoId },
    upload_status: {},
    parsed_text: null,
  }
  const inserted = await insertExtraction(row)
  console.log(`  ✅ extractions 저장 완료 — id: ${inserted?.id}`)
  console.log('\n=== 완료 ===')
  console.log(`extraction id : ${inserted?.id}`)
  console.log(`video URL     : ${publicUrl}`)
  console.log(`제목          : ${shortsScript.uploadTitle}`)
}

main().catch((err) => {
  console.error('\n실패:', err.message)
  process.exit(1)
})

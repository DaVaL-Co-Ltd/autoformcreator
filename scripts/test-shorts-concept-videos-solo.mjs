// 솔로 컨셉 5개에 대해 HeyGen 영상을 생성한다.
// scripts/concept-script-tests/*.json (사전에 생성한 대본) 을 읽어
// /v2/video/generate 로 영상화하고, mp4 를 다운로드한다.
//
// 사용: node scripts/test-shorts-concept-videos-solo.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SCRIPTS_DIR = path.join(ROOT, 'scripts', 'concept-script-tests')
const OUT_DIR = path.join(ROOT, 'scripts', 'concept-video-tests')

const SOLO_CONCEPT_IDS = [
  'briefing_dongwan',
  'dongwan_secret',
  'godsaeng_routine',
  'pet_dictionary',
  'parent_mental_care',
]

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
if (!HEYGEN_API_KEY) {
  console.error('HEYGEN_API_KEY 가 server/.env 에 없음')
  process.exit(1)
}

// shortsVideoConcepts.js 에서 컨셉 + 아바타 정보 가져오기 (이전 스크립트와 동일한 우회).
async function importConceptsModule() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-concept-test')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygenSource = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  let conceptsSource = await fs.readFile(path.join(srcDir, 'shortsVideoConcepts.js'), 'utf8')
  conceptsSource = conceptsSource.replace(
    /from\s+(['"])\.\/heygenAvatars\1/g,
    "from './heygenAvatars.js'",
  )
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygenSource, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoConcepts.js'), conceptsSource, 'utf8')
  const conceptsMod = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href)
  const avatarsMod = await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
  return { ...conceptsMod, ...avatarsMod }
}

const { SHORTS_VIDEO_CONCEPTS, findShortsVideoConcept, HEYGEN_AVATAR_LIST } = await importConceptsModule()

function avatarMetaByAvatarId(avatarId) {
  return HEYGEN_AVATAR_LIST.find((a) => a.avatarId === avatarId) || null
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function loadScript(conceptId) {
  const filePath = path.join(SCRIPTS_DIR, `${conceptId}.json`)
  const raw = await fs.readFile(filePath, 'utf8')
  const data = JSON.parse(raw)
  if (!data?.parsed?.scenes?.length) {
    throw new Error(`${conceptId}: parsed.scenes 비어있음`)
  }
  return data.parsed
}

function buildVideoInputs(script, avatarId, voiceId) {
  const inputs = []
  for (const scene of script.scenes || []) {
    const narration = String(scene?.narration || '').trim()
    if (!narration || !voiceId) continue
    inputs.push({
      character: {
        type: 'avatar',
        avatar_id: avatarId,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: narration,
        voice_id: voiceId,
      },
    })
  }
  return inputs
}

async function createVideo({ conceptId, label, avatarId, voiceId, script }) {
  const video_inputs = buildVideoInputs(script, avatarId, voiceId)
  if (!video_inputs.length) {
    throw new Error(`${conceptId}: video_inputs 비어있음`)
  }
  const body = {
    video_inputs,
    dimension: { width: 720, height: 1280 },
  }
  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`HeyGen generate ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  }
  const videoId = data?.data?.video_id || data?.video_id
  if (!videoId) {
    throw new Error(`HeyGen generate 응답에 video_id 없음: ${JSON.stringify(data).slice(0, 300)}`)
  }
  return { conceptId, label, videoId, sceneCount: video_inputs.length }
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  await ensureDir(OUT_DIR)
  console.log(`출력 폴더: ${OUT_DIR}`)
  console.log(`솔로 컨셉 ${SOLO_CONCEPT_IDS.length}개 영상 생성 시작`)

  // 1단계: 5개 생성 요청 병렬 발사
  const jobs = []
  for (const conceptId of SOLO_CONCEPT_IDS) {
    const concept = findShortsVideoConcept(conceptId)
    if (!concept) {
      console.error(`[${conceptId}] 컨셉 정의 없음, 건너뜀`)
      continue
    }
    const avatarId = concept.preferredAvatarIds?.[0]
    const meta = avatarMetaByAvatarId(avatarId)
    if (!avatarId || !meta) {
      console.error(`[${conceptId}] avatar 메타 없음, 건너뜀`)
      continue
    }
    const voiceId = meta.defaultVoiceId
    try {
      const script = await loadScript(conceptId)
      console.log(`\n[${conceptId}] ${concept.label}`)
      console.log(`  avatar: ${meta.name} (${avatarId})`)
      console.log(`  voice: ${voiceId}`)
      console.log(`  씬 수: ${script.scenes.length}`)
      const job = await createVideo({
        conceptId,
        label: concept.label,
        avatarId,
        voiceId,
        script,
      })
      console.log(`  video_id: ${job.videoId}`)
      jobs.push({ ...job, status: 'pending', startedAt: Date.now() })
    } catch (err) {
      console.error(`  실패: ${err.message}`)
      jobs.push({ conceptId, label: concept.label, videoId: null, status: 'create_failed', error: err.message })
    }
  }

  if (jobs.every((j) => !j.videoId)) {
    console.error('\n모든 생성 요청 실패. 종료.')
    return
  }

  // 2단계: 폴링 (30초 간격, 최대 15분 / 작업)
  const maxWaitMs = 15 * 60 * 1000
  const pollInterval = 30 * 1000
  console.log(`\n폴링 시작 (30초 간격, 최대 15분/작업)`)

  while (true) {
    const pending = jobs.filter((j) => j.videoId && j.status === 'pending')
    if (!pending.length) break
    await sleep(pollInterval)
    for (const job of pending) {
      try {
        const status = await pollStatus(job.videoId)
        const elapsed = ((Date.now() - job.startedAt) / 1000).toFixed(0)
        if (status.status === 'completed') {
          job.status = 'completed'
          job.videoUrl = status.video_url
          job.duration = status.duration
          console.log(`  ✅ [${job.conceptId}] 완료 (${elapsed}s) ${status.duration ? `${status.duration}s` : ''}`)
        } else if (status.status === 'failed') {
          job.status = 'failed'
          job.error = status.error?.message || JSON.stringify(status.error)
          console.log(`  ❌ [${job.conceptId}] 실패 (${elapsed}s): ${job.error}`)
        } else {
          console.log(`  ⏳ [${job.conceptId}] ${status.status} (${elapsed}s)`)
        }
        if (job.status === 'pending' && Date.now() - job.startedAt > maxWaitMs) {
          job.status = 'timeout'
          console.log(`  ⏰ [${job.conceptId}] 타임아웃`)
        }
      } catch (err) {
        console.log(`  ⚠️ [${job.conceptId}] 폴링 에러: ${err.message}`)
      }
    }
  }

  // 3단계: 완료된 영상 다운로드
  console.log(`\n다운로드 시작`)
  for (const job of jobs) {
    if (job.status === 'completed' && job.videoUrl) {
      const outFile = path.join(OUT_DIR, `${job.conceptId}.mp4`)
      try {
        await downloadFile(job.videoUrl, outFile)
        const stat = await fs.stat(outFile)
        console.log(`  ✅ [${job.conceptId}] ${(stat.size / 1024 / 1024).toFixed(1)} MB`)
        job.localFile = outFile
      } catch (err) {
        console.log(`  ❌ [${job.conceptId}] 다운로드 실패: ${err.message}`)
      }
    }
  }

  // 4단계: 결과 요약 저장
  const summary = jobs.map((j) => ({
    conceptId: j.conceptId,
    label: j.label,
    status: j.status,
    videoId: j.videoId,
    duration: j.duration,
    sceneCount: j.sceneCount,
    localFile: j.localFile,
    videoUrl: j.videoUrl,
    error: j.error,
  }))
  await fs.writeFile(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2), 'utf8')

  const md = [
    '# 솔로 컨셉 영상 생성 결과',
    '',
    `- 시도: ${jobs.length}개`,
    `- 완료: ${jobs.filter((j) => j.status === 'completed').length}개`,
    `- 실패: ${jobs.filter((j) => j.status !== 'completed').length}개`,
    '',
    '| 컨셉 | 상태 | 씬 수 | duration | 파일 |',
    '|------|------|-------|----------|------|',
    ...jobs.map((j) => `| ${j.label} | ${j.status} | ${j.sceneCount ?? '-'} | ${j.duration ?? '-'} | ${j.localFile ? path.basename(j.localFile) : (j.error ? `❌ ${j.error.slice(0, 60)}` : '-')} |`),
    '',
  ].join('\n')
  await fs.writeFile(path.join(OUT_DIR, '_summary.md'), md, 'utf8')

  console.log(`\n완료. ${OUT_DIR}\\_summary.md 확인`)
}

await main()

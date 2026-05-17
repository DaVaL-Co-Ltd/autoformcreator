// briefing_dongwan 을 HeyGen Video Agent 로 재생성.
// 씬 1, 6 = 동완쌤 아바타 풀화면.
// 씬 2~5 = 인포그래픽 전용 (아바타 미표시) + 보이스오버.
// HeyGen Agent 의 자연어 기반 합성에 의존.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'concept-video-tests-agent')
const SCRIPT_FILE = path.join(ROOT, 'scripts', 'concept-script-tests', 'briefing_dongwan.json')

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
  console.error('HEYGEN_API_KEY 없음')
  process.exit(1)
}

async function importAvatars() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-concept-test')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygenSource = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygenSource, 'utf8')
  return await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
}

const { HEYGEN_AVATARS } = await importAvatars()
const dongwan = HEYGEN_AVATARS.dongwan_ssaem

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

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

function buildAgentPrompt(script) {
  const scenes = script.scenes || []
  // 씬 모드 매핑: 1, 마지막 씬 = avatar / 그 외 = infographic-only.
  const lastSceneNumber = scenes[scenes.length - 1]?.sceneNumber || scenes.length
  const sceneLines = scenes.map((scene) => {
    const isAvatar = scene.sceneNumber === 1 || scene.sceneNumber === lastSceneNumber
    const info = scene.infographic
    const dataLine = info
      ? `INFOGRAPHIC DATA: headline="${info.headline}", value="${info.value}", subtitle="${info.subtitle}", chartType=${info.chartType}.`
      : ''
    const overlay = scene.textOverlay ? `On-screen keyword text: "${scene.textOverlay}".` : ''
    if (isAvatar) {
      return [
        `- Scene ${scene.sceneNumber} (${scene.duration} seconds, AVATAR SHOT):`,
        `    Narration (Korean, spoken by the avatar): "${scene.narration}"`,
        `    Layout: Show only the avatar Dongwan teacher full-screen in a clean warm beige studio backdrop with soft natural lighting.`,
        `    ${overlay}`,
        `    Do NOT show charts, data cards, or infographic graphics in this scene.`,
      ].filter(Boolean).join('\n')
    }
    return [
      `- Scene ${scene.sceneNumber} (${scene.duration} seconds, INFOGRAPHIC-ONLY, no avatar visible):`,
      `    Voice-over narration (Korean, off-screen narrator): "${scene.narration}"`,
      `    Layout: Full-screen data infographic. The avatar must NOT appear in this scene at all.`,
      `    ${dataLine}`,
      `    Render a clean, minimal infographic frame with the headline at the top, the big value in the center, a ${info?.chartType || 'bar'} chart visualization, and a short subtitle line.`,
      `    Use a LOW-SATURATION muted palette: warm beige or soft warm gray background (#F5EFE6, #EAE3D5, #E8E4DD, or similar), dark charcoal or warm brown text (#3A322A), and a single muted accent color (terracotta, warm olive, dusty gold — NO bright blue, NO saturated colors).`,
      `    The background must be visually quiet and easy on the eyes — like a high-end editorial print page, not a flashy slide.`,
      `    Do NOT use bright navy, royal blue, neon, or any vivid saturated tones.`,
      `    ${overlay}`,
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  return [
    'Create a polished vertical 9:16 Korean YouTube Shorts video for an education channel.',
    `Target total duration: about ${script.duration || 30} seconds.`,
    'The video has exactly 6 scenes alternating between AVATAR SHOT and INFOGRAPHIC-ONLY scenes.',
    'Follow this scene plan EXACTLY. Do not merge, reorder, or add scenes.',
    '',
    `Avatar to use: HeyGen Person Avatar "동완쌤 (Dongwan teacher)" — appears ONLY in AVATAR scenes.`,
    'In INFOGRAPHIC-ONLY scenes, the avatar must be completely hidden — replace the frame with a full-screen data card / chart visualization.',
    'Voice consistency: keep the same single narrator voice across the entire video.',
    'Include burned-in Korean subtitles at the bottom of every scene.',
    'Reserve the bottom 25% of the frame for subtitles only.',
    'Never let subtitles overlap the avatar face or the infographic data card.',
    '',
    `Video title reference: ${script.title}`,
    `Opening hook: ${script.hook}`,
    '',
    'SCENE PLAN:',
    sceneLines,
    '',
    `Closing CTA: ${script.cta}`,
    '',
    'Render this as a finished short with consistent palette and clean Korean typography.',
  ].join('\n')
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const rawScript = JSON.parse(await fs.readFile(SCRIPT_FILE, 'utf8'))
  const script = rawScript.parsed
  console.log(`대본: ${script.title}`)
  console.log(`씬 수: ${script.scenes.length}`)
  console.log(`아바타: ${dongwan.name} (${dongwan.avatarId})`)

  const prompt = buildAgentPrompt(script)
  await fs.writeFile(path.join(OUT_DIR, '_prompt.txt'), prompt, 'utf8')
  console.log(`\n=== Video Agent 프롬프트 (${prompt.length}자) ===`)
  console.log(prompt)
  console.log(`\n=== 프롬프트 끝 ===\n`)

  const body = {
    prompt,
    config: { avatar_id: dongwan.avatarId },
  }
  console.log('HeyGen Video Agent 영상 생성 요청...')
  const res = await fetch('https://api.heygen.com/v1/video_agent/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`생성 실패 (${res.status}):`, JSON.stringify(data).slice(0, 800))
    await fs.writeFile(path.join(OUT_DIR, '_error.json'), JSON.stringify(data, null, 2), 'utf8')
    process.exit(1)
  }
  const videoId = data?.data?.video_id || data?.data?.id || data?.video_id || data?.id
  console.log(`video_id: ${videoId}`)
  await fs.writeFile(path.join(OUT_DIR, '_response.json'), JSON.stringify(data, null, 2), 'utf8')

  const startedAt = Date.now()
  const maxWaitMs = 20 * 60 * 1000
  let finalStatus = null
  while (true) {
    await sleep(30 * 1000)
    const status = await pollStatus(videoId)
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0)
    if (status.status === 'completed') {
      console.log(`  ✅ 완료 (${elapsed}s) ${status.duration ? `${status.duration}s` : ''}`)
      finalStatus = status
      break
    } else if (status.status === 'failed') {
      console.log(`  ❌ 실패 (${elapsed}s): ${status.error?.message || JSON.stringify(status.error)}`)
      finalStatus = status
      break
    } else {
      console.log(`  ⏳ ${status.status} (${elapsed}s)`)
    }
    if (Date.now() - startedAt > maxWaitMs) {
      console.log(`  ⏰ 타임아웃`)
      break
    }
  }

  if (finalStatus?.status === 'completed' && finalStatus.video_url) {
    const outFile = path.join(OUT_DIR, 'briefing_dongwan_agent.mp4')
    await downloadFile(finalStatus.video_url, outFile)
    const stat = await fs.stat(outFile)
    console.log(`\n다운로드 완료: ${path.basename(outFile)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
  }

  await fs.writeFile(path.join(OUT_DIR, '_result.json'), JSON.stringify({
    videoId,
    status: finalStatus?.status,
    duration: finalStatus?.duration,
    videoUrl: finalStatus?.video_url,
  }, null, 2), 'utf8')
  console.log(`\n완료. ${OUT_DIR}\\_result.json`)
}

await main()

// 6개 프리셋 아바타에 대해 짧은 자기소개 영상을 HeyGen 으로 생성하고
// mp3 만 추출해 client/public/voice-previews/ 에 저장한다.
// 한 번만 실행하고 결과 파일을 영구 캐싱한다.

import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const ENV_PATH = path.join(ROOT, '.env.local')
const envText = fs.readFileSync(ENV_PATH, 'utf8')
const HEYGEN_KEY = (envText.match(/^HEYGEN_API_KEY=(.+)$/m) || [])[1]?.trim()
if (!HEYGEN_KEY) throw new Error('HEYGEN_API_KEY not in .env.local')

const FFMPEG_BIN = path.join(ROOT, 'server', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe')
if (!fs.existsSync(FFMPEG_BIN)) {
  console.warn('[warn] ffmpeg not found at', FFMPEG_BIN, '— mp3 extraction may fail. Trying system ffmpeg.')
}

const OUT_DIR = path.join(ROOT, 'client', 'public', 'voice-previews')
fs.mkdirSync(OUT_DIR, { recursive: true })

const exec = promisify(execFile)

const PRESETS = [
  { id: 'dongwan_ssaem', avatarId: 'bd28ab87ed834bf5a72a5923536182c6', voiceId: '8da71a32beeb45ffa0182276233333c6', text: '안녕하세요. 입시 전문가 동완쌤이에요.' },
  { id: 'fry_ssaem', avatarId: 'adebcddfb2e94c869e484e946bb275ae', voiceId: '3a6f4521058a436ebf97d42152dae017', text: '안녕하세요. 후라이쌤이에요.' },
  { id: 'male_student', avatarId: '29708244eaa5487e976af960aa51e207', voiceId: '3097f9a8fd3b4340b6bbe913177b378f', text: '공부, 효율적으로 해야죠!' },
  { id: 'female_student', avatarId: '59fbce86969e49d5bb33cd0a443b8cff', voiceId: '86956bc34b7248d7be34eb3a6f69d03b', text: '오늘도 갓생 시작! 저만의 갓생 꿀팁 알려드릴게요.' },
  { id: 'dog_student', avatarId: 'f51d84b6b19645dbbeedf326379be949', voiceId: 'aceb4659b9e7420483800bbf698e9e24', text: '멍멍, 입시 용어 쉽게 알려줄게요.' },
  { id: 'cat_student', avatarId: 'b2f2fda709a2481a8a63a7ea72c747a8', voiceId: 'aUNzYEiHa4XkuSYzaiy1', text: '야옹, 오늘 공부할 준비됐어요?' },
]

async function heygen(method, urlPath, body) {
  const url = `https://api.heygen.com${urlPath}`
  const res = await fetch(url, {
    method,
    headers: { 'X-Api-Key': HEYGEN_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 400) } }
  if (!res.ok) {
    throw new Error(`HeyGen ${method} ${urlPath} failed: ${res.status} ${text.slice(0, 200)}`)
  }
  return json
}

async function startVideo(preset) {
  const body = {
    video_inputs: [
      {
        character: {
          type: 'talking_photo',
          talking_photo_id: preset.avatarId,
        },
        voice: {
          type: 'text',
          input_text: preset.text,
          voice_id: preset.voiceId,
        },
      },
    ],
    dimension: { width: 720, height: 1280 },
  }
  const res = await heygen('POST', '/v2/video/generate', body)
  const videoId = res.data?.video_id || res.video_id
  if (!videoId) throw new Error(`No video_id from ${preset.id}: ${JSON.stringify(res).slice(0, 200)}`)
  return videoId
}

async function pollVideo(videoId, label) {
  const startedAt = Date.now()
  while (true) {
    if (Date.now() - startedAt > 5 * 60 * 1000) throw new Error(`Timeout polling ${label}`)
    await new Promise(r => setTimeout(r, 5000))
    const res = await heygen('GET', `/v1/video_status.get?video_id=${videoId}`)
    const status = res.data?.status
    if (status === 'completed') return res.data?.video_url
    if (status === 'failed' || status === 'error') throw new Error(`Video ${label} failed: ${JSON.stringify(res.data)}`)
    console.log(`  [${label}] status=${status} elapsed=${Math.round((Date.now() - startedAt) / 1000)}s`)
  }
}

async function downloadTo(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
}

async function extractMp3(mp4Path, mp3Path) {
  const args = ['-y', '-i', mp4Path, '-vn', '-acodec', 'libmp3lame', '-b:a', '96k', mp3Path]
  await exec(FFMPEG_BIN, args, { maxBuffer: 1024 * 1024 * 10 })
}

async function processPreset(preset) {
  console.log(`\n[${preset.id}] starting video generate...`)
  const videoId = await startVideo(preset)
  console.log(`  video_id=${videoId}`)
  const videoUrl = await pollVideo(videoId, preset.id)
  console.log(`  video_url=${videoUrl.slice(0, 80)}...`)
  const tmpMp4 = path.join(OUT_DIR, `${preset.id}.tmp.mp4`)
  const mp3 = path.join(OUT_DIR, `${preset.id}.mp3`)
  await downloadTo(videoUrl, tmpMp4)
  console.log(`  mp4 downloaded (${(fs.statSync(tmpMp4).size / 1024).toFixed(1)} KB)`)
  await extractMp3(tmpMp4, mp3)
  fs.unlinkSync(tmpMp4)
  console.log(`  mp3 extracted: ${path.relative(ROOT, mp3)} (${(fs.statSync(mp3).size / 1024).toFixed(1)} KB)`)
  return { id: preset.id, file: `/voice-previews/${preset.id}.mp3` }
}

async function main() {
  const results = []
  // 병렬 실행 (HeyGen 측 동시 처리 허용)
  const settled = await Promise.allSettled(PRESETS.map(processPreset))
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    if (s.status === 'fulfilled') results.push(s.value)
    else console.error(`[${PRESETS[i].id}] FAILED:`, s.reason?.message || s.reason)
  }
  console.log('\n=== Done ===')
  console.log(JSON.stringify(results, null, 2))
}

main().catch((err) => { console.error(err); process.exit(1) })

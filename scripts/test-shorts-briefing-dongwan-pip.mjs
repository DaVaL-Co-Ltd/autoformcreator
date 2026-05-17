// briefing_dongwan 컨셉만 Level 2 메타필드(layout='pip-tl' + infographic) 기반으로
// 영상 다시 생성한다.
// 1. concept-script-tests/briefing_dongwan.json 의 새 메타필드를 읽는다
// 2. pip-tl 씬은 @napi-rs/canvas 로 인포그래픽 PNG 를 그리고 HeyGen 에 업로드
// 3. HeyGen /v2/video/generate 요청을 layout 별로 분기해서 보낸다
// 4. 폴링 + 다운로드
//
// 사용: node scripts/test-shorts-briefing-dongwan-pip.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'concept-video-tests-pip')
const SCRIPT_FILE = path.join(ROOT, 'scripts', 'concept-script-tests', 'briefing_dongwan.json')

// server/node_modules 의 @napi-rs/canvas 를 가져온다.
const require = createRequire(import.meta.url)
const { createCanvas } = require(path.join(ROOT, 'server', 'node_modules', '@napi-rs', 'canvas'))

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

// shortsVideoConcepts.js 에서 아바타 정보 가져오기 (이전 스크립트와 동일).
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

const { findShortsVideoConcept, HEYGEN_AVATAR_LIST } = await importConceptsModule()

// server/index.js:886-971 의 PIP 배경 드로잉 로직 복제. 폰트는 시스템 fallback.
function drawPipBackground({ headline = '', value = '', subtitle = '', chartType = 'bar', theme = 'navy' }) {
  const W = 720, H = 1280
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')

  const themePalettes = {
    beige:      { bg1: '#F5EFE6', bg2: '#EAE3D5', text: '#3A322A', accent: '#A8693C', sub: '#7A6A56' },
    'warm-gray':{ bg1: '#EDEAE5', bg2: '#DCD7D0', text: '#3A3733', accent: '#8A7A6A', sub: '#6E6661' },
    cream:      { bg1: '#FAF6EF', bg2: '#F1E7D2', text: '#2A1F0A', accent: '#D4A540', sub: '#7C6940' },
    navy:       { bg1: '#0F1B2D', bg2: '#1A2D4A', text: '#FFFFFF', accent: '#F4C534', sub: '#7C8FA8' },
  }
  const palette = themePalettes[theme] || themePalettes.beige

  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, palette.bg1)
  grad.addColorStop(1, palette.bg2)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // PIP 영역 우측 헤드라인
  ctx.font = 'bold 30px sans-serif'
  ctx.fillStyle = palette.accent
  ctx.textAlign = 'left'
  ctx.fillText(headline, 310, 80)

  ctx.fillStyle = palette.accent
  ctx.fillRect(310, 100, 80, 4)

  if (subtitle) {
    ctx.font = '22px sans-serif'
    ctx.fillStyle = palette.sub
    ctx.fillText(subtitle, 310, 140)
  }

  // 메인 영역 큰 숫자
  ctx.font = 'bold 140px sans-serif'
  ctx.fillStyle = palette.accent
  ctx.textAlign = 'center'
  ctx.fillText(value, W / 2, 580)

  const chartY = 700
  const chartH = 200
  if (chartType === 'bar') {
    const bars = [{ x: 100, w: 120, h: 80 }, { x: 280, w: 120, h: 140 }, { x: 460, w: 120, h: 180 }]
    bars.forEach((b) => {
      ctx.fillStyle = palette.accent
      ctx.globalAlpha = 0.3 + (b.h / 200) * 0.7
      ctx.fillRect(b.x, chartY + chartH - b.h, b.w, b.h)
    })
    ctx.globalAlpha = 1
  } else if (chartType === 'pie') {
    const cx = W / 2, cy = chartY + chartH / 2, r = 90
    ctx.fillStyle = palette.sub
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = palette.accent
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); ctx.fill()
    ctx.strokeStyle = palette.bg1; ctx.lineWidth = 4; ctx.stroke()
  } else if (chartType === 'line') {
    ctx.strokeStyle = palette.accent
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(80, chartY + 180)
    ctx.lineTo(260, chartY + 140)
    ctx.lineTo(440, chartY + 70)
    ctx.lineTo(620, chartY + 20)
    ctx.stroke()
    ctx.fillStyle = palette.accent
    ;[[80, 180], [260, 140], [440, 70], [620, 20]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(x, chartY + y, 10, 0, Math.PI * 2); ctx.fill()
    })
  }

  ctx.font = '20px sans-serif'
  ctx.fillStyle = palette.sub
  ctx.globalAlpha = 0.6
  ctx.textAlign = 'center'
  ctx.fillText('1퍼센트 입시 데이터 브리핑', W / 2, 940)
  ctx.globalAlpha = 1

  return canvas.toBuffer('image/png')
}

async function uploadAssetToHeygen(buffer) {
  const res = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'image/png' },
    body: buffer,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`HeyGen asset upload ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  }
  // HeyGen 응답 형태: { data: { id: "UUID", image_key: "image/UUID/original.png", url: "..." } }.
  // video/generate 의 background.image_asset_id 는 UUID 만 받는다.
  // 1) data.id 가 있으면 그대로 사용, 2) 없으면 image_key 의 두 번째 토큰(UUID) 추출.
  const directId = data?.data?.id
  const fromKey = String(data?.data?.image_key || '').split('/')[1] || ''
  const fullResponse = JSON.stringify(data).slice(0, 400)
  const resolved = directId || fromKey
  if (!resolved) {
    throw new Error(`HeyGen asset upload — UUID 추출 실패: ${fullResponse}`)
  }
  return { id: resolved, raw: data?.data }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function avatarMetaByAvatarId(avatarId) {
  return HEYGEN_AVATAR_LIST.find((a) => a.avatarId === avatarId) || null
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  console.log(`출력 폴더: ${OUT_DIR}`)

  // 1. 대본 로드
  const rawScript = JSON.parse(await fs.readFile(SCRIPT_FILE, 'utf8'))
  const script = rawScript.parsed
  console.log(`대본: ${script.title}`)
  console.log(`씬 수: ${script.scenes.length}`)

  // 2. 컨셉 + 아바타
  const concept = findShortsVideoConcept('briefing_dongwan')
  const avatarId = concept.preferredAvatarIds[0]
  const meta = avatarMetaByAvatarId(avatarId)
  console.log(`아바타: ${meta.name} (${avatarId})`)
  console.log(`보이스: ${meta.defaultVoiceId}`)

  // 3. 씬별로 video_input 빌드
  const video_inputs = []
  for (const scene of script.scenes) {
    const narration = String(scene.narration || '').trim()
    if (!narration) continue

    const baseInput = {
      character: {
        type: 'avatar',
        avatar_id: avatarId,
        avatar_style: 'normal',
      },
      voice: {
        type: 'text',
        input_text: narration,
        voice_id: meta.defaultVoiceId,
      },
    }

    if (scene.layout === 'pip-tl' && scene.infographic) {
      console.log(`\n  씬 ${scene.sceneNumber}: pip-tl + infographic`)
      console.log(`    headline: ${scene.infographic.headline}`)
      console.log(`    value: ${scene.infographic.value}`)
      console.log(`    chartType: ${scene.infographic.chartType}`)

      // 인포그래픽 PNG 그리기
      const pngBuffer = drawPipBackground({
        headline: scene.infographic.headline || '',
        value: scene.infographic.value || '',
        subtitle: scene.infographic.subtitle || '',
        chartType: scene.infographic.chartType || 'bar',
        theme: scene.infographic.theme || 'navy',
      })
      // 디버그용 로컬 저장
      const localBg = path.join(OUT_DIR, `infographic_scene${scene.sceneNumber}.png`)
      await fs.writeFile(localBg, pngBuffer)
      console.log(`    background PNG: ${path.basename(localBg)} (${(pngBuffer.length / 1024).toFixed(0)} KB)`)

      // HeyGen 업로드
      const upload = await uploadAssetToHeygen(pngBuffer)
      console.log(`    HeyGen asset id: ${upload.id}`)
      if (scene.sceneNumber === 2) console.log(`    (debug raw response): ${JSON.stringify(upload.raw)}`)

      baseInput.character.scale = 0.3
      baseInput.character.offset = { x: -0.30, y: -0.32 }
      baseInput.background = {
        type: 'image',
        image_asset_id: upload.id,
      }
    } else {
      console.log(`\n  씬 ${scene.sceneNumber}: ${scene.layout || 'full'} (배경 합성 없음)`)
    }

    video_inputs.push(baseInput)
  }

  console.log(`\n총 video_inputs: ${video_inputs.length} 개`)

  // 4. HeyGen video/generate 요청
  console.log(`\nHeyGen 영상 생성 요청...`)
  const genRes = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs,
      dimension: { width: 720, height: 1280 },
    }),
  })
  const genData = await genRes.json().catch(() => ({}))
  if (!genRes.ok) {
    console.error(`생성 실패 (${genRes.status}):`, JSON.stringify(genData).slice(0, 500))
    process.exit(1)
  }
  const videoId = genData?.data?.video_id || genData?.video_id
  console.log(`video_id: ${videoId}`)

  // 5. 폴링
  const startedAt = Date.now()
  const maxWaitMs = 15 * 60 * 1000
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

  // 6. 다운로드
  if (finalStatus?.status === 'completed' && finalStatus.video_url) {
    const outFile = path.join(OUT_DIR, 'briefing_dongwan_pip.mp4')
    await downloadFile(finalStatus.video_url, outFile)
    const stat = await fs.stat(outFile)
    console.log(`\n다운로드 완료: ${path.basename(outFile)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
  }

  // 결과 저장
  await fs.writeFile(path.join(OUT_DIR, '_result.json'), JSON.stringify({
    videoId,
    status: finalStatus?.status,
    duration: finalStatus?.duration,
    videoUrl: finalStatus?.video_url,
    sceneCount: video_inputs.length,
    pipScenes: video_inputs.filter((v) => v.background).length,
  }, null, 2), 'utf8')

  console.log(`\n완료. ${OUT_DIR}\\_result.json 확인`)
}

await main()

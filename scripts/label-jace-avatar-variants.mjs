// Jace (male_student) 12개 variant 의 preview 이미지를 Gemini Vision 으로
// 분석해 배경/포즈/의상을 자동 라벨링한다.
// 결과: scripts/avatar-variants/jace_labels.json + _labels.md
// 사용: node scripts/label-jace-avatar-variants.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
// 사용: node scripts/label-jace-avatar-variants.mjs [variants_file_basename]
//   예: node scripts/label-jace-avatar-variants.mjs alexa_variants
//   기본: jace_variants
const SRC_BASENAME = process.argv[2] || 'jace_variants'
const SRC_JSON = path.join(ROOT, 'scripts', 'avatar-variants', `${SRC_BASENAME}.json`)
const OUT_DIR = path.join(ROOT, 'scripts', 'avatar-variants')
const IMG_DIR = path.join(OUT_DIR, 'preview-images')
const LABEL_JSON = path.join(OUT_DIR, `${SRC_BASENAME.replace(/_variants$/, '')}_labels.json`)
const LABEL_MD = path.join(OUT_DIR, `_${SRC_BASENAME.replace(/_variants$/, '')}_labels.md`)
const CHAR_NAME = SRC_BASENAME.replace(/_variants$/, '')

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
const GOOGLE_API_KEY = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim()
if (!GOOGLE_API_KEY) {
  console.error('GOOGLE_API_KEY 없음')
  process.exit(1)
}

async function downloadImage(url, outFile) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(outFile, buf)
  return buf
}

const LABEL_PROMPT = `이 이미지는 HeyGen Photo Avatar 의 preview 입니다.
같은 인물 "${CHAR_NAME}" 가 다양한 배경·포즈·의상으로 등장합니다.
아래 항목을 1줄씩 한국어로 간결하게 답하세요.

1. 배경/장소: (예: "따뜻한 조명의 서재", "거실 소파", "창가", "오피스 책상" 등 시각적 특징)
2. 포즈/자세: (예: "정면 미디엄샷", "소파에 기댄 자세", "책상 앞 앉은 모습")
3. 의상: (예: "흰 셔츠", "캐주얼 후디", "베이지 니트")
4. 분위기: (예: "친근·편안", "전문적", "강의 톤")
5. 짧은 한 줄 라벨 (8자 이내, 영상 씬 매칭용. 예: "서재 앉음", "소파 클로즈업")

응답은 줄바꿈 5줄로 그 항목 텍스트만 나열. 헤더·번호 X.`

async function labelImage(buffer, mimeType = 'image/webp') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`
  const body = {
    contents: [{
      parts: [
        { text: LABEL_PROMPT },
        { inlineData: { mimeType, data: buffer.toString('base64') } },
      ],
    }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 200)}`)
  const parts = data?.candidates?.[0]?.content?.parts || []
  return parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim()
}

function parseLabel(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[\d\.\-\s]*/, '').trim()).filter(Boolean)
  return {
    background: lines[0] || '',
    pose: lines[1] || '',
    outfit: lines[2] || '',
    mood: lines[3] || '',
    shortLabel: lines[4] || '',
  }
}

async function main() {
  await fs.mkdir(IMG_DIR, { recursive: true })
  const src = JSON.parse(await fs.readFile(SRC_JSON, 'utf8'))
  const variants = src.variants || []
  console.log(`variants: ${variants.length} 개`)

  const results = []
  // 너무 많이 동시에 보내면 rate limit. 3개씩 배치.
  const batchSize = 3
  for (let i = 0; i < variants.length; i += batchSize) {
    const batch = variants.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(async (v, j) => {
      const idx = i + j + 1
      const imgFile = path.join(IMG_DIR, `${CHAR_NAME}_${String(idx).padStart(2, '0')}_${v.id.slice(0, 8)}.webp`)
      try {
        console.log(`[${idx}/${variants.length}] ${v.id.slice(0, 12)}... 다운로드 + 라벨링`)
        const buf = await downloadImage(v.preview_image_url, imgFile)
        const raw = await labelImage(buf)
        const parsed = parseLabel(raw)
        return {
          index: idx,
          id: v.id,
          is_current: v.is_current,
          preview_file: path.relative(ROOT, imgFile),
          raw,
          ...parsed,
        }
      } catch (err) {
        console.error(`  실패: ${err.message}`)
        return { index: idx, id: v.id, is_current: v.is_current, error: err.message }
      }
    }))
    results.push(...batchResults)
  }

  await fs.writeFile(LABEL_JSON, JSON.stringify(results, null, 2), 'utf8')

  // markdown
  const md = [`# ${CHAR_NAME} ${results.length}개 variant 라벨링 결과`, '']
  md.push('| # | id | 현재? | 짧은 라벨 | 배경 | 포즈 | 의상 | 분위기 |')
  md.push('|---|----|------|-----------|------|------|------|--------|')
  for (const r of results) {
    if (r.error) {
      md.push(`| ${r.index} | \`${r.id.slice(0, 12)}...\` | ${r.is_current ? '✅' : ''} | ERROR | ${r.error} | | | |`)
      continue
    }
    md.push(`| ${r.index} | \`${r.id.slice(0, 12)}...\` | ${r.is_current ? '✅' : ''} | ${r.shortLabel} | ${r.background} | ${r.pose} | ${r.outfit} | ${r.mood} |`)
  }
  md.push('')
  md.push('## 전체 ID')
  md.push('')
  for (const r of results) {
    md.push(`- \`${r.id}\` ${r.is_current ? '⭐' : ' '} — ${r.shortLabel || r.error || ''}`)
  }
  await fs.writeFile(LABEL_MD, md.join('\n'), 'utf8')

  console.log(`\n완료. 결과:`)
  console.log(`  - ${LABEL_JSON}`)
  console.log(`  - ${LABEL_MD}`)
  console.log(`  - ${IMG_DIR}/ (${results.length}장 preview)`)
}

await main()

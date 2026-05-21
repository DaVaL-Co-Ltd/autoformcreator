// 우리가 쇼츠에 쓰는 HeyGen 아바타/룩들이 16:9(가로) 인지 9:16(세로) 인지 점검한다.
// HeyGen /v2/avatars 응답에는 비율 필드가 없으므로, 각 룩의 preview_image_url 을
// 받아 실제 가로·세로 픽셀을 재서 판정한다. (읽기 전용 — 영상 생성 비용 없음)
//
// 사용: node scripts/check-avatar-aspect-ratio.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const serverRequire = createRequire(path.join(ROOT, 'server', 'index.js'))
const sharp = serverRequire('sharp')

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
if (!HEYGEN_API_KEY) { console.error('HEYGEN_API_KEY 없음'); process.exit(1) }

// 우리가 쓰는 컨셉 모듈 import (상대 import 보정)
async function importConcepts() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-aspect-check')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygen = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  let conceptsSrc = await fs.readFile(path.join(srcDir, 'shortsVideoConcepts.js'), 'utf8')
  conceptsSrc = conceptsSrc.replace(/from\s+(['"])\.\/heygenAvatars\1/g, "from './heygenAvatars.js'")
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygen, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoConcepts.js'), conceptsSrc, 'utf8')
  const concepts = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href)
  const avatars = await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
  return { concepts, avatars, tmpDir }
}

const { concepts: conceptsMod, avatars: avatarsMod, tmpDir } = await importConcepts()
const { SHORTS_VIDEO_CONCEPTS } = conceptsMod
const { HEYGEN_AVATAR_LIST } = avatarsMod

// 점검 대상 ID 수집: 등록 아바타 + 컨셉별 preferredAvatarIds + sceneAvatarIds
const usedBy = new Map() // id → [라벨...]
const note = (id, label) => {
  if (!id) return
  if (!usedBy.has(id)) usedBy.set(id, [])
  if (!usedBy.get(id).includes(label)) usedBy.get(id).push(label)
}
for (const a of HEYGEN_AVATAR_LIST) note(a.avatarId, `등록:${a.name}`)
for (const c of SHORTS_VIDEO_CONCEPTS) {
  for (const id of (c.preferredAvatarIds || [])) note(id, `${c.id}:preferred`)
  for (const id of (c.sceneAvatarIds || [])) note(id, `${c.id}:sceneVariant`)
}
const ids = [...usedBy.keys()]
console.log(`점검 대상 아바타/룩: ${ids.length}개\n`)

// HeyGen /v2/avatars 최신 조회 (서명된 preview URL 확보)
const res = await fetch('https://api.heygen.com/v2/avatars', { headers: { 'X-Api-Key': HEYGEN_API_KEY } })
if (!res.ok) { console.error(`/v2/avatars ${res.status}`); process.exit(1) }
const data = (await res.json())?.data || {}
const avatars = data.avatars || []
const talkingPhotos = data.talking_photos || []
const findEntry = (id) => {
  const tp = talkingPhotos.find((t) => (t.talking_photo_id || t.id) === id)
  if (tp) return { kind: 'talking_photo', name: tp.talking_photo_name, preview: tp.preview_image_url }
  const av = avatars.find((a) => (a.avatar_id || a.id) === id)
  if (av) return { kind: 'avatar', name: av.avatar_name, preview: av.preview_image_url }
  return null
}

function classify(w, h) {
  if (!w || !h) return '측정실패'
  const r = w / h
  if (r >= 1.2) return `가로 16:9 (${w}x${h}, r=${r.toFixed(2)})`
  if (r <= 0.85) return `세로 9:16 (${w}x${h}, r=${r.toFixed(2)})`
  return `정방형 (${w}x${h}, r=${r.toFixed(2)})`
}

const results = []
for (const id of ids) {
  const entry = findEntry(id)
  if (!entry) { results.push({ id, verdict: 'HeyGen 목록에 없음', usedBy: usedBy.get(id) }); continue }
  let verdict = '측정실패'
  try {
    const imgRes = await fetch(entry.preview)
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer())
      const meta = await sharp(buf).metadata()
      verdict = classify(meta.width, meta.height)
    } else {
      verdict = `preview ${imgRes.status}`
    }
  } catch (e) {
    verdict = `에러: ${e.message}`
  }
  results.push({ id, name: entry.name, kind: entry.kind, verdict, usedBy: usedBy.get(id) })
}

// 출력 — 비율별 그룹
const portrait = results.filter((r) => r.verdict.startsWith('세로'))
const landscape = results.filter((r) => r.verdict.startsWith('가로'))
const square = results.filter((r) => r.verdict.startsWith('정방형'))
const other = results.filter((r) => !/^(세로|가로|정방형)/.test(r.verdict))

const show = (r) => `  ${r.id}  [${(r.name || '?')}]  ${r.verdict}\n      쓰임: ${(r.usedBy || []).join(', ')}`
console.log(`\n=== ✅ 세로 9:16 (쇼츠에 적합) — ${portrait.length}개 ===`)
portrait.forEach((r) => console.log(show(r)))
console.log(`\n=== ⚠️ 가로 16:9 (쇼츠에 부적합) — ${landscape.length}개 ===`)
landscape.forEach((r) => console.log(show(r)))
console.log(`\n=== 정방형 — ${square.length}개 ===`)
square.forEach((r) => console.log(show(r)))
if (other.length) {
  console.log(`\n=== 판정 불가 — ${other.length}개 ===`)
  other.forEach((r) => console.log(show(r)))
}

await fs.rm(tmpDir, { recursive: true, force: true })
console.log(`\n요약: 세로 ${portrait.length} · 가로 ${landscape.length} · 정방형 ${square.length} · 불가 ${other.length}`)

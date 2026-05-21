// 동완쌤 / 후라이쌤 / 강아지 avatar group 안의 룩(look) 목록을 조회하고
// 각 룩의 ID·이름·미리보기 비율(9:16 / 16:9)을 출력한다. (읽기 전용)
//
// 사용: node scripts/inspect-avatar-group-looks.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const serverRequire = createRequire(path.join(ROOT, 'server', 'index.js'))
const sharp = serverRequire('sharp')

async function loadDotenv(p) {
  try {
    const raw = await fs.readFile(p, 'utf8')
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
const KEY = (process.env.HEYGEN_API_KEY || process.env.VITE_HEYGEN_API_KEY || '').trim()
if (!KEY) { console.error('HEYGEN_API_KEY 없음'); process.exit(1) }

const GROUPS = [
  { label: '동완쌤', groupId: 'e173e545a897462cb3979eece141d6ed' },
  { label: '후라이쌤', groupId: 'cfdf4447704f4e44b92cd984dd9b28cc' },
  { label: '강아지', groupId: 'f51d84b6b19645dbbeedf326379be949' },
]

async function getJson(url) {
  const res = await fetch(url, { headers: { 'X-Api-Key': KEY } })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { ok: res.ok, status: res.status, json, text }
}

async function aspectOf(url) {
  if (!url) return '?'
  try {
    const r = await fetch(url)
    if (!r.ok) return `preview ${r.status}`
    const m = await sharp(Buffer.from(await r.arrayBuffer())).metadata()
    const ratio = m.width / m.height
    const tag = ratio >= 1.2 ? '가로 16:9' : ratio <= 0.85 ? '세로 9:16' : '정방형'
    return `${tag} (${m.width}x${m.height})`
  } catch (e) { return `측정실패: ${e.message}` }
}

for (const g of GROUPS) {
  console.log(`\n========== ${g.label} (group ${g.groupId}) ==========`)
  // 그룹 안의 룩 목록 — 후보 엔드포인트 순차 시도
  const endpoints = [
    `https://api.heygen.com/v2/avatar_group/${g.groupId}/avatars`,
    `https://api.heygen.com/v2/avatar_group.avatars?group_id=${g.groupId}`,
    `https://api.heygen.com/v1/avatar_group/${g.groupId}/avatars`,
  ]
  let looks = null
  for (const url of endpoints) {
    const { ok, status, json } = await getJson(url)
    if (ok && json) {
      looks = json?.data?.avatar_list || json?.data?.avatars || json?.data?.list || json?.data || null
      if (Array.isArray(looks)) { console.log(`  (엔드포인트 OK: ${url})`); break }
      looks = null
    } else {
      console.log(`  [${status}] ${url}`)
    }
  }
  if (!Array.isArray(looks) || !looks.length) {
    console.log('  룩 목록을 가져오지 못함')
    continue
  }
  console.log(`  룩 ${looks.length}개:`)
  for (const look of looks) {
    const id = look.id || look.avatar_id || look.talking_photo_id || look.image_key
    const name = look.name || look.avatar_name || look.talking_photo_name || '(이름 없음)'
    const preview = look.image_url || look.preview_image_url || look.preview_image || look.motion_preview_url
    const aspect = await aspectOf(preview)
    console.log(`   - ${id}  [${name}]  ${aspect}`)
  }
}

// e173e545 / bd28ab87 가 /v2/avatars talking_photos 에 있는지 확인
const { json: avJson } = await getJson('https://api.heygen.com/v2/avatars')
const tps = avJson?.data?.talking_photos || []
const avs = avJson?.data?.avatars || []
console.log('\n========== /v2/avatars 내 확인 ==========')
for (const id of ['e173e545a897462cb3979eece141d6ed', 'bd28ab87ed834bf5a72a5923536182c6']) {
  const tp = tps.find((t) => (t.talking_photo_id || t.id) === id)
  const av = avs.find((a) => (a.avatar_id || a.id) === id)
  console.log(`  ${id} → ${tp ? `talking_photo "${tp.talking_photo_name}"` : av ? `avatar "${av.avatar_name}"` : '없음'}`)
}

// HeyGen Photo Avatar Group 목록을 조회해서
// 우리가 매핑한 12개 Alexa variants 가 정말 한 group 에 속하는지 검증한다.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

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
const HEYGEN_API_KEY = (process.env.HEYGEN_API_KEY || '').trim()
if (!HEYGEN_API_KEY) { console.error('HEYGEN_API_KEY 없음'); process.exit(1) }

// 후보 엔드포인트들 — HeyGen 문서가 부분적이라 가능성 있는 것 모두 시도
const ENDPOINTS = [
  'https://api.heygen.com/v2/avatar_group.list',
  'https://api.heygen.com/v2/avatar_group/list',
  'https://api.heygen.com/v2/photo_avatar/avatar_group/list',
  'https://api.heygen.com/v2/avatar_group',
]

for (const url of ENDPOINTS) {
  try {
    const res = await fetch(url, { headers: { 'X-Api-Key': HEYGEN_API_KEY } })
    const text = await res.text()
    console.log(`\n[${res.status}] ${url}`)
    console.log(text.slice(0, 400))
    if (res.ok) {
      const data = JSON.parse(text)
      await fs.writeFile(path.join(ROOT, 'scripts', 'avatar-variants', '_avatar_groups.json'), JSON.stringify(data, null, 2), 'utf8')
      console.log('  ↑ 응답을 _avatar_groups.json 에 저장')
    }
  } catch (err) {
    console.log(`\n${url} -> 에러: ${err.message}`)
  }
}

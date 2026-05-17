// HeyGen public avatar 목록에서 male_student (남자 제자) 의 variant 들을 찾는다.
// 같은 인물이 다른 배경/의상으로 등록된 경우 보통 이름이 비슷하다.
// 사용: node scripts/find-heygen-avatar-variants.mjs [기준_avatar_id]

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'avatar-variants')

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

const TARGET_ID = process.argv[2] || '885c95d7fced49bba5cb230ca5a3e332' // male_student

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  console.log(`기준 avatar_id: ${TARGET_ID}`)

  const res = await fetch('https://api.heygen.com/v2/avatars', {
    headers: { 'X-Api-Key': HEYGEN_API_KEY },
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error(`HeyGen API ${res.status}: ${errText.slice(0, 300)}`)
    process.exit(1)
  }
  const data = await res.json()
  const avatars = data?.data?.avatars || []
  const talkingPhotos = data?.data?.talking_photos || []
  console.log(`총 public avatars: ${avatars.length} 개, talking_photos: ${talkingPhotos.length} 개`)

  await fs.writeFile(path.join(OUT_DIR, '_all-avatars.json'), JSON.stringify(data?.data, null, 2), 'utf8')

  // 기준 avatar 찾기 (public avatars + talking_photos 둘 다 검사)
  let target = avatars.find((a) => (a.avatar_id || a.id) === TARGET_ID)
  let targetKind = 'public_avatar'
  if (!target) {
    target = talkingPhotos.find((a) => (a.talking_photo_id || a.id) === TARGET_ID)
    targetKind = target ? 'talking_photo' : null
  }
  if (!target) {
    console.warn(`\n기준 avatar_id ${TARGET_ID} 를 public avatars 와 talking_photos 둘 다에서 못 찾음.`)
    console.warn(`→ 이 ID 는 private/instant avatar 일 가능성. 이 경우 HeyGen UI 에서 별도 룩 추가 필요.`)
    return
  }
  console.log(`\n기준 발견: ${targetKind}`)

  const targetName = target.avatar_name || target.talking_photo_name || target.name || ''
  console.log(`\n기준 아바타: "${targetName}"`)
  console.log(`  gender: ${target.gender || '-'}`)
  console.log(`  preview: ${target.preview_image_url || target.thumbnail_url || '-'}`)

  // 이름에서 핵심 키워드 추출 (보통 인물 이름이 앞부분에 있음).
  const baseTokens = targetName
    .split(/[\s_\-]+/)
    .filter((t) => t.length >= 2)
  const firstToken = baseTokens[0] || ''
  console.log(`\n핵심 키워드: "${firstToken}" (이름의 첫 토큰 기준 매칭)`)

  // 매칭할 풀: target 종류에 따라 검색 대상 결정.
  const pool = targetKind === 'public_avatar' ? avatars : talkingPhotos
  const idField = targetKind === 'public_avatar' ? 'avatar_id' : 'talking_photo_id'
  const nameField = targetKind === 'public_avatar' ? 'avatar_name' : 'talking_photo_name'

  const variants = pool.filter((a) => {
    const name = (a[nameField] || a.name || '').toLowerCase()
    return name.startsWith(firstToken.toLowerCase())
  })

  console.log(`\n같은 인물 추정 variants: ${variants.length} 개 (kind=${targetKind})`)
  variants.forEach((a) => {
    const id = a[idField] || a.id
    const name = a[nameField] || a.name
    const marker = id === TARGET_ID ? ' ← 현재 설정' : ''
    console.log(`  - ${id}`)
    console.log(`    name: ${name}${marker}`)
    console.log(`    preview: ${a.preview_image_url || a.thumbnail_url || '-'}`)
    console.log(`    gender: ${a.gender || '-'}`)
  })

  const outFileName = `${(targetName || 'unknown').toLowerCase().replace(/\s+/g, '_')}_variants.json`
  await fs.writeFile(path.join(OUT_DIR, outFileName), JSON.stringify({
    target: { id: TARGET_ID, name: targetName, kind: targetKind },
    matchedToken: firstToken,
    variants: variants.map((a) => ({
      id: a[idField] || a.id,
      name: a[nameField] || a.name,
      preview_image_url: a.preview_image_url || a.thumbnail_url,
      gender: a.gender,
      is_current: (a[idField] || a.id) === TARGET_ID,
    })),
  }, null, 2), 'utf8')

  console.log(`\n결과 저장: ${path.join(OUT_DIR, outFileName)}`)
}

await main()

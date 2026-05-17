// 12개 Alexa preview 이미지를 Gemini Vision 에 한 번에 보내
// 모두 같은 인물인지 검증한다.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const IMG_DIR = path.join(ROOT, 'scripts', 'avatar-variants', 'preview-images')

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
const KEY = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim()
if (!KEY) { console.error('GOOGLE_API_KEY 없음'); process.exit(1) }

const files = (await fs.readdir(IMG_DIR))
  .filter((f) => f.startsWith('alexa_') && f.endsWith('.webp'))
  .sort()
console.log(`Alexa preview ${files.length}장 비교 시작`)

const parts = [{ text: `다음 ${files.length}장의 사진은 HeyGen Photo Avatar "Alexa" 라는 같은 이름으로 등록된 다른 룩들입니다.

검증 작업: 사진 속 인물이 정말 모두 동일 인물인지 판단해 주세요.

판단 기준:
1. 얼굴 골격, 눈매, 코, 입 모양 등 변하지 않는 특징
2. 헤어 색·스타일은 비슷한지
3. 의상·배경은 무시. 얼굴만 비교

각 사진을 1번부터 ${files.length}번까지 순서대로 비교하고, 같은 인물이면 "동일", 다르면 "다름 (이유)" 으로 표시.

마지막에 결론을 1줄로:
"결론: 12명 모두 동일 인물" 또는 "결론: 일부 다른 인물 포함 (N번 등)"

응답 양식:
1: 동일/다름
2: 동일/다름
...
12: 동일/다름
결론: ...` }]

for (const f of files) {
  const buf = await fs.readFile(path.join(IMG_DIR, f))
  parts.push({ inlineData: { mimeType: 'image/webp', data: buf.toString('base64') } })
}

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  }),
})
const data = await res.json().catch(() => ({}))
if (!res.ok) { console.error(res.status, JSON.stringify(data).slice(0, 300)); process.exit(1) }
const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') || ''
console.log('\n=== Gemini 판단 ===\n')
console.log(text)
await fs.writeFile(path.join(ROOT, 'scripts', 'avatar-variants', '_alexa_identity_check.md'),
  `# Alexa 12 variants 동일인물 검증\n\n${text}\n`, 'utf8')
console.log('\n저장: scripts/avatar-variants/_alexa_identity_check.md')

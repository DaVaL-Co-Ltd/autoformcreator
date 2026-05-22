// 새 default fallback 규칙(sample-1 스타일 + 중앙 키워드 오버레이)으로 Gemini 이미지를 생성한다.
// blogImageRules.js 의 default_keyword 분기 프롬프트를 그대로 인라인했다.
import fs from 'node:fs/promises'
import path from 'node:path'

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY
if (!API_KEY) {
  console.error('VITE_GEMINI_API_KEY 가 필요합니다.')
  process.exit(1)
}

// ── commonImageRules.js 상수 ──
const STYLE_DEFAULT = 'Hand-drawn outline illustration style with soft pastel fills, clean linework, gentle matte surfaces, and a calm minimal composition with generous empty space in the center.'
const NO_LETTER_PROMPT = 'CRITICAL TEXT RULE: the image must contain zero readable letters or words. Absolutely no Korean text, no Hangul, no English letters, no Japanese characters, no Chinese characters, no Arabic letters, no words, no fake text, no handwritten marks, no logo text, no signage text, no labels, no captions, and no typography of any kind. If any text-like shape appears, it is a failed image. Regenerate mentally and keep the background free of all letters. Only plain numeric digits 0-9 are allowed when truly necessary; otherwise prefer no symbols at all.'
const DOM_TEXT_OVERLAY_PROMPT = 'The final readable text is added later by the app as DOM overlay text. Do not bake any text into the image. Keep enough calm visual space for wrapped overlay text, but do not draw placeholder text boxes, empty panels, fake captions, labels, or typography.'

// ── blogImageRules.js 상수 ──
const DEFAULT_CARDNEWS_LAYOUT_RULE = 'CRITICAL LAYOUT RULE: the inner 70% by 70% center area must remain completely empty and visually calm with one clean light cream or ivory tone, because the app will place its own white circle and a centered keyword on top afterward — anything drawn in that inner zone will be hidden or look broken. Add soft organic blob shapes that use the chosen color palette only in the four outer corners, hugging the canvas edges and never crossing into the inner 70% empty zone. Place exactly four simple study motifs, one in each corner region, sitting on top of the colored corner blobs, with each motif kept inside the outer 18% band measured from the nearest two canvas edges. Use hand-drawn outline illustration style with clean linework, soft pastel fills, gentle matte surfaces, and no shading complexity. Do not add any white circle, title plate, text panel, badge, frame, sticker sheet, collage layout, or busy decorative background. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.'

const KNOWLEDGE_INSIGHT_THEME_MOTIFS = {
  math: 'a formula notebook, compass, graph curve, geometric sketch, or number-pattern object',
  science: 'a beaker, microscope, atom visual, leaf-energy science cue, or experiment object',
  korean: 'an open book, fountain pen, reading cue, text-flow symbol, or literature-study object',
  social: 'a map, globe, civic symbol, chart, economy cue, or society-related study object',
  english: 'a dictionary, reading cue, speech bubble symbol, listening-study object, or flash-card motif without readable text',
  history: 'an old map silhouette, artifact, document cue, timeline object, or history-study symbol',
  computing: 'a circuit line, logic block, laptop silhouette, algorithm-flow cue, or computing-study object',
  generic: 'a notebook, pencil, study note, planner, magnifier, or one clear learning-related object',
}

const CONCEPT_DIGEST_THEME_KEYWORDS = [
  { id: 'math', keywords: ['수학', '함수', '방정식', '도형', '확률', '통계', '기하'] },
  { id: 'science', keywords: ['과학', '물리', '화학', '생물', '원자', '세포', '에너지', '실험'] },
  { id: 'korean', keywords: ['국어', '문학', '시', '소설', '독해', '문법'] },
  { id: 'social', keywords: ['사회', '경제', '정치', '지리', '문화'] },
  { id: 'english', keywords: ['영어', '영문법', '영단어', '독해', '리스닝'] },
  { id: 'history', keywords: ['역사', '한국사', '세계사', '조선'] },
  { id: 'computing', keywords: ['컴퓨터', '정보', '인공지능', 'AI', '알고리즘', '코딩'] },
]

function inferConceptDigestTheme(section) {
  const haystack = [section.heading || '', section.keyPhrase || '', section.content || ''].join(' ').toLowerCase()
  let bestTheme = 'generic'
  let bestScore = 0
  for (const candidate of CONCEPT_DIGEST_THEME_KEYWORDS) {
    const score = candidate.keywords.reduce((total, keyword) => total + (haystack.includes(String(keyword).toLowerCase()) ? 1 : 0), 0)
    if (score > bestScore) { bestScore = score; bestTheme = candidate.id }
  }
  return bestTheme
}

function describeConceptDigestTopic(section) {
  const topic = String(section.keyPhrase || section.heading || '').trim()
  if (!topic) return 'Use one single study-related motif that directly represents the lesson topic, placed only in a corner of the canvas.'
  return `Choose simple visual motifs that are directly and specifically related to the lesson topic "${topic}". Place exactly four motifs, one in each of the four corners of the square canvas, with each motif kept strictly inside the outer 15% band measured from the nearest two canvas edges. The inner 70% by 70% central area must remain completely empty — no motif may cross into it. Do not add a separate background plate, badge, frame, circle, or square behind any motif. Keep the motifs literal, educational, and easy to recognize at a glance. Do not render any Korean letters or Korean words anywhere in the image. English letters and numbers are acceptable only if they are part of the motif.`
}

const BLOG_AUTO_COLOR_PALETTES = [
  'muted slate blue, dusty navy, cool gray accents, soft mist highlights.',
  'sage green, eucalyptus, soft cream, deep forest accents.',
  'dusty mauve, muted plum, rose beige, warm ivory accents.',
  'teal blue, desaturated cyan, deep petrol, pale stone highlights.',
  'soft lavender gray, smoky violet, cool white, charcoal accents.',
  'muted blush, rose taupe, sand beige, cocoa accents.',
]
function hashString(value) { let hash = 0; for (let i = 0; i < value.length; i++) { hash = (hash << 5) - hash + value.charCodeAt(i); hash |= 0 } return Math.abs(hash) }
function pickPalette(seed, palettes) { return palettes[hashString(seed) % palettes.length] }

function buildDefaultKeywordPrompt(section) {
  const subjectTheme = inferConceptDigestTheme(section)
  const subjectPrompt = KNOWLEDGE_INSIGHT_THEME_MOTIFS[subjectTheme] || KNOWLEDGE_INSIGHT_THEME_MOTIFS.generic
  const paletteDesc = pickPalette(`${section.heading}|${section.keyPhrase || ''}||blog`, BLOG_AUTO_COLOR_PALETTES)
  const topicPrompt = describeConceptDigestTopic(section)
  const mediumHint = 'Generate a 1:1 square illustration for a Korean education blog image'
  const sceneHint = `${subjectPrompt} ${topicPrompt}`
  const styleConstraint = 'No realistic photos, no people. Keep four corner motifs only — never fill the inner 70% center area. Soft organic blob shapes in the four corners use the chosen palette color. Hand-drawn outline illustration with soft pastel fills, clean linework, gentle matte surfaces, and a calm uncluttered composition. Do not use notebook lines, paper textures, check patterns, chalkboard grain, white plates, badges, or text containers.'
  return `${mediumHint} about "${section.heading}". ${STYLE_DEFAULT} Color palette: ${paletteDesc} ${sceneHint} ${DEFAULT_CARDNEWS_LAYOUT_RULE} ${DOM_TEXT_OVERLAY_PROMPT} ${NO_LETTER_PROMPT} ${styleConstraint} If the selected style suggests a solid color or subtle pattern background, keep it visually simple and readable under DOM text overlays.`
}

async function generate(section, outFile) {
  const prompt = buildDefaultKeywordPrompt(section)
  console.log(`[${path.basename(outFile)}] prompt length=${prompt.length} | theme=${inferConceptDigestTheme(section)}`)

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${API_KEY}`
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
  const data = await res.json()
  const imagePart = (data?.candidates?.[0]?.content?.parts || []).find((p) => p?.inlineData?.data)
  if (!imagePart) throw new Error('이미지 응답 없음')
  const buf = Buffer.from(imagePart.inlineData.data, 'base64')
  await fs.writeFile(outFile, buf)
  console.log(`saved ${outFile} (${buf.length} bytes)`)
}

const samples = [
  { section: { heading: '공부 습관 만들기', keyPhrase: '꾸준한 학습 루틴' }, out: 'default-v2-sample-1.png' },
  { section: { heading: '시험 전 마인드셋', keyPhrase: '집중과 회복' }, out: 'default-v2-sample-2.png' },
  { section: { heading: '효율적인 시간 관리', keyPhrase: '계획과 실행' }, out: 'default-v2-sample-3.png' },
]

const outDir = path.resolve(process.cwd(), '.codex')
for (const s of samples) {
  try { await generate(s.section, path.join(outDir, s.out)) }
  catch (err) { console.error(`[${s.out}] 실패:`, err.message) }
}

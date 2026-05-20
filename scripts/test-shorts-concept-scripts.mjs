// 컨셉별 쇼츠 대본 생성 테스트
// 8개 컨셉 각각에 대해 Gemini로 대본을 생성하고
// scripts/concept-script-tests/{conceptId}.json + _summary.md 로 저장한다.
//
// 사용: node scripts/test-shorts-concept-scripts.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'concept-script-tests')

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

const API_KEY = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim()
if (!API_KEY) {
  console.error('GOOGLE_API_KEY 또는 GEMINI_API_KEY 가 server/.env 에 없음')
  process.exit(1)
}

// Node 의 strict ESM 은 `from './heygenAvatars'` 같은 확장자 없는 import 를 못 푼다.
// Vite 가 자동 해석해주는 import 라서, 임시 폴더에 import 경로를 .js 로 패치해서 복사한 뒤 로드한다.
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
  return await import(
    pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href
  )
}

const conceptsModule = await importConceptsModule()
const { SHORTS_VIDEO_CONCEPTS, buildShortsConceptExtra, findShortsVideoConcept } = conceptsModule

// 입시 도메인 대표 시드 데이터 (모든 컨셉이 입시 주제 기반이므로 단일 시드로 비교).
const SAMPLE_SUMMARY = {
  title: '2026 의대 정원 확대와 입시 트렌드',
  oneLiner: '2026학년도 의대 정원이 약 2배 늘면서 상위권의 의대 쏠림이 가속되고 수능 경쟁이 더 치열해졌다.',
  keyPoints: [
    '의대 정원 전년 대비 약 2배 확대',
    '상위 1% 학생의 의대 선호도 12.4% 상승',
    '수능 1등급 컷이 작년 대비 1점 상승',
    '학생부 종합전형 비중은 작년과 유사하게 유지',
    '논술 전형 모집 인원은 소폭 감소',
  ],
}

const SAMPLE_RAW_TEXT = `2026학년도 대입에서 가장 큰 변화는 의대 정원의 대규모 확대다.
정부는 의대 정원을 전년 대비 약 2배 수준으로 늘렸고, 이로 인해 최상위권 수험생들의 의대 지원 쏠림이 더 강해졌다.
실제로 상위 1% 학생 집단의 의대 선호도는 작년 대비 12.4% 상승했고, 그중 약 50%가 의대를 1순위로 선택한 것으로 집계되었다.
정원이 늘어났지만 지원자도 함께 늘면서 수능 1등급 컷은 작년보다 1점 상승했고, 경쟁률은 사상 최고치에 근접했다.
한편 학생부 종합전형(학종) 비중은 큰 변화 없이 유지되었고, 논술 전형의 모집 인원은 일부 대학에서 소폭 줄었다.
입시 전문가들은 의대 쏠림 현상이 단기간에 해소되기 어렵다고 전망하면서,
수험생과 학부모에게는 본인 성적과 지원 전형의 조합을 정밀하게 설계해야 한다고 조언한다.`

const SAMPLE_EMPHASIS = ''

// gemini-content.js / ExtractionPage.jsx 의 프롬프트 구성을 그대로 재현.
function buildEmphasisInstruction(emphasis) {
  if (!emphasis || !emphasis.trim()) return ''
  return `
## 강조 사항
${emphasis.trim()}
`
}

function buildOptionsInstruction(options = {}) {
  const parts = []
  if (options.shortsExtra) parts.push(`- 숏폼 추가 지시: ${options.shortsExtra}`)
  if (!parts.length) return ''
  return `
## 사용자 설정
아래 설정은 기본 규칙보다 우선해서 반영하세요.
${parts.join('\n')}
`
}

function buildShortsConceptFewShot(conceptId) {
  const concept = findShortsVideoConcept(conceptId)
  if (!concept?.testScript) return ''
  return `
## 컨셉 출력 포맷 예시
선택된 컨셉: ${concept.label}
아래 testScript 는 이 컨셉의 정확한 JSON 출력 포맷 예시입니다.
scenes[].layout, sharedBackground, scenes[].infographic, scenes[].speakerSide 같은
메타필드 패턴을 그대로 따라하세요. narration / visualDescription / textOverlay 는
현재 입력 데이터 기반으로 새로 작성하되 layout 등의 메타필드는 예시와 동일한 구조로 채우세요.

\`\`\`json
${JSON.stringify(concept.testScript, null, 2)}
\`\`\`
`
}

function buildShortsPrompt(summary, rawText, emphasis, options) {
  const fewShot = buildShortsConceptFewShot(options.videoConceptId)
  return `당신은 유튜브 숏폼 스크립트 작가입니다. 아래 정보를 바탕으로 20~30초 분량의 숏폼 대본을 작성하세요.

## 공통 규칙
- 모든 숫자, 통계, 연도, 수치는 원문 그대로 사용하세요.
- 없는 사실은 추가하지 마세요.
- scenes는 3개 이상으로 구성하세요.
- hook, scenes[].narration, scenes[].textOverlay, cta, uploadTitle, uploadDescription에는 markdown bold/emphasis(**, *, __, _)를 절대 사용하지 마세요.
- 각 나레이션은 1~2문장으로 짧고 명확하게 작성하세요.

## 씬 메타필드 규칙 (영상 합성용)
- layout 후보: 'full' (풀화면 1인), 'infographic-full' (풀화면 인포그래픽 · 아바타 미노출 · 보이스오버), 'dialogue-shared-bg' (공유 배경 + 좌우 화자 교차), 'quiz-shared-bg' (공유 배경 + 중앙 풀샷 인물 교차), 'quiz-countdown' (퀴즈 대기 씬 · 같은 인물 idle · 3초 카운트다운 배경), 'solo-shared-bg' (공유 배경 + 중앙 풀샷 솔로 아바타), 'full-vlog' (풀화면 + 씬마다 다른 브이로그 배경).
- 'infographic-full' 을 쓰면 scenes[].visualDescription 에 headline, hero value(예: "+12.4%"), chart 종류(bar/pie/line), subtitle, 색상 톤을 영어로 한 문장에 자세히 풀어 쓰세요 — HeyGen Video Agent 가 이 묘사대로 풀화면 인포그래픽을 직접 생성하며, 아바타는 자동으로 숨겨집니다. "no avatar visible", "no people" 을 반드시 포함하세요. 첫 씬·마지막 씬에는 쓰지 말고, 수치·통계·비교 또는 강조 키워드가 핵심인 중간 씬에만 쓰세요.
- 'dialogue-shared-bg' 와 'quiz-shared-bg' 와 'solo-shared-bg' 를 쓰면 최상위 sharedBackground.visualDescription 필드를 한 번 채우고(인물 없이 공간·소품만 영어로 묘사), 각 씬은 동일한 sharedBackground 를 공유한다고 가정하세요. 'solo-shared-bg' 는 솔로 아바타가 중앙 풀샷으로 한 영상 내내 같은 배경을 유지하는 용도입니다.
- 'dialogue-shared-bg' 를 쓰면 각 씬에 speakerSide ('left' 또는 'right') 를 명시하세요.
- 퀴즈형 컨셉(ox_quiz)은 각 문제를 질문 씬('quiz-shared-bg') → 대기 씬('quiz-countdown', narration 은 빈 문자열) → 정답 씬('quiz-shared-bg') 3개로 구성하고, 한 문제의 3개 씬은 모두 같은 avatarId 를 지정하세요. 대기 씬 배경 카운트다운 영상은 시스템이 자동 처리합니다.
- 'full-vlog' 를 쓰면 scenes[].visualDescription 에 씬마다 다른 장소·시간대 배경을 영어로 상세히 묘사하세요.
- 컨셉이 선택되지 않았다면: 첫 씬과 마지막 씬은 'full'(아바타가 말하는 화면)로 두고, 중간 씬들은 수치·통계·데이터가 핵심인 씬이면 'infographic-full'(HeyGen 자체 인포그래픽 화면), 그 외에는 'full' 로 지정하세요.
- visualDescription 은 항상 영어로, 인물 외형·자세·배경·조명·프레이밍을 한 문장으로 충분히 묘사하세요.

## 업로드 메타데이터 규칙
- uploadTitle: 60자 이내
- uploadDescription: 200~400자
- hashtags: 8~12개 배열, #Shorts 포함
${fewShot}
## 입력 데이터
### 요약 데이터
${JSON.stringify(summary, null, 2)}

### 원문
${rawText.slice(0, 8000)}
${buildEmphasisInstruction(emphasis)}
${buildOptionsInstruction(options)}

## 출력 스키마
{"title":"숏폼 제목","duration":"20","hook":"첫 문장","sharedBackground":{"visualDescription":"공유 배경 영어 묘사. 공유 배경 layout 을 쓰지 않으면 생략 가능"},"scenes":[{"sceneNumber":1,"duration":"6","layout":"full","narration":"나레이션","visualDescription":"Visual description in English","textOverlay":"텍스트 오버레이","speakerSide":"left","infographic":{"headline":"핵심 라벨","value":"+12.4%","subtitle":"부가 설명","chartType":"bar","theme":"beige"}}],"cta":"마무리 문구","thumbnailPrompt":"Thumbnail prompt in English","uploadTitle":"YouTube 제목","uploadDescription":"YouTube 설명","hashtags":["#Shorts","#태그"]}`
}

async function callGemini(prompt) {
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash']
  let lastErr = null
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      })
      if (!res.ok) {
        const errBody = await res.text()
        lastErr = new Error(`${model} HTTP ${res.status}: ${errBody.slice(0, 200)}`)
        if (res.status === 429) {
          console.warn(`  ${model} 429, 다음 모델 시도`)
          continue
        }
        throw lastErr
      }
      const data = await res.json()
      const parts = data?.candidates?.[0]?.content?.parts || []
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n')
      if (text) return { text, model }
      lastErr = new Error(`${model} 빈 응답`)
    } catch (err) {
      lastErr = err
      console.warn(`  ${model} 실패: ${err.message}`)
    }
  }
  throw lastErr || new Error('모든 모델 실패')
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {}
    }
    return null
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function runOne(concept) {
  const conceptExtra = buildShortsConceptExtra(concept.id)
  const prompt = buildShortsPrompt(SAMPLE_SUMMARY, SAMPLE_RAW_TEXT, SAMPLE_EMPHASIS, {
    shortsExtra: conceptExtra,
    videoConceptId: concept.id,
  })
  console.log(`\n[${concept.id}] ${concept.label}`)
  console.log(`  프롬프트 길이: ${prompt.length}자`)
  const t0 = Date.now()
  const { text, model } = await callGemini(prompt)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`  ${model}, ${elapsed}s`)
  const parsed = safeJsonParse(text)
  if (!parsed) {
    console.warn(`  JSON 파싱 실패`)
  }
  const outFile = path.join(OUT_DIR, `${concept.id}.json`)
  await fs.writeFile(outFile, JSON.stringify({
    conceptId: concept.id,
    conceptLabel: concept.label,
    model,
    elapsedSec: Number(elapsed),
    promptLength: prompt.length,
    conceptExtra,
    rawText: text,
    parsed,
  }, null, 2), 'utf8')
  return { conceptId: concept.id, label: concept.label, parsed, model, elapsed }
}

async function buildSummaryMarkdown(results) {
  const lines = []
  lines.push('# 컨셉별 쇼츠 대본 생성 비교')
  lines.push('')
  lines.push(`- 시드 주제: ${SAMPLE_SUMMARY.title}`)
  lines.push(`- 컨셉 수: ${results.length}`)
  lines.push('')
  for (const r of results) {
    const p = r.parsed || {}
    lines.push(`## ${r.label} (\`${r.conceptId}\`)`)
    lines.push('')
    lines.push(`- 모델: ${r.model}, 소요: ${r.elapsed}s`)
    lines.push(`- 제목: ${p.title || '(없음)'}`)
    lines.push(`- 훅: ${p.hook || '(없음)'}`)
    lines.push(`- CTA: ${p.cta || '(없음)'}`)
    lines.push(`- 씬 수: ${(p.scenes || []).length}`)
    lines.push('')
    lines.push('| # | duration | narration | textOverlay |')
    lines.push('|---|----------|-----------|-------------|')
    for (const sc of (p.scenes || [])) {
      const nar = String(sc.narration || '').replace(/\|/g, '\\|').slice(0, 80)
      const ovr = String(sc.textOverlay || '').replace(/\|/g, '\\|')
      lines.push(`| ${sc.sceneNumber ?? '-'} | ${sc.duration ?? '-'} | ${nar} | ${ovr} |`)
    }
    lines.push('')
    lines.push(`- 업로드 제목: ${p.uploadTitle || '(없음)'}`)
    lines.push(`- 해시태그: ${(p.hashtags || []).join(' ')}`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  await ensureDir(OUT_DIR)
  console.log(`출력 폴더: ${OUT_DIR}`)
  console.log(`컨셉 수: ${SHORTS_VIDEO_CONCEPTS.length}`)
  const results = []
  for (const concept of SHORTS_VIDEO_CONCEPTS) {
    try {
      results.push(await runOne(concept))
    } catch (err) {
      console.error(`[${concept.id}] 실패:`, err.message)
      results.push({ conceptId: concept.id, label: concept.label, parsed: null, model: 'ERROR', elapsed: 0, error: err.message })
    }
  }
  const md = await buildSummaryMarkdown(results)
  await fs.writeFile(path.join(OUT_DIR, '_summary.md'), md, 'utf8')
  console.log(`\n완료. ${OUT_DIR}\\_summary.md 확인`)
}

await main()

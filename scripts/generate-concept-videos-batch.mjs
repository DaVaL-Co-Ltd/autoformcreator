// 숏폼 컨셉 여러 개를 일괄 생성한다:
//   HeyGen 렌더 → 자막 번인(ffmpeg) → Supabase Storage 업로드 → extractions 테이블 저장.
// 자막 번인은 server/index.js 의 /api/subtitle/burn 로직을 그대로 복제했다.
// Gemini 배경 합성은 사용하지 않는다 (아바타 자체 배경 / 컨셉 단색만).
//
// 사용: node scripts/generate-concept-videos-batch.mjs [conceptId ...]
//   인자 없으면 기본 6개(briefing_dongwan godsaeng_routine pet_dictionary study_dialogue parent_mental_care mock_interview)

import fs from 'node:fs/promises'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'output')
const FONTS_DIR = path.join(ROOT, 'server', 'fonts')

// ffmpeg-static(최신 빌드, xfade 필터 지원)을 server/node_modules 기준으로 resolve.
// xfade 는 ffmpeg 4.3+ 필요 — @ffmpeg-installer 의 2018 빌드엔 없어 ffmpeg-static 으로 교체했다.
const serverRequire = createRequire(path.join(ROOT, 'server', 'index.js'))
const ffmpegPath = serverRequire('ffmpeg-static')

// ---- env 로딩 (server/.env → .env.local → client/.env.local) ----
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
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const VIDEOS_BUCKET = 'extraction-videos'
if (!HEYGEN_API_KEY) { console.error('HEYGEN_API_KEY / VITE_HEYGEN_API_KEY 없음'); process.exit(1) }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음'); process.exit(1) }

const DEFAULT_CONCEPTS = ['briefing_dongwan', 'godsaeng_routine', 'pet_dictionary', 'study_dialogue', 'parent_mental_care', 'mock_interview']
// --avatar-iv: HeyGen Avatar IV 모델 사용 (립싱크·표정 더 자연스러움, 표준 엔드포인트 컨셉에만 적용).
const ARGS = process.argv.slice(2).filter(Boolean)
const USE_AVATAR_IV = ARGS.includes('--avatar-iv')
const CONCEPT_ARGS = ARGS.filter((a) => !a.startsWith('--'))
const CONCEPT_IDS = CONCEPT_ARGS.length ? CONCEPT_ARGS : DEFAULT_CONCEPTS

// 컨셉별 해시태그 (대략)
const CONCEPT_HASHTAGS = {
  briefing_dongwan: ['#Shorts', '#입시', '#입시정보', '#수능', '#N수생', '#대학입시', '#고등학생', '#입시전략'],
  godsaeng_routine: ['#Shorts', '#갓생', '#공부자극', '#공부루틴', '#스터디', '#study', '#고등학생', '#집중력'],
  pet_dictionary: ['#Shorts', '#입시용어', '#수시', '#입시', '#고등학생', '#입시정보', '#대학입시', '#공부'],
  study_dialogue: ['#Shorts', '#공부법', '#공부스타일', '#스터디', '#고등학생', '#공부자극', '#study', '#학습법'],
  parent_mental_care: ['#Shorts', '#학부모', '#수능', '#입시맘', '#자녀교육', '#입시', '#멘탈관리', '#고3'],
  mock_interview: ['#Shorts', '#면접', '#대입면접', '#학종', '#입시', '#면접준비', '#고등학생', '#자기소개'],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- client/src/utils 모듈 import (상대 import 확장자 보정) ----
async function importModules() {
  const srcDir = path.join(ROOT, 'client', 'src', 'utils')
  const tmpDir = path.join(ROOT, '.tmp-concept-batch')
  await fs.mkdir(tmpDir, { recursive: true })
  const heygen = await fs.readFile(path.join(srcDir, 'heygenAvatars.js'), 'utf8')
  let conceptsSrc = await fs.readFile(path.join(srcDir, 'shortsVideoConcepts.js'), 'utf8')
  conceptsSrc = conceptsSrc.replace(/from\s+(['"])\.\/heygenAvatars\1/g, "from './heygenAvatars.js'")
  const agent = await fs.readFile(path.join(srcDir, 'shortsVideoAgent.js'), 'utf8')
  const ttsText = await fs.readFile(path.join(srcDir, 'shortsTtsText.js'), 'utf8')
  await fs.writeFile(path.join(tmpDir, 'heygenAvatars.js'), heygen, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoConcepts.js'), conceptsSrc, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsVideoAgent.js'), agent, 'utf8')
  await fs.writeFile(path.join(tmpDir, 'shortsTtsText.js'), ttsText, 'utf8')
  const concepts = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoConcepts.js')).href)
  const avatars = await import(pathToFileURL(path.join(tmpDir, 'heygenAvatars.js')).href)
  const agentMod = await import(pathToFileURL(path.join(tmpDir, 'shortsVideoAgent.js')).href)
  const ttsTextMod = await import(pathToFileURL(path.join(tmpDir, 'shortsTtsText.js')).href)
  return { concepts, avatars, agentMod, ttsTextMod }
}

const { concepts: conceptsMod, avatars: avatarsMod, agentMod, ttsTextMod } = await importModules()
const { findShortsVideoConcept, buildShortsConceptExtra } = conceptsMod
const { HEYGEN_AVATAR_LIST } = avatarsMod
const { buildShortsVideoAgentPrompt } = agentMod
const { buildHeygenTextVoice } = ttsTextMod
const avatarMeta = (id) => HEYGEN_AVATAR_LIST.find((a) => a.avatarId === id) || null

// 등록 아바타에 avatarGroupId 가 있으면 그룹 안 룩 중 랜덤 1개를 반환. 그 외엔 그대로.
const avatarGroupCache = new Map()
async function resolveAvatarGroupLook(avatarId) {
  if (!avatarId) return avatarId
  const entry = HEYGEN_AVATAR_LIST.find((a) => a.avatarId === avatarId)
  if (!entry?.avatarGroupId) return avatarId
  try {
    let looks = avatarGroupCache.get(entry.avatarGroupId)
    if (!looks) {
      const r = await fetch(`https://api.heygen.com/v2/avatar_group/${entry.avatarGroupId}/avatars`, {
        headers: { 'X-Api-Key': HEYGEN_API_KEY },
      })
      const d = await r.json().catch(() => ({}))
      const raw = d?.data?.avatar_list || d?.data?.avatars || (Array.isArray(d?.data) ? d.data : [])
      looks = (Array.isArray(raw) ? raw : [])
        .map((l) => l.id || l.avatar_id || l.talking_photo_id || l.image_key)
        .filter(Boolean)
      avatarGroupCache.set(entry.avatarGroupId, looks)
    }
    if (!looks.length) return avatarId
    const picked = looks[Math.floor(Math.random() * looks.length)]
    if (picked !== avatarId) console.log(`  avatar group 랜덤 룩: ${avatarId} → ${picked}`)
    return picked
  } catch {
    return avatarId
  }
}

// ---- 표준 엔드포인트 video_inputs 빌드 (배경 합성 없음) ----
function buildStandardInputs(concept, script) {
  const baseAvatarId = concept.preferredAvatarIds[0]
  const isMulti = concept.preferredAvatarIds.length > 1
  const hasSceneAvatars = !isMulti && Array.isArray(concept.sceneAvatarIds) && concept.sceneAvatarIds.length > 0
  const randomVariant = hasSceneAvatars && concept.randomVariantPerVideo === true

  let avatarIds
  if (isMulti) {
    avatarIds = concept.preferredAvatarIds
  } else if (randomVariant) {
    const picked = concept.sceneAvatarIds[Math.floor(Math.random() * concept.sceneAvatarIds.length)]
    avatarIds = [picked]
    console.log(`  randomVariantPerVideo → variant ${picked}`)
  } else if (hasSceneAvatars) {
    avatarIds = concept.sceneAvatarIds
  } else {
    avatarIds = [baseAvatarId]
  }

  const baseVoiceId = avatarMeta(baseAvatarId)?.defaultVoiceId

  // 솔로 컨셉(한 아바타가 전 씬 동일)은 나레이션을 모두 이어붙여 video_input 1개로 만든다
  // → HeyGen 이 끊김 없는 연속 테이크로 렌더(씬 전환 컷 제거). 자막은 이후 씬별로 번인.
  const canMergeSoloTake = !isMulti
    && avatarIds.length === 1
    && script.scenes.every((s) => !s?.avatarId
      && s?.layout !== 'quiz-countdown'
      && s?.layout !== 'infographic-full')
  if (canMergeSoloTake) {
    const avatarId = avatarIds[0]
    const voiceId = avatarMeta(avatarId)?.defaultVoiceId || baseVoiceId
    const mergedText = script.scenes
      .map((s) => String(s?.narration || '').trim())
      .filter(Boolean)
      .join(' ')
    const input = {
      character: { type: 'talking_photo', talking_photo_id: avatarId },
      voice: buildHeygenTextVoice(mergedText, voiceId),
    }
    if (concept.backgroundColor) input.background = { type: 'color', value: concept.backgroundColor }
    console.log(`  솔로 연속 테이크 — 씬 ${script.scenes.length}개 → video_input 1개 병합`)
    return (input.voice.input_text && input.voice.voice_id) ? [input] : []
  }

  // 씬별 분리 입력. 각 input 에 _scene(원본 씬 참조)을 달아 후처리에서 클립↔씬 매핑에 쓴다.
  // _scene 은 HeyGen 요청 전에 heygenGenerateOne 에서 제거한다.
  const inputs = []
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i]
    const avatarId = scene?.avatarId || avatarIds[i % avatarIds.length]
    const voiceId = avatarMeta(avatarId)?.defaultVoiceId || baseVoiceId
    const isCountdown = scene?.layout === 'quiz-countdown'
    const input = {
      character: { type: 'talking_photo', talking_photo_id: avatarId },
      voice: isCountdown
        ? { type: 'silence', duration: Number(scene?.duration) || 3 }
        : buildHeygenTextVoice(String(scene?.narration || '').trim(), voiceId),
    }
    if (concept.backgroundColor) input.background = { type: 'color', value: concept.backgroundColor }
    Object.defineProperty(input, '_scene', { value: scene, enumerable: false })
    inputs.push(input)
  }
  return inputs.filter((i) =>
    i.voice?.type === 'silence' ? Number(i.voice.duration) > 0 : (i.voice?.input_text && i.voice?.voice_id))
}

// ---- HeyGen ----
// video_inputs 배열을 받아 /v2/video/generate 로 1개 요청 → video_id 1개.
async function heygenGenerateOne(videoInputs) {
  const body = { video_inputs: videoInputs, dimension: { width: 720, height: 1280 } }
  if (USE_AVATAR_IV) body.use_avatar_iv_model = true
  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`generate ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  const id = data?.data?.video_id || data?.video_id
  if (!id) throw new Error('video_id 없음')
  return id
}

// 표준 엔드포인트 렌더.
//  - video_inputs 가 2개 이상(= 씬별 분리 멀티 컨셉)이면 각 input 을 개별 요청으로 보내 video_id N개.
//  - 1개(솔로 연속 테이크)면 기존대로 1개 요청.
// 반환: { videoIds: [...], perScene: boolean, sceneClips: [scene, ...] }
//   sceneClips 는 perScene 일 때만 videoIds 와 같은 순서로 각 클립의 원본 씬을 담는다.
async function heygenGenerateStandard(concept, script) {
  const videoInputs = buildStandardInputs(concept, script)
  if (!videoInputs.length) throw new Error('video_inputs 비어있음')
  if (videoInputs.length === 1) {
    return { videoIds: [await heygenGenerateOne(videoInputs)], perScene: false }
  }
  console.log(`  멀티 씬별 렌더 — ${videoInputs.length}개 클립을 개별 요청`)
  const videoIds = []
  const sceneClips = []
  for (let i = 0; i < videoInputs.length; i++) {
    const id = await heygenGenerateOne([videoInputs[i]])
    console.log(`    씬 ${i + 1}/${videoInputs.length} video_id: ${id}`)
    videoIds.push(id)
    sceneClips.push(videoInputs[i]._scene || script.scenes[i] || null)
  }
  return { videoIds, perScene: true, sceneClips }
}

async function heygenGenerateVideoAgent(concept, script) {
  const baseAvatarId = concept.preferredAvatarIds[0]
  const meta = avatarMeta(baseAvatarId)
  // avatar group 이 있으면 그룹 안 룩 중 랜덤 1개 사용 (name 은 원래 아바타 기준 유지).
  const resolvedAvatarId = await resolveAvatarGroupLook(baseAvatarId)
  const prompt = buildShortsVideoAgentPrompt({
    script,
    avatar: { id: resolvedAvatarId, kind: 'talking_photo', name: meta?.name || 'avatar' },
    extraPrompt: buildShortsConceptExtra(concept.id),
  })
  const res = await fetch('https://api.heygen.com/v1/video_agent/generate', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, config: { avatar_id: resolvedAvatarId } }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`video_agent ${res.status}: ${JSON.stringify(data).slice(0, 400)}`)
  return data?.data?.video_id || data?.data?.id || data?.video_id || data?.id
}

async function heygenPoll(videoId) {
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`status ${res.status}`)
  return data?.data || {}
}

// ---- 자막 번인 (server/index.js /api/subtitle/burn 복제) ----
// 한 문장 = 한 자막 블록(1~2줄). 너무 긴 문장은 두 블록으로 분할.
function splitIntoSentences(text) {
  const source = String(text || '').replace(/\r/g, '').trim()
  if (!source) return []
  const result = []
  let buf = ''
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (ch === '\n') {
      const t = buf.trim()
      if (t) result.push(t)
      buf = ''
      continue
    }
    buf += ch
    if (!/[.!?。！？]/.test(ch)) continue
    // 12.3, 1.5GB 같은 소수점은 문장 끝이 아니다.
    if (ch === '.' && /[0-9]/.test(source[i - 1] || '') && /[0-9]/.test(source[i + 1] || '')) continue
    const t = buf.trim()
    if (t) result.push(t)
    buf = ''
  }
  const tail = buf.trim()
  if (tail) result.push(tail)
  return result
}

function splitSentenceToLines(sentence, maxCharsPerLine) {
  const s = String(sentence || '').trim()
  if (!s) return []
  if (s.length <= maxCharsPerLine) return [s]
  const target = Math.ceil(s.length / 2)
  const search = Math.max(2, Math.floor(maxCharsPerLine / 2))
  let cut = -1
  for (let span = 0; span <= search; span++) {
    const r = target + span
    if (r > 0 && r < s.length && /[,，、\s]/.test(s[r])) { cut = r + 1; break }
    const l = target - span
    if (l > 0 && l < s.length && /[,，、\s]/.test(s[l])) { cut = l + 1; break }
  }
  if (cut === -1) cut = target
  return [s.slice(0, cut).trim(), s.slice(cut).trim()].filter(Boolean)
}

function buildBlocksForSentence(sentence, maxCharsPerLine) {
  const s = String(sentence || '').trim()
  if (!s) return []
  if (s.length <= maxCharsPerLine * 2) {
    return [splitSentenceToLines(s, maxCharsPerLine).join('\n')]
  }
  const mid = Math.ceil(s.length / 2)
  const search = maxCharsPerLine
  let cut = -1
  for (let span = 0; span <= search; span++) {
    const r = mid + span
    if (r > 0 && r < s.length && /[,，、\s]/.test(s[r])) { cut = r + 1; break }
    const l = mid - span
    if (l > 0 && l < s.length && /[,，、\s]/.test(s[l])) { cut = l + 1; break }
  }
  if (cut === -1) cut = mid
  return [
    splitSentenceToLines(s.slice(0, cut).trim(), maxCharsPerLine).join('\n'),
    splitSentenceToLines(s.slice(cut).trim(), maxCharsPerLine).join('\n'),
  ].filter(Boolean)
}

function buildSubtitleBlocks(text, maxCharsPerLine) {
  const sentences = splitIntoSentences(text)
  if (sentences.length === 0) return []
  const blocks = []
  for (const sentence of sentences) {
    for (const block of buildBlocksForSentence(sentence, maxCharsPerLine)) {
      if (block) blocks.push(block)
    }
  }
  return blocks
}

// 호환용 — 외부에서 splitNarration 을 직접 호출하던 곳은 없지만 시그니처만 유지.
function splitNarration(text, maxCharsPerLine = 18) {
  const chunks = []
  let remaining = String(text || '').trim()
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) { chunks.push(remaining); break }
    let cut = -1
    for (let i = Math.min(maxCharsPerLine, remaining.length) - 1; i >= Math.floor(maxCharsPerLine * 0.5); i--) {
      if (/[.!?。！？、，,\s]/.test(remaining[i])) { cut = i + 1; break }
    }
    if (cut === -1) cut = maxCharsPerLine
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  return chunks
}

const subtitleFontConfigs = {
  // marginV 40: 영상 하단에서 ~40px 위 — 쇼츠/릴스 하단 UI 위쪽 안전 영역.
  default: { fontName: 'Pretendard Variable', fontSize: 10, marginV: 40, bold: 0, italic: 0, spacing: 0 },
  bold: { fontName: 'A2z', fontSize: 10.8, marginV: 40, bold: -1, italic: 0, spacing: 0.2 },
  dongle: { fontName: 'TmoneyRoundWind', fontSize: 11.2, marginV: 40, bold: 0, italic: 0, spacing: 0 },
  handwriting: { fontName: 'Maplestory', fontSize: 10.4, marginV: 40, bold: 0, italic: 0, spacing: 0.05 },
  gothic: { fontName: 'KBODiaGothic', fontSize: 10.2, marginV: 40, bold: 0, italic: 0, spacing: 0.35 },
}
const getSubtitleFontConfig = (k) => subtitleFontConfigs[k] || subtitleFontConfigs.default
function getForceStyle(style, fontKey = 'default') {
  const font = getSubtitleFontConfig(fontKey)
  const base = [
    `FontName=${font.fontName}`, `FontSize=${font.fontSize}`, 'Alignment=2',
    `MarginV=${font.marginV}`, `Bold=${font.bold}`, `Italic=${font.italic}`, `Spacing=${font.spacing}`,
  ].join(',')
  const styles = {
    classic: `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,BorderStyle=3,BackColour=&HB0000000,Shadow=0`,
    classic2: `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=0.8,BorderStyle=1,Shadow=0`,
  }
  return styles[style] || styles.classic
}

function measureDuration(inputPath, fallback) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-i', inputPath], { timeout: 10000 }, (err, stdout, stderr) => {
      const m = (stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
      if (m) resolve(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100)
      else resolve(fallback)
    })
  })
}

// ---- 트림 + 크로스페이드 (멀티 씬별 클립 후처리) ----
// 크로스페이드 연결을 위해 모든 클립을 동일 코덱/해상도/fps(libx264·yuv420p·720x1280·30fps·aac 44100) 로 통일.
const XFADE_DUR = 0.3 // 씬 전환 크로스페이드 길이(초)
const TRIM_PAD = 0.12 // 입 다문 프레임 확보용 여유(초)
const MIN_TAIL_SILENCE = 0.2 // 끝 무음이 이보다 짧으면 트림 생략(초)

// ffmpeg silencedetect 로 끝부분 무음을 분석해 트림 지점 T 를 계산.
// 반환: { fullDuration, trimAt, tailSilence }
function analyzeTailSilence(inputPath, fallbackDur) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, [
      '-i', inputPath,
      '-af', 'silencedetect=noise=-30dB:d=0.25',
      '-f', 'null', '-',
    ], { timeout: 60000 }, (err, stdout, stderr) => {
      const log = stderr || ''
      const durM = log.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
      const fullDuration = durM
        ? parseInt(durM[1]) * 3600 + parseInt(durM[2]) * 60 + parseInt(durM[3]) + parseInt(durM[4]) / 100
        : fallbackDur
      // silence_start / silence_end 쌍을 시간순으로 수집
      const events = []
      const re = /silence_(start|end):\s*([0-9.]+)/g
      let m
      while ((m = re.exec(log)) !== null) events.push({ type: m[1], t: parseFloat(m[2]) })
      // 마지막 silence_start 를 찾는다
      let lastStart = null
      let lastStartIdx = -1
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === 'start') { lastStart = events[i].t; lastStartIdx = i; break }
      }
      // 끝부분 무음 = 마지막 silence_start 이후 영상 끝까지 이어지는 무음.
      // 그 뒤에 silence_end 가 없거나, silence_end 가 영상 끝과 거의 같으면(0.15s 이내) 끝 무음으로 본다.
      let tailSilence = 0
      let trimAt = fullDuration
      if (lastStart !== null) {
        const endAfter = events.slice(lastStartIdx + 1).find((e) => e.type === 'end')
        const isTail = !endAfter || (fullDuration - endAfter.t) <= 0.15
        if (isTail) {
          tailSilence = fullDuration - lastStart
          if (tailSilence >= MIN_TAIL_SILENCE) {
            trimAt = Math.min(fullDuration, lastStart + TRIM_PAD)
          }
        }
      }
      resolve({ fullDuration, trimAt, tailSilence })
    })
  })
}

// 클립 1개를 트림 + 표준 인코딩으로 변환 (씬 전환은 crossfadeClips 의 xfade 가 담당).
//  - skipTrim 이 true (quiz-countdown 무음 씬 등) 면 트림 없이 인코딩 표준화만.
// 반환: { finalDur(트림 후 길이), fullDuration, trimAt, tailSilence }
async function trimClip(inputPath, outputPath, fallbackDur, skipTrim) {
  let trimAt
  let fullDuration
  let tailSilence = 0
  if (skipTrim) {
    fullDuration = await measureDuration(inputPath, fallbackDur)
    trimAt = fullDuration
  } else {
    const a = await analyzeTailSilence(inputPath, fallbackDur)
    fullDuration = a.fullDuration
    trimAt = a.trimAt
    tailSilence = a.tailSilence
  }
  const T = trimAt.toFixed(3)
  // freeze 없이 트림 + 표준 인코딩만. 씬 전환은 crossfadeClips 의 xfade 가 담당한다.
  const args = [
    '-i', inputPath,
    '-vf', `trim=0:${T},setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:white,fps=30`,
    '-af', `atrim=0:${T},asetpts=PTS-STARTPTS`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    '-y', outputPath,
  ]
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`trim FFmpeg: ${err.message}\n${(stderr || '').slice(-400)}`))
      else resolve()
    })
  })
  const finalDur = await measureDuration(outputPath, trimAt)
  return { finalDur, fullDuration, trimAt, tailSilence }
}

// 클립들을 xfade(비디오)·acrossfade(오디오)로 크로스페이드 연결한다.
// clipLens 는 각 클립의 실제 길이(초) — xfade offset 누적 계산에 필요.
// 전환마다 XFADE_DUR 만큼 겹치므로 최종 길이 = sum(clipLens) - (N-1)*XFADE_DUR.
// 반환: 최종 영상 길이(초).
async function crossfadeClips(clipPaths, clipLens, outputPath) {
  const D = XFADE_DUR
  const n = clipPaths.length
  if (n === 1) {
    await fs.copyFile(clipPaths[0], outputPath)
    return clipLens[0]
  }
  // xfade offset = "직전까지 합쳐진 스트림에서 전환이 시작되는 시각" = mergedLen - D.
  const parts = []
  let vIn = '[0:v]'
  let aIn = '[0:a]'
  let mergedLen = clipLens[0]
  for (let k = 1; k < n; k++) {
    const offset = (mergedLen - D).toFixed(3)
    const last = k === n - 1
    const vOut = last ? '[vout]' : `[vx${k}]`
    const aOut = last ? '[aout]' : `[ax${k}]`
    parts.push(`${vIn}[${k}:v]xfade=transition=fade:duration=${D}:offset=${offset}${vOut}`)
    parts.push(`${aIn}[${k}:a]acrossfade=d=${D}${aOut}`)
    mergedLen = mergedLen + clipLens[k] - D
    vIn = vOut
    aIn = aOut
  }
  const args = [
    ...clipPaths.flatMap((p) => ['-i', p]),
    '-filter_complex', parts.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    '-y', outputPath,
  ]
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`crossfade FFmpeg: ${err.message}\n${(stderr || '').slice(-500)}`))
      else resolve()
    })
  })
  return mergedLen
}

// 클립들을 크로스페이드 없이 단순 이어붙인다 (컷 전환).
// 모든 클립이 동일 인코딩이라 concat 필터로 합친다. 반환: 최종 길이 = clipLens 합.
async function concatClips(clipPaths, clipLens, outputPath) {
  const n = clipPaths.length
  if (n === 1) {
    await fs.copyFile(clipPaths[0], outputPath)
    return clipLens[0]
  }
  const streams = clipPaths.map((_, i) => `[${i}:v][${i}:a]`).join('')
  const args = [
    ...clipPaths.flatMap((p) => ['-i', p]),
    '-filter_complex', `${streams}concat=n=${n}:v=1:a=1[vout][aout]`,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    '-y', outputPath,
  ]
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`concat FFmpeg: ${err.message}\n${(stderr || '').slice(-500)}`))
      else resolve()
    })
  })
  return clipLens.reduce((s, d) => s + d, 0)
}

// scenes 와 (선택) sceneDurations(클립별 실제 길이)·crossfadeDur 로 SRT 생성.
// sceneDurations 가 주어지면 각 씬 자막 구간을 그 길이로 정확히 매핑하고,
// 없으면 글자 수 비율로 전체 duration 을 분배(기존 동작).
// crossfadeDur 가 있으면 씬 전환마다 그만큼 겹치므로 씬 진행/자막 구간을 (길이-crossfadeDur)로 잡는다.
function buildSrt(scenes, duration, sceneDurations, crossfadeDur) {
  const maxCharsPerLine = 14
  const totalChars = scenes.reduce((sum, s) => sum + (s.narration || '').length, 0) || 1
  const fmt = (t) => {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60)
    const s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }
  const useActual = Array.isArray(sceneDurations) && sceneDurations.length === scenes.length
  const xf = useActual ? (Number(crossfadeDur) || 0) : 0
  let srt = ''
  let idx = 1
  let currentTime = 0
  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si]
    const narration = String(scene.narration || '')
    // 시간 계산은 narration(TTS 길이) 기준. 화면 표시 텍스트는 caption 이 있으면 그걸 쓴다
    // (caption: 숫자·기호 원본 표기. narration: TTS 발음용 한글 표기).
    const captionText = String(scene.caption || '').trim() || narration
    const sceneDur = useActual ? sceneDurations[si] : (narration.length / totalChars) * duration
    // 크로스페이드 겹침(xf)을 빼서 씬 진행 간격·자막 구간을 잡는다 (전환 구간엔 자막 미배치).
    // 무음/빈 씬도 시간축에서 건너뛰어야 자막이 밀리지 않는다.
    const span = useActual ? Math.max(0.1, sceneDur - xf) : sceneDur
    if (!narration.trim()) { currentTime += span; continue }
    const blocks = buildSubtitleBlocks(captionText, maxCharsPerLine)
    const blockChars = blocks.map((b) => b.replace(/\n/g, '').length)
    const blockTotalChars = blockChars.reduce((s, c) => s + c, 0) || 1
    let sceneCursor = currentTime
    for (let b = 0; b < blocks.length; b++) {
      const blockDur = (blockChars[b] / blockTotalChars) * span
      srt += `${idx++}\n${fmt(sceneCursor)} --> ${fmt(sceneCursor + blockDur)}\n${blocks[b]}\n\n`
      sceneCursor += blockDur
    }
    currentTime += span
  }
  return srt
}

async function burnSubtitles(inputPath, scenes, outputPath, ts, sceneDurations, crossfadeDur) {
  const fallback = scenes.reduce((s, sc) => s + (Number(sc.duration) || 5), 0)
  const duration = await measureDuration(inputPath, fallback)
  const srtPath = path.join(OUT_DIR, `subtitle_${ts}.srt`)
  writeFileSync(srtPath, buildSrt(scenes, duration, sceneDurations, crossfadeDur), 'utf8')

  const srtEsc = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
  const fontsEsc = FONTS_DIR.replace(/\\/g, '/').replace(/:/g, '\\:')
  const forceStyle = getForceStyle('classic', 'default')

  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-i', inputPath,
      '-vf', `subtitles='${srtEsc}':fontsdir='${fontsEsc}':force_style='${forceStyle}'`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2',
      '-c:a', 'copy', '-y', outputPath,
    ], { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`FFmpeg: ${err.message}\n${(stderr || '').slice(-400)}`))
      else resolve()
    })
  })
  return { srtPath, duration }
}

// ---- Supabase ----
async function uploadToStorage(buffer, objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${VIDEOS_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY,
      'Content-Type': 'video/mp4', 'x-upsert': 'true',
    },
    body: buffer,
  })
  if (!res.ok) throw new Error(`Storage ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return `${SUPABASE_URL}/storage/v1/object/public/${VIDEOS_BUCKET}/${objectPath}`
}

async function insertExtraction(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/extractions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`insert ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return Array.isArray(data) ? data[0] : data
}

// ---- main ----
async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  console.log(`대상 컨셉 ${CONCEPT_IDS.length}개: ${CONCEPT_IDS.join(', ')}`)
  console.log(`엔진: ${USE_AVATAR_IV ? 'HeyGen Avatar IV (use_avatar_iv_model)' : '표준 토킹포토'}\n`)

  // Phase 1: HeyGen 생성 요청
  // job.videoIds: video_id 배열 (솔로/Video Agent 는 [id], 멀티 씬별은 [id, id, ...]).
  // job.perScene: 멀티 씬별 분리 렌더 여부 (true 면 클립별 트림 + 크로스페이드 후처리).
  const jobs = []
  for (const id of CONCEPT_IDS) {
    const concept = findShortsVideoConcept(id)
    if (!concept?.testScript?.scenes?.length) { console.error(`[${id}] 컨셉/testScript 없음 — 건너뜀`); continue }
    const script = concept.testScript
    const useStandard = concept.preferredAvatarIds.length > 1 || concept.useStandardEndpoint === true
    try {
      console.log(`[${id}] ${concept.label} — ${useStandard ? '표준' : 'Video Agent'} (씬 ${script.scenes.length}개)`)
      let videoIds
      let perScene = false
      let sceneClips = null
      if (useStandard) {
        const r = await heygenGenerateStandard(concept, script)
        videoIds = r.videoIds
        perScene = r.perScene
        sceneClips = r.sceneClips || null
      } else {
        const vid = await heygenGenerateVideoAgent(concept, script)
        if (!vid) throw new Error('video_id 없음')
        videoIds = [vid]
      }
      if (!videoIds.length) throw new Error('video_id 없음')
      console.log(`  video_ids: ${videoIds.join(', ')}${perScene ? ' (씬별)' : ''}\n`)
      jobs.push({ id, concept, script, videoIds, perScene, sceneClips, status: 'pending', startedAt: Date.now() })
    } catch (e) {
      console.error(`  생성 실패: ${e.message}\n`)
      jobs.push({ id, status: 'create_failed', error: e.message })
    }
  }

  // Phase 2: 폴링
  // job 의 모든 videoId 를 폴링. 모두 completed → rendered, 하나라도 failed → render_failed.
  // 각 videoId 의 video_url 을 videoUrls 배열에 순서대로 보관.
  const pending = jobs.filter((j) => Array.isArray(j.videoIds) && j.videoIds.length)
  for (const job of pending) job.videoUrls = new Array(job.videoIds.length).fill(null)
  if (pending.length) {
    console.log(`폴링 시작 (20초 간격, 최대 20분)\n`)
    const maxWait = 20 * 60 * 1000
    while (pending.some((j) => j.status === 'pending')) {
      await sleep(20000)
      for (const job of pending.filter((j) => j.status === 'pending')) {
        try {
          const states = []
          for (let i = 0; i < job.videoIds.length; i++) {
            if (job.videoUrls[i]) { states.push('completed'); continue }
            const st = await heygenPoll(job.videoIds[i])
            if (st.status === 'completed') { job.videoUrls[i] = st.video_url; states.push('completed') }
            else if (st.status === 'failed') {
              states.push('failed')
              job.error = st.error?.message || JSON.stringify(st.error)
            } else {
              states.push(st.status || 'processing')
            }
          }
          const el = ((Date.now() - job.startedAt) / 1000).toFixed(0)
          const doneCount = states.filter((s) => s === 'completed').length
          if (states.includes('failed')) {
            job.status = 'render_failed'
            console.log(`  ❌ [${job.id}] 렌더 실패: ${job.error}`)
          } else if (states.every((s) => s === 'completed')) {
            job.status = 'rendered'
            console.log(`  ✅ [${job.id}] 렌더 완료 (${doneCount}/${states.length} 클립, ${el}s)`)
          } else if (Date.now() - job.startedAt > maxWait) {
            job.status = 'timeout'
            console.log(`  ⏰ [${job.id}] 타임아웃`)
          } else {
            console.log(`  ⏳ [${job.id}] ${doneCount}/${states.length} 완료 (${el}s)`)
          }
        } catch (e) {
          console.log(`  ⚠️ [${job.id}] 폴링 에러: ${e.message}`)
        }
      }
    }
  }

  // Phase 3: (멀티 씬별이면 트림 + 크로스페이드) → 자막 번인 → 업로드 → DB 저장 (순차)
  console.log('\n후처리 + 자막 번인 + 업로드 + DB 저장\n')
  for (const job of jobs.filter((j) => j.status === 'rendered')) {
    const { id, concept, script, videoIds, videoUrls, perScene, sceneClips } = job
    const tmpFiles = []
    try {
      const ts = Date.now()
      console.log(`[${id}] 처리 중...`)
      let rawPath          // 자막 번인 입력 (concat 결과 또는 단일 원본)
      let sceneDurations   // perScene 일 때 클립별 실제 길이(초) — 자막 정밀 매핑용
      const finalPath = path.join(OUT_DIR, `concept_${id}_${ts}.mp4`)

      if (perScene) {
        // 멀티 씬별: 각 클립 다운로드 → 트림 → 크로스페이드 연결
        console.log(`  씬별 ${videoUrls.length}개 클립 후처리`)
        const processedClips = []
        sceneDurations = []
        for (let i = 0; i < videoUrls.length; i++) {
          const url = videoUrls[i]
          const scene = sceneClips?.[i] || script.scenes[i] || {}
          const dl = await fetch(url)
          if (!dl.ok) throw new Error(`클립 ${i + 1} 다운로드 ${dl.status}`)
          const clipRaw = path.join(OUT_DIR, `heygen_clip_${id}_${ts}_${i}.mp4`)
          writeFileSync(clipRaw, Buffer.from(await dl.arrayBuffer()))
          tmpFiles.push(clipRaw)
          // quiz-countdown(무음 씬)은 원래 무음 → 트림 생략, 인코딩 표준화만.
          const skipTrim = scene?.layout === 'quiz-countdown'
          const clipOut = path.join(OUT_DIR, `heygen_clip_${id}_${ts}_${i}_p.mp4`)
          const fallbackDur = Number(scene?.duration) || 5
          const { finalDur, fullDuration, trimAt, tailSilence } =
            await trimClip(clipRaw, clipOut, fallbackDur, skipTrim)
          tmpFiles.push(clipOut)
          processedClips.push(clipOut)
          sceneDurations.push(finalDur)
          const trimmed = fullDuration - trimAt
          console.log(`    씬 ${i + 1}: 원본 ${fullDuration.toFixed(2)}s → 트림 ${trimmed > 0.01 ? `-${trimmed.toFixed(2)}s` : '없음'}` +
            ` (끝무음 ${tailSilence.toFixed(2)}s) → ${finalDur.toFixed(2)}s`)
        }
        // 씬 연결 — 컨셉이 sceneTransition:'cut' 이면 단순 컷 concat, 아니면 크로스페이드.
        const useCut = concept.sceneTransition === 'cut'
        rawPath = path.join(OUT_DIR, `heygen_join_${id}_${ts}.mp4`)
        const joinTotal = useCut
          ? await concatClips(processedClips, sceneDurations, rawPath)
          : await crossfadeClips(processedClips, sceneDurations, rawPath)
        tmpFiles.push(rawPath)
        console.log(`  ${useCut ? '컷 전환' : '크로스페이드'} 연결 완료 — ${processedClips.length}개 클립, 최종 ${joinTotal.toFixed(2)}s`)
      } else {
        // 솔로 연속 테이크 / Video Agent: 단일 원본 다운로드 (기존 동작)
        const dl = await fetch(videoUrls[0])
        if (!dl.ok) throw new Error(`다운로드 ${dl.status}`)
        rawPath = path.join(OUT_DIR, `heygen_raw_${id}_${ts}.mp4`)
        writeFileSync(rawPath, Buffer.from(await dl.arrayBuffer()))
        tmpFiles.push(rawPath)
      }

      // 자막 번인 (perScene 이면 클립별 실제 길이로 정밀 매핑). 크로스페이드 컨셉만 겹침(XFADE_DUR) 반영.
      const subtitleXfade = (perScene && concept.sceneTransition !== 'cut') ? XFADE_DUR : 0
      const { srtPath, duration } = await burnSubtitles(rawPath, script.scenes, finalPath, ts, sceneDurations, subtitleXfade)
      const finalBuf = await fs.readFile(finalPath)
      console.log(`  자막 번인 완료 (${duration.toFixed(1)}s, ${(finalBuf.length / 1024 / 1024).toFixed(1)}MB)`)

      // Supabase 업로드
      const publicUrl = await uploadToStorage(finalBuf, `shorts_${id}_${ts}.mp4`)

      // DB 저장
      const shortsScript = {
        ...script,
        uploadTitle: (script.title.includes('#Shorts') ? script.title : `${script.title} #Shorts`).slice(0, 100),
        uploadDescription: [script.hook, ...script.scenes.map((s) => s.narration).filter(Boolean), script.cta]
          .filter(Boolean).join('\n'),
        hashtags: CONCEPT_HASHTAGS[id] || ['#Shorts'],
      }
      const inserted = await insertExtraction({
        file_name: `숏폼 컨셉 테스트 - ${concept.label}`,
        summary: null, blog_content: null, newsletter_content: null, instagram_content: null,
        shorts_script: shortsScript,
        blog_images: null, instagram_images: null,
        // heygenVideoId: 기존 키 구조 유지 위해 첫 video_id. 멀티는 heygenVideoIds 에 전체 배열.
        shorts_video: {
          url: publicUrl, videoUrl: publicUrl, combinedVideoUrl: publicUrl,
          heygenVideoId: videoIds[0],
          ...(videoIds.length > 1 ? { heygenVideoIds: videoIds } : {}),
          subtitleStatus: 'done',
        },
        upload_status: {},
        parsed_text: null,
      })
      job.status = 'saved'
      job.extractionId = inserted?.id
      job.publicUrl = publicUrl
      console.log(`  ✅ DB 저장 — extraction id: ${inserted?.id}\n`)
      // 임시 파일 정리 (자막 입힌 최종본은 output/ 에 남김)
      for (const f of tmpFiles) { try { await fs.unlink(f) } catch {} }
      try { await fs.unlink(srtPath) } catch {}
    } catch (e) {
      job.status = 'save_failed'
      job.error = e.message
      console.error(`  ❌ [${id}] 실패: ${e.message}\n`)
      for (const f of tmpFiles) { try { await fs.unlink(f) } catch {} }
    }
  }

  // tmp 정리
  try { await fs.rm(path.join(ROOT, '.tmp-concept-batch'), { recursive: true, force: true }) } catch {}

  // 요약
  console.log('=== 결과 요약 ===')
  for (const j of jobs) {
    if (j.status === 'saved') console.log(`  ✅ ${j.id} — extraction ${j.extractionId}`)
    else console.log(`  ❌ ${j.id} — ${j.status}${j.error ? ` (${j.error})` : ''}`)
  }
  const ok = jobs.filter((j) => j.status === 'saved')
  console.log(`\n완료: ${ok.length}/${jobs.length}개 DB 저장`)
}

// CLI 로 직접 실행될 때만 main 을 돌린다 (다른 스크립트에서 import 시엔 export 함수만 재사용).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => { console.error('\n치명적 오류:', err.message); process.exit(1) })
}

export { buildHeygenTextVoice, heygenGenerateOne, heygenPoll, trimClip, crossfadeClips, burnSubtitles, uploadToStorage, OUT_DIR, XFADE_DUR }

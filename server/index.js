import 'dotenv/config'
import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { execFile } from 'child_process'
import crypto from 'crypto'
import { publishInstagramMediaWithRetry } from './services/instagram-publish.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '.env.local') })

const require = createRequire(import.meta.url)
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const sharp = require('sharp')
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas')
const {
  ensureSupabaseConfigured,
  saveExtraction,
  updateExtractionMedia,
  updateExtractionContent,
  listExtractions,
  fetchExtractionById,
  updateUploadStatus,
  deleteExtraction,
  deleteExtractionChannel,
} = require('../api/_lib/extractionsStore')
const authRouter = require('../api/_lib/auth')
const fontsDir = path.join(__dirname, 'fonts')

function registerOptionalFont(filename, family) {
  const fontPath = path.join(fontsDir, filename)
  if (!fs.existsSync(fontPath)) return

  try {
    GlobalFonts.registerFromPath(fontPath, family)
  } catch (error) {
    console.warn(`[fonts] Failed to register ${filename} as ${family}: ${error.message}`)
  }
}

registerOptionalFont('PretendardVariable.ttf', 'Pretendard')
registerOptionalFont('Maplestory-Bold.ttf', 'Maplestory')
registerOptionalFont('TmoneyRoundWind-Regular.ttf', 'TmoneyRoundWind')
registerOptionalFont('KBODiaGothic-Light.ttf', 'KBODiaGothic')
registerOptionalFont('A2z-Bold.ttf', 'A2z')

function getLlamaParseApiKey() {
  return process.env.LLAMAPARSE_API_KEY
}

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODEL_NAME_PATTERN = /^gemini-[a-z0-9._-]+$/i

function getServerGeminiApiKey() {
  return String(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim()
}

function sanitizeGeminiPayload(body) {
  const payload = {}

  if (Array.isArray(body.contents)) payload.contents = body.contents
  if (body.generationConfig && typeof body.generationConfig === 'object') payload.generationConfig = body.generationConfig
  if (Array.isArray(body.safetySettings)) payload.safetySettings = body.safetySettings
  if (Array.isArray(body.tools)) payload.tools = body.tools
  if (body.toolConfig && typeof body.toolConfig === 'object') payload.toolConfig = body.toolConfig
  if (body.systemInstruction && typeof body.systemInstruction === 'object') payload.systemInstruction = body.systemInstruction

  return payload
}

const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

const app = express()

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || null
app.use(cors({
  origin: allowedOrigins || true,
  credentials: true,
}))

function getExpectedRequestOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()
  if (!host) return null
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').trim()
  return `${protocol}://${host}`
}

function getRequestOrigin(req) {
  try {
    if (req.headers.origin) {
      return new URL(String(req.headers.origin)).origin
    }
    if (req.headers.referer) {
      return new URL(String(req.headers.referer)).origin
    }
  } catch {
    return null
  }
  return null
}

function hasValidApiSecret(req) {
  const expected = String(process.env.API_SECRET || '').trim()
  if (!expected) return true

  const providedAppSecret = String(req.headers['x-app-secret'] || '').trim()
  const providedApiSecret = String(req.headers['x-api-secret'] || '').trim()
  return providedAppSecret === expected || providedApiSecret === expected
}

function isAuthorizedBrowserRequest(req) {
  const requestOrigin = getRequestOrigin(req)
  const expectedOrigin = getExpectedRequestOrigin(req)

  if (requestOrigin && expectedOrigin && requestOrigin === expectedOrigin) {
    return true
  }
  if (requestOrigin && Array.isArray(allowedOrigins) && allowedOrigins.includes(requestOrigin)) {
    return true
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase()
  return fetchSite === 'same-origin' || fetchSite === 'same-site'
}

function isAuthorizedApiRequest(req) {
  return hasValidApiSecret(req) || isAuthorizedBrowserRequest(req)
}

// JSON body for most routes except large multipart uploads.
app.use((req, res, next) => {
  if (req.path === '/api/llamaparse/upload') return next()
  if (req.path === '/api/output/upload') return next()
  if (req.path === '/api/output/save') return next()
  express.json({ limit: '150mb' })(req, res, next)
})

// API secret middleware for protected /api routes.
// Public OAuth callback routes stay open so external providers can redirect back.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  if (req.path === '/api/youtube/oauth/callback') return next()
  if (req.path === '/api/youtube/auth-url') return next()
  if (req.path === '/api/youtube/auth-status') return next()
  if (req.path === '/api/instagram/oauth/callback') return next()
  if (!String(process.env.API_SECRET || '').trim()) return next() // Allow local development when no secret is configured.
  if (!isAuthorizedApiRequest(req)) {
    console.log(`[AUTH FAIL] path=${req.path} origin=${req.headers.origin || '-'} referer=${req.headers.referer || '-'} site=${req.headers['sec-fetch-site'] || '-'}`)
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

app.use('/api/auth', authRouter)

// LlamaParse Proxy - Upload (forward multipart as-is)
app.post('/api/llamaparse/upload', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const apiKey = getLlamaParseApiKey()
      if (!apiKey) return res.status(500).json({ error: 'LLAMAPARSE_API_KEY not configured on server' })
      const body = Buffer.concat(chunks)
      const response = await fetch('https://api.cloud.llamaindex.ai/api/v1/parsing/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': req.headers['content-type'],
        },
        body,
      })
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json(data)
      res.json(data)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
})

// LlamaParse Proxy - Job Status
app.get('/api/llamaparse/job/:jobId', async (req, res) => {
  try {
    const apiKey = getLlamaParseApiKey()
    if (!apiKey) return res.status(500).json({ error: 'LLAMAPARSE_API_KEY not configured on server' })
    const response = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${req.params.jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// LlamaParse Proxy - Job Result
app.get('/api/llamaparse/job/:jobId/result/markdown', async (req, res) => {
  try {
    const apiKey = getLlamaParseApiKey()
    if (!apiKey) return res.status(500).json({ error: 'LLAMAPARSE_API_KEY not configured on server' })
    const response = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${req.params.jobId}/result/markdown`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Gemini Proxy - Generate Content
app.post('/api/gemini/generate-content', async (req, res) => {
  const apiKey = getServerGeminiApiKey()
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY or GEMINI_API_KEY is not configured on the server.' })
  }

  const model = String(req.body?.model || '').trim()
  if (!GEMINI_MODEL_NAME_PATTERN.test(model)) {
    return res.status(400).json({ error: 'A valid Gemini model name is required.' })
  }

  const payload = sanitizeGeminiPayload(req.body || {})
  if (!Array.isArray(payload.contents) || payload.contents.length === 0) {
    return res.status(400).json({ error: 'contents is required.' })
  }

  try {
    const response = await fetch(`${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    const contentType = response.headers.get('content-type') || 'application/json'

    res.status(response.status)
    res.setHeader('Content-Type', contentType)
    return res.send(responseText)
  } catch (error) {
    return res.status(500).json({
      error: 'Gemini proxy request failed.',
      message: error.message,
    })
  }
})


// ===== Output File Saving =====
app.post('/api/output/save', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const { filename, data, encoding } = body
      const outputDir = path.join(__dirname, '..', 'output')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

      const sanitized = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      const filePath = path.join(outputDir, sanitized)

      if (encoding === 'base64') {
        fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
      } else {
        fs.writeFileSync(filePath, data, 'utf8')
      }

      res.json({ path: filePath, size: fs.statSync(filePath).size })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
})

// ===== HeyGen Voices Proxy =====
app.get('/api/heygen/voices', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v2/voices', {
      headers: { 'X-Api-Key': apiKey },
    })
    if (!response.ok) {
      const errText = await response.text()
      return res.status(response.status).json({ error: errText })
    }
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen "My Voices" — 본인 계정 voice 만 필터해서 반환 =====
// /v2/voices 는 공용 voice 도 함께 반환한다. 응답 객체에 보통 voice_type / is_public
// 같은 단서 필드가 있으므로 그걸로 본인 voice 만 추린다.
// HeyGen 응답 스키마가 바뀌어 휴리스틱이 깨지면 결과가 비어 보일 수 있다.
// 그 경우 ?debug=1 쿼리로 raw 응답의 첫 항목을 함께 반환해 필터 키를 재조정한다.
app.get('/api/heygen/my-voices', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  const debug = req.query?.debug === '1'
  try {
    const response = await fetch('https://api.heygen.com/v2/voices', {
      headers: { 'X-Api-Key': apiKey },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) return res.status(response.status).json({ error: 'voices fetch failed', detail: data })

    const rawVoices = data?.data?.voices || data?.voices || []
    const myVoices = rawVoices.filter((v) => {
      if (!v) return false
      if (v.is_public === true) return false
      if (typeof v.voice_type === 'string' && /public/i.test(v.voice_type)) return false
      if (typeof v.voice_type === 'string' && /(clone|user|private|custom|mine)/i.test(v.voice_type)) return true
      if (v.is_public === false) return true
      // 단서 없으면 공용으로 간주해 제외 (보수적 필터)
      return false
    })

    res.json({
      voices: myVoices.map((v) => ({
        voice_id: v.voice_id,
        name: v.name || '',
        gender: v.gender || '',
        language: v.language || '',
        preview_audio: v.preview_audio || v.preview_audio_url || null,
      })),
      total: rawVoices.length,
      ...(debug && { sample: rawVoices[0] || null }),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen avatar group looks =====
// avatar group ID 안의 룩(look) 목록을 조회한다. 각 룩의 preview 이미지를 재서
// 9:16 세로 여부(portrait)를 함께 반환한다. 그룹 내용은 자주 안 바뀌므로 10분 캐시.
const avatarGroupLooksCache = new Map() // groupId → { looks, ts }
const AVATAR_GROUP_LOOKS_TTL = 10 * 60 * 1000

app.get('/api/heygen/avatar-group/:groupId/looks', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  const groupId = String(req.params.groupId || '').trim()
  if (!groupId) return res.status(400).json({ error: 'groupId required' })

  try {
    const cached = avatarGroupLooksCache.get(groupId)
    if (cached && Date.now() - cached.ts < AVATAR_GROUP_LOOKS_TTL) {
      return res.json({ looks: cached.looks, cached: true })
    }

    const r = await fetch(`https://api.heygen.com/v2/avatar_group/${groupId}/avatars`, {
      headers: { 'X-Api-Key': apiKey },
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: 'avatar group fetch failed', detail: data })

    const rawLooks = data?.data?.avatar_list || data?.data?.avatars || data?.data?.list
      || (Array.isArray(data?.data) ? data.data : [])
    const looks = []
    for (const look of (Array.isArray(rawLooks) ? rawLooks : [])) {
      const id = look.id || look.avatar_id || look.talking_photo_id || look.image_key
      if (!id) continue
      const name = look.name || look.avatar_name || look.talking_photo_name || ''
      const preview = look.image_url || look.preview_image_url || look.preview_image || look.motion_preview_url
      let width = 0
      let height = 0
      if (preview) {
        try {
          const imgRes = await fetch(preview)
          if (imgRes.ok) {
            const meta = await sharp(Buffer.from(await imgRes.arrayBuffer())).metadata()
            width = meta.width || 0
            height = meta.height || 0
          }
        } catch {
          // preview 측정 실패 시 portrait 는 기본 true 로 둔다.
        }
      }
      const portrait = width > 0 && height > 0 ? (width / height) <= 0.85 : true
      looks.push({ id, name, width, height, portrait, preview: preview || null })
    }

    avatarGroupLooksCache.set(groupId, { looks, ts: Date.now() })
    res.json({ looks })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen Video Generate Proxy =====
app.post('/api/heygen/video/generate', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen Video Agent Generate Proxy =====
app.post('/api/heygen/video-agent/generate', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v1/video_agent/generate', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen Video Status Proxy =====
app.get('/api/heygen/video/status/:videoId', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${req.params.videoId}`, {
      headers: { 'X-Api-Key': apiKey },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen preset avatar list =====
app.get('/api/heygen/preset-avatars', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v2/avatars', {
      headers: { 'X-Api-Key': apiKey },
    })
    if (!response.ok) return res.status(response.status).json({ error: 'HeyGen API error' })
    const data = await response.json()
    const tps = data.data?.talking_photos || []
    const presets = tps.filter(tp => !(tp.talking_photo_name || '').startsWith('avatar_')).map(tp => ({
      id: tp.talking_photo_id,
      name: tp.talking_photo_name,
      preview: tp.preview_image_url,
    }))
    res.json({ presets })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen public avatar list =====
app.get('/api/heygen/public-avatars', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v2/avatars', {
      headers: { 'X-Api-Key': apiKey },
    })
    if (!response.ok) {
      const errText = await response.text()
      return res.status(response.status).json({ error: errText })
    }
    const data = await response.json()
    const avatars = (data.data?.avatars || []).map(avatar => ({
      id: avatar.avatar_id || avatar.id,
      name: avatar.avatar_name || avatar.name || 'Unnamed avatar',
      preview: avatar.preview_image_url || avatar.preview_image || avatar.avatar_preview_image_url || avatar.thumbnail_url || '',
      gender: avatar.gender || '',
      kind: 'avatar',
      source: 'public',
    }))
    const talkingPhotos = (data.data?.talking_photos || []).map(photo => ({
      id: photo.talking_photo_id || photo.id,
      name: photo.talking_photo_name || photo.name || 'Custom avatar',
      preview: photo.preview_image_url || photo.preview_image || photo.thumbnail_url || '',
      gender: photo.gender || '',
      kind: 'talking_photo',
      source: (photo.talking_photo_name || '').startsWith('avatar_') ? 'generated' : 'custom',
    }))
    const merged = [...talkingPhotos, ...avatars].filter(avatar => avatar.id)
    res.json({ avatars: merged })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen merged avatar list =====
app.get('/api/heygen/avatar-list', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v2/avatars', {
      headers: { 'X-Api-Key': apiKey },
    })
    if (!response.ok) return res.status(response.status).json({ error: 'HeyGen API error' })
    const data = await response.json()
    const tps = data.data?.talking_photos || []
    const custom = tps.filter(tp => (tp.talking_photo_name || '').startsWith('avatar_'))
    res.json({ custom, total: tps.length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen avatar status lookup =====
app.get('/api/heygen/avatar-status/:groupId', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v2/avatars', {
      headers: { 'X-Api-Key': apiKey },
    })
    if (!response.ok) return res.status(response.status).json({ error: 'HeyGen API error' })
    const data = await response.json()
    const tps = data.data?.talking_photos || []
    const found = tps.find(tp => tp.talking_photo_id === req.params.groupId)
    if (found && found.preview_image_url) {
      res.json({ ready: true, data: found })
    } else {
      res.json({ ready: false })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen test upload for generated avatar images =====
app.post('/api/heygen/upload-test-avatar', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const imgPath = path.join(__dirname, '..', 'output', 'avatar_1775569832756.png')
    const buffer = fs.readFileSync(imgPath)
    const response = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'image/png' },
      body: buffer,
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen Upload Asset (base64 or filePath → binary → HeyGen) =====
app.post('/api/heygen/upload-asset', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const { base64, filePath, mimeType } = req.body
    let buffer
    if (filePath && fs.existsSync(filePath)) {
      buffer = fs.readFileSync(filePath)
    } else if (base64) {
      buffer = Buffer.from(base64, 'base64')
    } else {
      return res.status(400).json({ error: 'Missing base64 or filePath' })
    }
    const contentType = mimeType || (filePath?.endsWith('.mp4') ? 'video/mp4' : 'image/png')
    const response = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': contentType },
      body: buffer,
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== HeyGen Avatar Group 생성 (image_key → talking_photo_id) =====
app.post('/api/heygen/avatar-group/create', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  try {
    const response = await fetch('https://api.heygen.com/v2/photo_avatar/avatar_group/create', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== 모션 배경 영상 생성 (FFmpeg) =====
app.post('/api/background/generate', async (req, res) => {
  const { style = 'gradient', duration = 8 } = req.body
  const outputDir2 = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir2)) fs.mkdirSync(outputDir2, { recursive: true })

  const ts = Date.now()
  const outputPath = path.join(outputDir2, `bg_${style}_${ts}.mp4`)

  // FFmpeg 필터로 모션 배경을 생성한다. (1080x1920, 9:16)
  const filters = {
    gradient: `color=s=1080x1920:c=black:d=${duration},format=yuv420p,geq='r=30+20*sin(2*PI*T/4+Y/200):g=30+40*sin(2*PI*T/5+X/300):b=80+50*sin(2*PI*T/3+Y/150)'`,
    warm: `color=s=1080x1920:c=black:d=${duration},format=yuv420p,geq='r=60+40*sin(2*PI*T/6+Y/250):g=40+20*sin(2*PI*T/4+X/200):b=20+10*sin(2*PI*T/5)'`,
    cool: `color=s=1080x1920:c=black:d=${duration},format=yuv420p,geq='r=15+10*sin(2*PI*T/5):g=25+30*sin(2*PI*T/4+Y/300):b=60+50*sin(2*PI*T/3+X/200)'`,
  }
  const filter = filters[style] || filters.gradient

  try {
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-f', 'lavfi', '-i', filter,
        '-t', String(duration),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
        '-pix_fmt', 'yuv420p', '-y', outputPath,
      ], { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`FFmpeg: ${err.message}\n${(stderr || '').slice(-300)}`))
        else resolve()
      })
    })
    const size = fs.statSync(outputPath).size
    res.json({ url: `/output/bg_${style}_${ts}.mp4`, path: outputPath, size })
  } catch (err) {
    try { fs.unlinkSync(outputPath) } catch {}
    res.status(500).json({ error: err.message })
  }
})

// ===== Generate title overlay backgrounds with Canvas =====
app.post('/api/title-bg/generate', async (req, res) => {
  const { scenes } = req.body
  if (!scenes?.length) return res.status(400).json({ error: 'Missing scenes' })

  const outputDir2 = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir2)) fs.mkdirSync(outputDir2, { recursive: true })

  const results = []
  const titleDesigns = ['gradient-box', 'underline', 'accent-bar']
  const palettes = [
    { bar: '#3B82F6', barEnd: '#8B5CF6', underline: '#FBBF24', text: '#FFFFFF' },
    { bar: '#10B981', barEnd: '#06B6D4', underline: '#F97316', text: '#FFFFFF' },
    { bar: '#F59E0B', barEnd: '#EF4444', underline: '#3B82F6', text: '#FFFFFF' },
    { bar: '#8B5CF6', barEnd: '#EC4899', underline: '#34D399', text: '#FFFFFF' },
  ]

  for (const scene of scenes) {
    if (scene.type !== 'avatar_keyword' || !scene.keyword) continue
    const ts = Date.now()
    const filename = `title_bg_${scene.sceneNumber}_${ts}.png`
    const filePath = path.join(outputDir2, filename)

    const W = 1080, H = 1920
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')

    // Keep the background transparent so it can overlay the avatar scene.
    ctx.clearRect(0, 0, W, H)

    const design = titleDesigns[(scene.sceneNumber - 1) % titleDesigns.length]
    const palette = palettes[(scene.sceneNumber - 1) % palettes.length]
    const text = scene.keyword
    const fontSize = 64
    const x = 120
    const baseY = 220
    const padX = 48
    const padY = 32
    const lineHeight = fontSize * 1.5
    const maxWidth = W - x * 2

    // Split long text across multiple lines while preserving natural break points.
    ctx.font = `${fontSize}px Pretendard`
    ctx.textAlign = 'left'
    const lines = []
    let remaining = text
    while (remaining.length > 0) {
      let width = ctx.measureText(remaining).width
      if (width <= maxWidth) { lines.push(remaining); break }
      let cut = remaining.length
      for (let i = remaining.length - 1; i >= 1; i--) {
        if (ctx.measureText(remaining.slice(0, i)).width <= maxWidth) {
          // Prefer whitespace or punctuation as a safer wrap boundary.
          let bestCut = i
          for (let j = i; j >= Math.floor(i * 0.5); j--) {
            if (/[\s,.:!?쨌\-]/.test(remaining[j])) { bestCut = j + 1; break }
          }
          cut = bestCut
          break
        }
      }
      lines.push(remaining.slice(0, cut).trim())
      remaining = remaining.slice(cut).trim()
    }

    const totalH = lines.length * lineHeight
    const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width))

    if (design === 'gradient-box') {
      const grad = ctx.createLinearGradient(x - padX, 0, x + maxLineWidth + padX, 0)
      grad.addColorStop(0, palette.bar)
      grad.addColorStop(1, palette.barEnd)
      ctx.fillStyle = grad
      roundRect(ctx, x - padX, baseY - fontSize - padY + 10, maxLineWidth + padX * 2, totalH + padY * 2, 16)
      ctx.fill()
      ctx.fillStyle = palette.text
      lines.forEach((line, i) => ctx.fillText(line, x, baseY + i * lineHeight))
    } else if (design === 'accent-bar') {
      ctx.fillStyle = palette.bar + 'E0'
      roundRect(ctx, x - padX, baseY - fontSize - padY + 10, maxLineWidth + padX * 2, totalH + padY * 2, 16)
      ctx.fill()
      ctx.fillStyle = palette.text
      lines.forEach((line, i) => ctx.fillText(line, x, baseY + i * lineHeight))
    } else if (design === 'underline') {
      lines.forEach((line, i) => {
        const ly = baseY + i * lineHeight
        const lw = ctx.measureText(line).width
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'
        ctx.lineWidth = 3
        ctx.lineJoin = 'round'
        ctx.strokeText(line, x, ly)
        ctx.fillStyle = palette.text
        ctx.fillText(line, x, ly)
        ctx.fillStyle = palette.underline
        roundRect(ctx, x, ly + 10, lw, 8, 4)
        ctx.fill()
      })
    }

    try {
      const buffer = canvas.toBuffer('image/png')
      fs.writeFileSync(filePath, buffer)
      results.push({ sceneNumber: scene.sceneNumber, url: `/output/${filename}`, path: filePath })
    } catch (err) {
      results.push({ sceneNumber: scene.sceneNumber, error: err.message })
    }
  }

  res.json({ images: results })
})

// ===== 인포그래픽 배경 이미지 생성 (Canvas) =====
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function escapeXml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ===== Shorts vlog background: Gemini 이미지 생성 + HeyGen 업로드 =====
// body: { visualDescription, sceneNumber? }
// returns: { image_key, url }
// 쇼츠 Gemini 배경 생성 기능 제거됨.
// 숏폼 배경은 아바타 자체 배경 / 컨셉 backgroundColor 단색 / quiz-countdown 영상만 사용한다.

// ===== Quiz countdown background video: 3→2→1 카운트다운 영상 생성 + HeyGen 업로드 =====
// ox_quiz 의 'quiz-countdown' 대기 씬 배경으로 쓰는 3초 카운트다운 영상.
// @napi-rs/canvas 로 프레임 3장(3·2·1)을 그리고 ffmpeg 로 3초 mp4 로 합쳐
// HeyGen 에 video asset 으로 업로드한다. 카운트다운은 항상 동일하므로 결과를 캐시해 재사용.
let quizCountdownAssetCache = null
app.post('/api/heygen/quiz-countdown', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured' })

  try {
    const outputDir2 = path.join(__dirname, '..', 'output')
    if (!fs.existsSync(outputDir2)) fs.mkdirSync(outputDir2, { recursive: true })
    const cacheFile = path.join(outputDir2, '.quiz-countdown-asset.json')

    // 메모리 캐시
    if (quizCountdownAssetCache) {
      return res.json({ video_asset_id: quizCountdownAssetCache, cached: 'memory' })
    }
    // 디스크 캐시
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
        if (cached?.videoAssetId) {
          quizCountdownAssetCache = cached.videoAssetId
          return res.json({ video_asset_id: cached.videoAssetId, cached: 'disk' })
        }
      } catch { /* 캐시 파손 시 재생성 */ }
    }

    // 1) 프레임 3장 그리기 (3, 2, 1)
    const W = 720, H = 1280
    const numbers = ['3', '2', '1']
    numbers.forEach((num, i) => {
      const canvas = createCanvas(W, H)
      const ctx = canvas.getContext('2d')
      // 배경 그라데이션 (퀴즈쇼 톤)
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#1A2D4A')
      grad.addColorStop(1, '#0F1B2D')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      // 카운트다운 링 + 숫자 — 상단 영역(아바타 머리 위쪽). 위치/크기는 상수라 조정 가능.
      const cx = W / 2, cy = H * 0.30
      ctx.strokeStyle = '#F4C534'
      ctx.lineWidth = 16
      ctx.beginPath()
      ctx.arc(cx, cy, 230, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#F4C534'
      ctx.font = 'bold 300px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(num, cx, cy + 16)
      const buf = canvas.toBuffer('image/png')
      fs.writeFileSync(path.join(outputDir2, `quiz_countdown_frame_${i}.png`), buf)
    })

    // 2) ffmpeg 로 3초 mp4 합성 (프레임당 1초)
    const videoPath = path.join(outputDir2, 'quiz_countdown.mp4')
    await new Promise((resolve, reject) => {
      execFile(ffmpegPath, [
        '-y',
        '-framerate', '1',
        '-start_number', '0',
        '-i', path.join(outputDir2, 'quiz_countdown_frame_%d.png'),
        '-t', '3',
        '-r', '30',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        videoPath,
      ], { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`ffmpeg countdown 합성 실패: ${stderr || err.message}`))
        else resolve()
      })
    })

    // 3) HeyGen video asset 업로드
    const videoBuffer = fs.readFileSync(videoPath)
    const uploadRes = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'video/mp4' },
      body: videoBuffer,
    })
    const uploadData = await uploadRes.json().catch(() => ({}))
    if (!uploadRes.ok) {
      return res.status(uploadRes.status).json({ error: 'HeyGen video upload failed', detail: uploadData })
    }
    const videoAssetId = uploadData?.data?.id
      || String(uploadData?.data?.image_key || '').split('/')[1]
      || uploadData?.data?.video_asset_id
    if (!videoAssetId) {
      return res.status(500).json({ error: 'HeyGen video asset id 추출 실패', detail: uploadData })
    }

    // 4) 캐시 저장 (카운트다운은 항상 동일하므로 영구 캐시)
    quizCountdownAssetCache = videoAssetId
    fs.writeFileSync(cacheFile, JSON.stringify({ videoAssetId, createdAt: Date.now() }, null, 2), 'utf8')

    res.json({ video_asset_id: videoAssetId, cached: false })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== Subtitle burn-in with FFmpeg =====
// 자막은 "한 문장 = 한 자막 블록(1~2줄)" 단위로 나뉘어 표시된다.
// 한 문장이 너무 길면(maxCharsPerLine*2 초과) 두 블록(=두 자막 화면)으로 다시 끊어 표시.

// 문장 부호(. ! ? 。 ！ ？) 기준으로 sentence 단위 분할. 줄바꿈도 sentence 경계로 본다.
// 단, 마침표(.)는 앞뒤가 모두 숫자면 소수점(12.3 등)으로 보고 문장 끝으로 판단하지 않는다.
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
    // 12.3, 1.5GB 같은 소수점/번호는 문장 끝이 아니다.
    if (ch === '.' && /[0-9]/.test(source[i - 1] || '') && /[0-9]/.test(source[i + 1] || '')) continue
    const t = buf.trim()
    if (t) result.push(t)
    buf = ''
  }
  const tail = buf.trim()
  if (tail) result.push(tail)
  return result
}

// 한 문장을 두 줄까지로 분할. maxCharsPerLine 이하면 한 줄, 초과면 자연 break(쉼표/공백) 으로 split.
function splitSentenceToLines(sentence, maxCharsPerLine) {
  const s = String(sentence || '').trim()
  if (!s) return []
  if (s.length <= maxCharsPerLine) return [s]
  // 약 절반 지점 기준으로 가장 가까운 자연 break 찾기
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
  const first = s.slice(0, cut).trim()
  const rest = s.slice(cut).trim()
  return [first, rest].filter(Boolean)
}

// 한 문장 → 1~2개의 자막 블록. 블록은 \n 으로 구분된 1~2 줄짜리 자막 화면 하나.
function buildBlocksForSentence(sentence, maxCharsPerLine) {
  const s = String(sentence || '').trim()
  if (!s) return []
  // 두 줄 한 블록까지 허용
  if (s.length <= maxCharsPerLine * 2) {
    return [splitSentenceToLines(s, maxCharsPerLine).join('\n')]
  }
  // 두 줄로도 넘치면 절반에서 끊어 두 블록(=두 자막 화면)으로 분할 → 각 블록은 다시 1~2 줄
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
  const first = s.slice(0, cut).trim()
  const second = s.slice(cut).trim()
  return [
    splitSentenceToLines(first, maxCharsPerLine).join('\n'),
    splitSentenceToLines(second, maxCharsPerLine).join('\n'),
  ].filter(Boolean)
}

// 한 씬의 자막 텍스트를 자막 블록 배열로. 한 블록 = 한 화면 자막(1~2 줄).
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

// Subtitle style mapping for 9:16 vertical videos.
// marginV 40: 영상 하단에서 약 40px 위 — 쇼츠/릴스 하단 UI(좋아요/댓글 아이콘) 위쪽 안전 영역.
const subtitleFontConfigs = {
  default: { fontName: 'Pretendard Variable', fontSize: 10, marginV: 40, bold: 0, italic: 0, spacing: 0 },
  bold: { fontName: 'A2z', fontSize: 10.8, marginV: 40, bold: -1, italic: 0, spacing: 0.2 },
  dongle: { fontName: 'TmoneyRoundWind', fontSize: 11.2, marginV: 40, bold: 0, italic: 0, spacing: 0 },
  handwriting: { fontName: 'Maplestory', fontSize: 10.4, marginV: 40, bold: 0, italic: 0, spacing: 0.05 },
  gothic: { fontName: 'KBODiaGothic', fontSize: 10.2, marginV: 40, bold: 0, italic: 0, spacing: 0.35 },
}

function getSubtitleFontConfig(fontKey) {
  return subtitleFontConfigs[fontKey] || subtitleFontConfigs.default
}

function getForceStyle(style, fontKey = 'default') {
  const font = getSubtitleFontConfig(fontKey)
  const base = [
    `FontName=${font.fontName}`,
    `FontSize=${font.fontSize}`,
    'Alignment=2',
    `MarginV=${font.marginV}`,
    `Bold=${font.bold}`,
    `Italic=${font.italic}`,
    `Spacing=${font.spacing}`,
  ].join(',')

  const styles = {
    classic: `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,BorderStyle=3,BackColour=&HB0000000,Shadow=0`,
    classic2: `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=0.8,BorderStyle=1,Shadow=0`,
  }
  return styles[style] || styles.classic
}

// Generate a transparent title overlay image with Canvas.
function generateTitleOverlay(text, design, palette, outputPath) {
  const W = 1080, H = 1920
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)

  const fontSize = 64
  const x = 120
  const baseY = 220
  const padX = 48
  const padY = 32
  const lineHeight = fontSize * 1.5
  const maxWidth = W - x * 2

  ctx.font = `${fontSize}px Pretendard`
  ctx.textAlign = 'left'

  // 줄바꿈
  const lines = []
  let remaining = text
  while (remaining.length > 0) {
    let width = ctx.measureText(remaining).width
    if (width <= maxWidth) { lines.push(remaining); break }
    let cut = remaining.length
    for (let i = remaining.length - 1; i >= 1; i--) {
      if (ctx.measureText(remaining.slice(0, i)).width <= maxWidth) {
        let bestCut = i
        for (let j = i; j >= Math.floor(i * 0.5); j--) {
          if (/[\s,.:!?쨌\-]/.test(remaining[j])) { bestCut = j + 1; break }
        }
        cut = bestCut
        break
      }
    }
    lines.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }

  const totalH = lines.length * lineHeight
  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width))

  if (design === 'gradient-box') {
    const grad = ctx.createLinearGradient(x - padX, 0, x + maxLineWidth + padX, 0)
    grad.addColorStop(0, palette.bar)
    grad.addColorStop(1, palette.barEnd)
    ctx.fillStyle = grad
    roundRect(ctx, x - padX, baseY - fontSize - padY + 10, maxLineWidth + padX * 2, totalH + padY * 2, 16)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((line, i) => ctx.fillText(line, x, baseY + i * lineHeight))
  } else if (design === 'accent-bar') {
    ctx.fillStyle = palette.bar + 'E0'
    roundRect(ctx, x - padX, baseY - fontSize - padY + 10, maxLineWidth + padX * 2, totalH + padY * 2, 16)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((line, i) => ctx.fillText(line, x, baseY + i * lineHeight))
  } else if (design === 'underline') {
    lines.forEach((line, i) => {
      const ly = baseY + i * lineHeight
      const lw = ctx.measureText(line).width
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeText(line, x, ly)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(line, x, ly)
      ctx.fillStyle = palette.underline
      roundRect(ctx, x, ly + 10, lw, 8, 4)
      ctx.fill()
    })
  }

  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'))
}

// 자막 번인 비동기 잡 저장소 — 무거운 FFmpeg 작업을 동기 응답에서 분리해
// 요청 타임아웃(→ Render 502)을 막는다. POST 는 jobId 만 즉시 반환, 작업은 백그라운드.
const subtitleBurnJobs = new Map()

app.post('/api/subtitle/burn', async (req, res) => {
  const { videoUrl, scenes, subtitleStyle, subtitleFont, animatedTitles } = req.body
  if (!videoUrl || !scenes?.length) return res.status(400).json({ error: 'Missing videoUrl or scenes' })

  // jobId 를 즉시 반환하고 FFmpeg 작업은 백그라운드로 진행. 클라이언트는 status 로 폴링.
  const jobId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  subtitleBurnJobs.set(jobId, { status: 'processing', createdAt: Date.now() })
  res.json({ jobId })
  // animatedTitles: [{ sceneNumber, localPath }] optional WebM title overlays.
  const animatedTitleMap = {}
  if (Array.isArray(animatedTitles)) {
    animatedTitles.forEach(t => { if (t.sceneNumber && t.localPath && fs.existsSync(t.localPath)) animatedTitleMap[t.sceneNumber] = t.localPath })
  }

  const outputDir2 = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir2)) fs.mkdirSync(outputDir2, { recursive: true })

  const ts = Date.now()
  const inputPath = path.join(outputDir2, `heygen_raw_${ts}.mp4`)
  const srtPath = path.join(outputDir2, `subtitle_${ts}.srt`)
  const outputPath = path.join(outputDir2, `final_${ts}.mp4`)

  const titleDesigns = ['gradient-box', 'underline', 'accent-bar']
  const titlePalettes = [
    { bar: '#3B82F6', barEnd: '#8B5CF6', underline: '#FBBF24' },
    { bar: '#10B981', barEnd: '#06B6D4', underline: '#F97316' },
    { bar: '#F59E0B', barEnd: '#EF4444', underline: '#3B82F6' },
    { bar: '#8B5CF6', barEnd: '#EC4899', underline: '#34D399' },
  ]

  try {
    // 1) Download the raw HeyGen video.
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error(`영상 다운로드 실패: ${videoRes.status}`)
    const buffer = Buffer.from(await videoRes.arrayBuffer())
    fs.writeFileSync(inputPath, buffer)

    // 2) Measure the final video duration.
    const duration = await new Promise((resolve) => {
      execFile(ffmpegPath, ['-i', inputPath], { timeout: 10000 }, (err, stdout, stderr) => {
        const match = (stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
        if (match) {
          resolve(parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100)
        } else {
          resolve(scenes.reduce((sum, s) => sum + (s.duration || 5), 0))
        }
      })
    })

    // 3) Build SRT blocks — 한 자막 블록 = 한 문장(1~2줄). 너무 긴 문장은 두 블록으로 끊는다.
    // 한 줄 18자 까지 (한국어 가독 + 쇼츠 9:16 폭 안에 안전).
    const maxCharsPerLine = 18
    let srtContent = ''
    let srtIdx = 1
    // caption 이 자막+TTS 공용 텍스트. 옛 스크립트(narration 만 있음) 도 함께 지원.
    const sceneSpokenText = (s) => String(s?.caption || s?.narration || '')
    const totalChars = scenes.reduce((sum, s) => sum + sceneSpokenText(s).length, 0) || 1
    let currentTime = 0

    for (const scene of scenes) {
      const captionText = sceneSpokenText(scene).trim()
      const sceneDur = (sceneSpokenText(scene).length / totalChars) * duration
      const blocks = buildSubtitleBlocks(captionText, maxCharsPerLine)
      const blockChars = blocks.map(b => b.replace(/\n/g, '').length)
      const blockTotalChars = blockChars.reduce((s, c) => s + c, 0) || 1

      for (let b = 0; b < blocks.length; b++) {
        const blockDur = (blockChars[b] / blockTotalChars) * sceneDur
        const startTime = currentTime
        const endTime = currentTime + blockDur

        const fmt = (t) => {
          const h = Math.floor(t / 3600)
          const m = Math.floor((t % 3600) / 60)
          const s = Math.floor(t % 60)
          const ms = Math.round((t % 1) * 1000)
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
        }

        srtContent += `${srtIdx++}\n${fmt(startTime)} --> ${fmt(endTime)}\n${blocks[b]}\n\n`
        currentTime = endTime
      }
    }

    fs.writeFileSync(srtPath, srtContent, 'utf8')

    // 4) Build title overlays. Use WebM when provided, otherwise generate PNG overlays.
    const titleOverlays = []
    let titleTime = 0
    for (const scene of scenes) {
      const sceneDur = (sceneSpokenText(scene).length / totalChars) * duration
      if (scene.type === 'avatar_keyword' && scene.keyword) {
        const animatedPath = animatedTitleMap[scene.sceneNumber]
        if (animatedPath) {
          titleOverlays.push({ path: animatedPath, start: titleTime, end: titleTime + sceneDur, animated: true, cleanup: false })
        } else {
          const titlePath = path.join(outputDir2, `title_overlay_${ts}_${scene.sceneNumber}.png`)
          const designIdx = (scene.sceneNumber - 1) % titleDesigns.length
          const paletteIdx = (scene.sceneNumber - 1) % titlePalettes.length
          generateTitleOverlay(scene.keyword, titleDesigns[designIdx], titlePalettes[paletteIdx], titlePath)
          titleOverlays.push({ path: titlePath, start: titleTime, end: titleTime + sceneDur, animated: false, cleanup: true })
        }
      }
      titleTime += sceneDur
    }

    // 5) Burn subtitles and title overlays into the final video.
    const srtPathEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    const fontsDirEscaped = path.join(__dirname, 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:')
    const resolvedFont = getSubtitleFontConfig(subtitleFont || 'default')
    const forceStyle = getForceStyle(subtitleStyle || 'classic', subtitleFont || 'default')

    // Compose FFmpeg filters for subtitles plus title overlays.
    let filterComplex = ''
    const inputs = ['-i', inputPath]
    titleOverlays.forEach((t) => {
      if (t.animated) {
        // WebM overlays are offset to the scene start and loop for the scene duration.
        inputs.push('-itsoffset', t.start.toFixed(3), '-stream_loop', '-1', '-i', t.path)
      } else {
        inputs.push('-i', t.path)
      }
    })

    if (titleOverlays.length > 0) {
      // Overlay chain: base video -> subtitles -> title overlays.
      let chain = `[0:v]subtitles='${srtPathEscaped}':fontsdir='${fontsDirEscaped}':force_style='${forceStyle}'[sub]`
      let prevLabel = 'sub'
      titleOverlays.forEach((t, i) => {
        const nextLabel = i < titleOverlays.length - 1 ? `t${i}` : 'out'
        const fmt = t.animated ? ':format=auto' : ''
        chain += `;[${prevLabel}][${i + 1}:v]overlay=0:0${fmt}:enable='between(t,${t.start.toFixed(2)},${t.end.toFixed(2)})'[${nextLabel}]`
        prevLabel = nextLabel
      })
      filterComplex = chain

      await new Promise((resolve, reject) => {
        const args = [...inputs, '-filter_complex', filterComplex, '-map', '[out]', '-map', '0:a',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2',
          '-c:a', 'copy', '-y', outputPath]
        execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`FFmpeg 오류: ${err.message}\n${(stderr || '').slice(-500)}`))
          else resolve()
        })
      })
    } else {
      // If there is no title overlay, burn subtitles only.
      await new Promise((resolve, reject) => {
        const args = [
          '-i', inputPath,
          '-vf', `subtitles='${srtPathEscaped}':fontsdir='${fontsDirEscaped}':force_style='${forceStyle}'`,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-threads', '2',
          '-c:a', 'copy',
          '-y', outputPath,
        ]
        execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`FFmpeg 오류: ${err.message}\n${(stderr || '').slice(-500)}`))
          else resolve()
        })
      })
    }

    // Clean up generated PNG overlays. Keep provided WebM overlays intact.
    titleOverlays.forEach(t => { if (t.cleanup) { try { fs.unlinkSync(t.path) } catch {} } })

    // 5) 잡 완료 기록 (HTTP 응답은 이미 jobId 로 보냈음)
    const size = fs.statSync(outputPath).size
    const url = `/output/final_${ts}.mp4`
    subtitleBurnJobs.set(jobId, {
      status: 'done',
      url,
      size,
      srtUrl: `/output/subtitle_${ts}.srt`,
      requestedFont: subtitleFont || 'default',
      resolvedFont: resolvedFont.fontName,
      finishedAt: Date.now(),
    })

    // Clean up temporary input files immediately.
    setTimeout(() => { try { fs.unlinkSync(inputPath) } catch {} }, 60000)
  } catch (err) {
    try { fs.unlinkSync(inputPath) } catch {}
    try { fs.unlinkSync(srtPath) } catch {}
    subtitleBurnJobs.set(jobId, { status: 'failed', error: err.message, finishedAt: Date.now() })
  }
})

// 자막 번인 잡 상태 폴링. done/failed 결과를 받아간 뒤엔 메모리에서 정리한다.
app.get('/api/subtitle/burn/status/:jobId', (req, res) => {
  const job = subtitleBurnJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ status: 'not_found', error: 'job not found' })
  res.json(job)
  if (job.status === 'done' || job.status === 'failed') {
    setTimeout(() => subtitleBurnJobs.delete(req.params.jobId), 60000)
  }
})

// ===== Remotion render endpoint =====
let remotionBundleUrl = null
let remotionBundleMtime = 0

function getRemotionSourceMtime() {
  const remotionDir = path.join(__dirname, '..', 'client', 'src', 'remotion')
  let maxMtime = 0
  const walk = (dir) => {
    try {
      const files = fs.readdirSync(dir)
      for (const f of files) {
        const full = path.join(dir, f)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) walk(full)
        else maxMtime = Math.max(maxMtime, stat.mtimeMs)
      }
    } catch {}
  }
  walk(remotionDir)
  return maxMtime
}

app.post('/api/remotion/render', async (req, res) => {
  const { compositionId, props, durationInFrames = 240, fps = 30, transparent = false } = req.body
  if (!compositionId) return res.status(400).json({ error: 'Missing compositionId' })

  const outputDir2 = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir2)) fs.mkdirSync(outputDir2, { recursive: true })

  try {
    const { bundle } = await import('@remotion/bundler')
    const { renderMedia, selectComposition } = await import('@remotion/renderer')

    // Cache the bundle and rebuild only when the source files change.
    const sourceMtime = getRemotionSourceMtime()
    if (!remotionBundleUrl || sourceMtime > remotionBundleMtime) {
      console.log(`[Remotion] ${remotionBundleUrl ? '소스 변경 감지, 번들 재생성' : '번들 생성 시작'}...`)
      const entryPoint = path.join(__dirname, '..', 'client', 'src', 'remotion', 'index.jsx')
      remotionBundleUrl = await bundle({
        entryPoint,
        onProgress: (p) => { if (p % 20 === 0) console.log(`[Remotion] 번들 진행: ${p}%`) },
      })
      remotionBundleMtime = sourceMtime
      console.log('[Remotion] 번들 완료:', remotionBundleUrl)
    }

    // Select the requested composition.
    const composition = await selectComposition({
      serveUrl: remotionBundleUrl,
      id: compositionId,
      inputProps: props || {},
    })

    // Override duration and fps when provided by the caller.
    composition.durationInFrames = durationInFrames
    composition.fps = fps

    const ts = Date.now()
    const ext = transparent ? 'webm' : 'mp4'
    const codec = transparent ? 'vp8' : 'h264'
    const outputPath = path.join(outputDir2, `remotion_${compositionId}_${ts}.${ext}`)

    console.log(`[Remotion] 렌더 시작: ${compositionId} (${durationInFrames}f, ${fps}fps, ${codec}${transparent ? ', transparent' : ''})`)
    await renderMedia({
      composition,
      serveUrl: remotionBundleUrl,
      codec,
      outputLocation: outputPath,
      inputProps: props || {},
      imageFormat: transparent ? 'png' : 'jpeg',
      pixelFormat: transparent ? 'yuva420p' : 'yuv420p',
    })
    console.log(`[Remotion] 렌더 완료: ${outputPath}`)

    const size = fs.statSync(outputPath).size
    res.json({ url: `/output/remotion_${compositionId}_${ts}.${ext}`, filePath: outputPath, size })
  } catch (err) {
    console.error('[Remotion] 렌더 오류:', err)
    // Reset the bundle cache when rendering fails.
    if (err.message?.includes('bundle')) remotionBundleUrl = null
    res.status(500).json({ error: err.message })
  }
})

// Upload a rendered MP4 to HeyGen as a video asset.
app.post('/api/remotion/upload-to-heygen', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  const { localPath } = req.body
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  if (!localPath || !fs.existsSync(localPath)) return res.status(400).json({ error: 'File not found' })

  try {
    const buffer = fs.readFileSync(localPath)
    const response = await fetch('https://upload.heygen.com/v1/asset', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'video/mp4' },
      body: buffer,
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== Static file serving for output/ =====
const outputDir = path.join(__dirname, '..', 'output')
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
// ngrok 무료 경고 페이지 우회: Content-Type을 강제로 설정
app.use('/output', (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase()
  const mimeMap = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg' }
  if (mimeMap[ext]) res.setHeader('Content-Type', mimeMap[ext])
  res.setHeader('ngrok-skip-browser-warning', 'true')
  next()
}, express.static(outputDir))

// ===== File upload → public URL =====
app.post('/api/output/upload', (req, res) => {
  const MAX_UPLOAD = 100 * 1024 * 1024 // 100MB
  const chunks = []
  let totalSize = 0
  let responded = false

  const fail = (status, msg) => {
    if (responded) return
    responded = true
    res.status(status).json({ error: msg })
  }

  // Use a 60-second timeout because image payloads can be large.
  const timeout = setTimeout(() => fail(408, 'Upload timeout (60s)'), 60000)

  req.on('data', chunk => {
    totalSize += chunk.length
    if (totalSize > MAX_UPLOAD) {
      fail(413, `Body too large (>${MAX_UPLOAD} bytes)`)
      req.destroy()
      return
    }
    chunks.push(chunk)
  })

  req.on('error', (err) => {
    clearTimeout(timeout)
    fail(500, `Upload stream error: ${err.message}`)
  })

  req.on('end', () => {
    clearTimeout(timeout)
    if (responded) return
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const { filename, data, encoding } = body

      if (!filename || !data) {
        fail(400, 'Missing filename or data')
        return
      }

      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
      const sanitized = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      const filePath = path.join(outputDir, sanitized)

      if (encoding === 'base64') {
        fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
      } else {
        fs.writeFileSync(filePath, data, 'utf8')
      }

      const size = fs.statSync(filePath).size
      const url = `/output/${sanitized}`
      responded = true
      res.json({ url, path: filePath, size })
    } catch (err) {
      fail(500, err.message)
    }
  })
})

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// ===== Instagram Graph API =====
const IG_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN
const IG_BUSINESS_ID = process.env.INSTAGRAM_BUSINESS_ID
const META_APP_ID = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3001/api/instagram/oauth/callback'
const IG_GRAPH_BASE = 'https://graph.facebook.com/v21.0'
const instagramTokenPath = path.join(__dirname, '.instagram_tokens.json')
let instagramTokens = null
let instagramOAuthState = null

function isInstagramOAuthConfigured() {
  return Boolean(META_APP_ID && META_APP_SECRET && INSTAGRAM_REDIRECT_URI)
}

function createGraphAppSecretProof(accessToken) {
  if (!META_APP_SECRET || !accessToken) {
    return null
  }

  return crypto.createHmac('sha256', META_APP_SECRET).update(accessToken).digest('hex')
}

function getInstagramFallbackAuth() {
  if (!IG_ACCESS_TOKEN || !IG_BUSINESS_ID) {
    return null
  }

  return {
    accessToken: IG_ACCESS_TOKEN,
    businessId: IG_BUSINESS_ID,
    username: null,
    mode: 'server-token',
  }
}

function getInstagramAuthMaterial() {
  if (instagramTokens?.accessToken && instagramTokens?.businessId) {
    return {
      accessToken: instagramTokens.accessToken,
      businessId: instagramTokens.businessId,
      username: instagramTokens.username || null,
      pageId: instagramTokens.pageId || null,
      mode: 'oauth',
    }
  }

  return getInstagramFallbackAuth()
}

async function loadInstagramTokens() {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('instagram_tokens')
        .select('tokens')
        .eq('id', 'default')
        .maybeSingle()
      if (!error && data?.tokens) {
        return data.tokens
      }
    } catch (err) {
      console.warn('[Instagram] Supabase token load failed:', err.message)
    }
  }

  try {
    if (fs.existsSync(instagramTokenPath)) {
      return JSON.parse(fs.readFileSync(instagramTokenPath, 'utf-8'))
    }
  } catch {}

  return null
}

async function saveInstagramTokens(tokens) {
  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('instagram_tokens').upsert({
        id: 'default',
        tokens,
        updated_at: new Date().toISOString(),
      })
      if (!error) {
        return
      }
      console.warn('[Instagram] Supabase token save failed:', error.message)
    } catch (err) {
      console.warn('[Instagram] Supabase token save error:', err.message)
    }
  }

  try {
    fs.writeFileSync(instagramTokenPath, JSON.stringify(tokens, null, 2))
  } catch {}
}

async function persistInstagramTokens(tokens) {
  instagramTokens = {
    ...(instagramTokens || {}),
    ...(tokens || {}),
  }
  await saveInstagramTokens(instagramTokens)
}

async function clearInstagramTokens() {
  instagramTokens = null

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('instagram_tokens').delete().eq('id', 'default')
    } catch {}
  }

  try {
    fs.unlinkSync(instagramTokenPath)
  } catch {}
}

function buildInstagramGraphUrl(resource, accessToken, params = {}) {
  const url = new URL(`${IG_GRAPH_BASE}/${resource.replace(/^\/+/, '')}`)

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  url.searchParams.set('access_token', accessToken)
  const appSecretProof = createGraphAppSecretProof(accessToken)
  if (appSecretProof) {
    url.searchParams.set('appsecret_proof', appSecretProof)
  }
  return url.toString()
}

async function instagramGraphGet(resource, accessToken, params = {}) {
  const response = await fetch(buildInstagramGraphUrl(resource, accessToken, params))
  const data = await response.json()
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Instagram Graph GET failed (${response.status})`)
  }
  return data
}

async function instagramGraphPost(resource, accessToken, body = {}) {
  const payload = new URLSearchParams()

  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined && value !== '') {
      payload.set(key, String(value))
    }
  }

  payload.set('access_token', accessToken)
  const appSecretProof = createGraphAppSecretProof(accessToken)
  if (appSecretProof) {
    payload.set('appsecret_proof', appSecretProof)
  }

  const response = await fetch(`${IG_GRAPH_BASE}/${resource.replace(/^\/+/, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  })
  const data = await response.json()
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Instagram Graph POST failed (${response.status})`)
  }
  return data
}

async function resolveInstagramPublishResult(mediaId, accessToken) {
  if (!mediaId) {
    throw new Error('Instagram media publish ID is not available')
  }

  try {
    const media = await instagramGraphGet(mediaId, accessToken, { fields: 'id,permalink' })
    return {
      mediaId: media.id || mediaId,
      permalink: media.permalink || null,
    }
  } catch {
    return {
      mediaId,
      permalink: null,
    }
  }
}

// Legacy Instagram image upload path for single images and carousels.
async function publishInstagramPostLegacy({ imageUrls = [], caption = '' }) {
  if (!IG_ACCESS_TOKEN || !IG_BUSINESS_ID) {
    throw new Error('Instagram environment variables are missing: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID')
  }
  if (!imageUrls.length) throw new Error('이미지 URL이 없습니다.')

  const urls = imageUrls.filter(Boolean).slice(0, 10)
  if (urls.length === 1) {
    // Single image upload.
    const createRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: urls[0], caption, access_token: IG_ACCESS_TOKEN }),
    })
    const created = await createRes.json()
    if (!createRes.ok || !created.id) throw new Error(`컨테이너 생성 실패: ${JSON.stringify(created)}`)
    await waitForMediaReadyLegacy([created.id])

    const pub = await publishInstagramMediaWithRetry({
      creationId: created.id,
      publish: async () => {
        const pubRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media_publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: created.id, access_token: IG_ACCESS_TOKEN }),
        })
        const data = await pubRes.json()
        if (!pubRes.ok || !data.id) throw new Error(`Instagram legacy publish failed: ${JSON.stringify(data)}`)
        return data
      },
      waitUntilReady: () => waitForMediaReadyLegacy([created.id], 15000),
    })
    return resolveInstagramPublishResult(pub.id, IG_ACCESS_TOKEN)
  }

  // Carousel upload.
  const childIds = []
  for (const url of urls) {
    const r = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: IG_ACCESS_TOKEN }),
    })
    const d = await r.json()
    if (!r.ok || !d.id) throw new Error(`캐러셀 자식 생성 실패: ${JSON.stringify(d)}`)
    childIds.push(d.id)
  }

  // Wait for child media to reach FINISHED.
  await waitForMediaReadyLegacy(childIds)

  const carouselRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: IG_ACCESS_TOKEN,
    }),
  })
  const carousel = await carouselRes.json()
  if (!carouselRes.ok || !carousel.id) throw new Error(`캐러셀 컨테이너 생성 실패: ${JSON.stringify(carousel)}`)

  // Wait for the carousel container to reach FINISHED.
  await waitForMediaReadyLegacy([carousel.id])

  const pub = await publishInstagramMediaWithRetry({
    creationId: carousel.id,
    publish: async () => {
      const pubRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: carousel.id, access_token: IG_ACCESS_TOKEN }),
      })
      const data = await pubRes.json()
      if (!pubRes.ok || !data.id) throw new Error(`Instagram legacy carousel publish failed: ${JSON.stringify(data)}`)
      return data
    },
    waitUntilReady: () => waitForMediaReadyLegacy([carousel.id], 15000),
  })
  return resolveInstagramPublishResult(pub.id, IG_ACCESS_TOKEN)
}

// Wait until Instagram media containers are ready to publish.
async function waitForMediaReadyLegacy(mediaIds, maxWait = 60000) {
  const interval = 2000
  const start = Date.now()
  for (const id of mediaIds) {
    while (Date.now() - start < maxWait) {
      const r = await fetch(`${IG_GRAPH_BASE}/${id}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`)
      const d = await r.json()
      if (d.status_code === 'FINISHED') break
      if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED') {
        throw new Error(`미디어 처리 실패 (${id}): ${d.status_code}`)
      }
      await new Promise(res => setTimeout(res, interval))
    }
  }
}

async function uploadBufferToStorage(buffer, mime = 'application/octet-stream', folder = 'instagram', bucket = 'extraction-images') {
  if (!supabaseAdmin) throw new Error('Supabase is not configured')
  const ext = mime.split('/')[1] || 'bin'
  const storagePath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error(`스토리지 업로드 실패: ${error.message}`)
  const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath)
  return pub?.publicUrl
}

// Upload a base64 data URL to Supabase Storage and return a public URL.
async function uploadDataUrlToStorage(dataUrl, filename) {
  if (!supabaseAdmin) throw new Error('Supabase is not configured')
  if (!dataUrl?.startsWith('data:')) return dataUrl
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('잘못된 data URL입니다.')
  const [, mime, b64] = match
  const buf = Buffer.from(b64, 'base64')
  return uploadBufferToStorage(buf, mime, 'instagram', 'extraction-images')
}

async function ensurePublicInstagramVideoUrl(videoUrl) {
  if (!videoUrl) throw new Error('Instagram Reels video URL is missing')

  if (typeof videoUrl === 'string' && videoUrl.startsWith('data:')) {
    const match = videoUrl.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error('잘못된 video data URL입니다.')
    const [, mime, b64] = match
    return uploadBufferToStorage(Buffer.from(b64, 'base64'), mime || 'video/mp4', 'instagram-reels', 'extraction-videos')
  }

  const resolveLocalOutputPath = (value) => {
    if (typeof value !== 'string') return null
    if (value.startsWith('/output/')) return path.join(__dirname, '..', value)
    try {
      const parsed = new URL(value)
      // /output/ 경로면 hostname(localhost, render 공개 도메인 등) 무관하게 일단
      // 로컬 파일 경로로 시도한다. 파일이 실제로 있으면 호출부의 fs.existsSync 가
      // true 라서 Supabase 로 옮기고, 없으면 false 라서 외부 URL fallback 으로 넘어간다.
      if (parsed.pathname.startsWith('/output/')) {
        return path.join(__dirname, '..', parsed.pathname)
      }
    } catch {}
    return null
  }

  const localPath = resolveLocalOutputPath(videoUrl)
  if (localPath && fs.existsSync(localPath)) {
    const ext = path.extname(localPath).toLowerCase()
    const mime = ext === '.webm' ? 'video/webm' : 'video/mp4'
    return uploadBufferToStorage(fs.readFileSync(localPath), mime, 'instagram-reels', 'extraction-videos')
  }

  try {
    const parsed = new URL(videoUrl)
    if (parsed.protocol !== 'https:') {
      throw new Error('Instagram Reels 업로드에는 공개 HTTPS 영상 URL이 필요합니다.')
    }
    return videoUrl
  } catch (error) {
    throw new Error(error.message || 'Instagram Reels 업로드에는 공개 HTTPS 영상 URL이 필요합니다.')
  }
}

async function publishInstagramPostV2({ imageUrls = [], caption = '' }) {
  const auth = getInstagramAuthMaterial()
  if (!auth?.accessToken || !auth?.businessId) {
    throw new Error('Instagram 인증 정보가 없습니다. 설정에서 다시 연결해 주세요.')
  }
  if (!imageUrls.length) {
    throw new Error('Instagram image URL is missing')
  }

  const urls = imageUrls.filter(Boolean).slice(0, 10)
  if (urls.length === 1) {
    const created = await instagramGraphPost(`${auth.businessId}/media`, auth.accessToken, {
      image_url: urls[0],
      caption,
    })
    await waitForInstagramMediaReady([created.id], auth.accessToken)

    const pub = await publishInstagramMediaWithRetry({
      creationId: created.id,
      publish: () => instagramGraphPost(`${auth.businessId}/media_publish`, auth.accessToken, {
        creation_id: created.id,
      }),
      waitUntilReady: () => waitForInstagramMediaReady([created.id], auth.accessToken, 15000),
    })
    return resolveInstagramPublishResult(pub.id, auth.accessToken)
  }

  const childIds = []
  for (const url of urls) {
    const child = await instagramGraphPost(`${auth.businessId}/media`, auth.accessToken, {
      image_url: url,
      is_carousel_item: true,
    })
    childIds.push(child.id)
  }

  await waitForInstagramMediaReady(childIds, auth.accessToken)

  const carousel = await instagramGraphPost(`${auth.businessId}/media`, auth.accessToken, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
  })

  await waitForInstagramMediaReady([carousel.id], auth.accessToken)

  const pub = await publishInstagramMediaWithRetry({
    creationId: carousel.id,
    publish: () => instagramGraphPost(`${auth.businessId}/media_publish`, auth.accessToken, {
      creation_id: carousel.id,
    }),
    waitUntilReady: () => waitForInstagramMediaReady([carousel.id], auth.accessToken, 15000),
  })
  return resolveInstagramPublishResult(pub.id, auth.accessToken)
}

async function publishInstagramReelV2({ videoUrl, caption = '' }) {
  const auth = getInstagramAuthMaterial()
  if (!auth?.accessToken || !auth?.businessId) {
    throw new Error('Instagram 인증 정보가 없습니다. 설정에서 다시 연결해 주세요.')
  }
  if (!videoUrl) {
    throw new Error('Instagram Reels video URL is missing')
  }

  const created = await instagramGraphPost(`${auth.businessId}/media`, auth.accessToken, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
  })
  await waitForInstagramMediaReady([created.id], auth.accessToken, 120000)

  const pub = await publishInstagramMediaWithRetry({
    creationId: created.id,
    publish: () => instagramGraphPost(`${auth.businessId}/media_publish`, auth.accessToken, {
      creation_id: created.id,
    }),
    waitUntilReady: () => waitForInstagramMediaReady([created.id], auth.accessToken, 15000),
  })
  return resolveInstagramPublishResult(pub.id, auth.accessToken)
}

function stripMarkdownText(value = '') {
  return String(value || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

function buildShortsUploadPayload({ script = {}, videoUrl, scheduledAt = null }) {
  const rawTitle = stripMarkdownText(script.uploadTitle || script.title || '유튜브 쇼츠/릴스')
  const title = rawTitle.includes('#Shorts') ? rawTitle.slice(0, 100) : `${rawTitle} #Shorts`.slice(0, 100)
  const descriptionParts = []
  if (script.uploadDescription) {
    descriptionParts.push(stripMarkdownText(script.uploadDescription))
  } else {
    if (script.hook) descriptionParts.push(stripMarkdownText(script.hook))
    if (Array.isArray(script.scenes)) {
      script.scenes.forEach((scene, index) => {
        const text = scene.caption || scene.narration
        if (text) descriptionParts.push(`${index + 1}. ${stripMarkdownText(text)}`)
      })
    }
    if (script.cta) descriptionParts.push(stripMarkdownText(script.cta))
  }
  const tags = (script.hashtags || script.tags || []).map((tag) => String(tag).replace(/^#/, ''))
  if (!tags.includes('Shorts')) tags.unshift('Shorts')

  return {
    snippet: {
      title,
      description: descriptionParts.join('\n').slice(0, 5000),
      tags,
      categoryId: '22',
    },
    status: scheduledAt
      ? { privacyStatus: 'private', publishAt: scheduledAt, selfDeclaredMadeForKids: false }
      : { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    videoUrl,
  }
}

function buildReelsCaption(script = {}) {
  const body = stripMarkdownText(
    script.uploadDescription ||
    [script.uploadTitle || script.title, script.hook, script.cta].filter(Boolean).join('\n\n')
  )
  const hashtags = (script.hashtags || script.tags || [])
    .map((tag) => (String(tag).startsWith('#') ? tag : `#${tag}`))
    .join(' ')
  return `${body}\n\n${hashtags}`.trim()
}

async function waitForInstagramMediaReady(mediaIds, accessToken, maxWait = 60000) {
  const interval = 2000

  for (const id of mediaIds) {
    const startedAt = Date.now()
    let lastMedia = null
    while (Date.now() - startedAt < maxWait) {
      const media = await instagramGraphGet(id, accessToken, { fields: 'status_code,status' })
      lastMedia = media
      if (media.status_code === 'FINISHED') {
        break
      }
      if (media.status_code === 'ERROR' || media.status_code === 'EXPIRED') {
        const reason = media.status || media.status_code
        console.error(`[Instagram] media ${id} failed:`, media)
        throw new Error(`Instagram media processing failed (${id}): ${reason}`)
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }

    if (Date.now() - startedAt >= maxWait) {
      const reason = lastMedia?.status || lastMedia?.status_code || 'unknown'
      throw new Error(`Instagram media processing timed out (${id}): ${reason}`)
    }
  }
}

// ===== Naver Blog Publish (Playwright) =====
app.post('/api/naver/publish', async (req, res) => {
  try {
    const { title, content, tags } = req.body
    if (!title || !content) return res.status(400).json({ success: false, source: 'server-api', endpoint: '/api/naver/publish', error: 'title, content 필수' })
    const { uploadToNaverBlog } = await import('./services/naver-blog.js')
    const result = await uploadToNaverBlog({ title, content, tags: tags || [] })
    res.json({ success: true, source: 'server-api', endpoint: '/api/naver/publish', url: result.url })
  } catch (err) {
    console.error('[Naver Blog] 업로드 실패:', err.message)
    res.status(500).json({ success: false, source: 'server-api', endpoint: '/api/naver/publish', error: err.message })
  }
})

app.post('/api/instagram/publish', async (req, res) => {
  try {
    const { imageUrls = [], caption } = req.body
    // Convert data URLs into publicly reachable Supabase Storage URLs.
    const publicUrls = []
    for (const url of imageUrls) {
      if (typeof url === 'string' && url.startsWith('data:')) {
        publicUrls.push(await uploadDataUrlToStorage(url))
      } else if (url) {
        publicUrls.push(url)
      }
    }
    const result = await publishInstagramPostV2({ imageUrls: publicUrls, caption })
    res.json({ success: true, ...result, uploadedUrls: publicUrls })
  } catch (err) {
    console.error('[Instagram] 업로드 실패:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/instagram/reel', async (req, res) => {
  try {
    const { videoUrl, caption } = req.body
    const publicVideoUrl = await ensurePublicInstagramVideoUrl(videoUrl)
    const result = await publishInstagramReelV2({ videoUrl: publicVideoUrl, caption })
    res.json({ success: true, ...result, uploadedUrl: publicVideoUrl })
  } catch (err) {
    console.error('[Instagram Reels] 업로드 실패:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/instagram/auth-status', (_req, res) => {
  validateInstagramSession()
    .then((status) => res.json(status))
    .catch((error) => {
      res.status(500).json({
        connected: false,
        hasAccessToken: Boolean(IG_ACCESS_TOKEN || instagramTokens?.accessToken),
        hasBusinessId: Boolean(IG_BUSINESS_ID || instagramTokens?.businessId),
        mode: instagramTokens?.accessToken ? 'oauth' : 'server-token',
        state: isInstagramOAuthConfigured() ? 'expired' : 'unconfigured',
        validationError: error.message,
        canReconnect: isInstagramOAuthConfigured(),
        canDisconnect: Boolean(instagramTokens?.accessToken),
      })
    })
})

// Instagram 예약 게시 테스트 (scheduled_publish_time 파라미터 검증용)
app.post('/api/instagram/schedule-test', async (req, res) => {
  try {
    if (!IG_ACCESS_TOKEN || !IG_BUSINESS_ID) {
      throw new Error('Instagram 환경변수(INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID) 미설정')
    }

    const { imageUrl, caption, scheduledPublishTime } = req.body
    if (!imageUrl) throw new Error('imageUrl이 필요합니다')

    // Step 1: 컨테이너 생성 (URL params 방식 — Graph API 권장)
    const createParams = new URLSearchParams()
    createParams.set('image_url', imageUrl)
    createParams.set('caption', caption || '')
    createParams.set('access_token', IG_ACCESS_TOKEN)
    if (scheduledPublishTime) {
      createParams.set('scheduled_publish_time', String(scheduledPublishTime))
    }

    const createUrl = `${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media`
    console.log('[Instagram Schedule] Step 1 - 컨테이너 생성:', createUrl, { image_url: imageUrl, scheduled_publish_time: scheduledPublishTime || '(없음)' })

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: createParams.toString(),
    })
    const created = await createRes.json()
    console.log('[Instagram Schedule] Step 1 응답:', created)

    if (!created.id) {
      throw new Error(`컨테이너 생성 실패: ${created.error?.message || JSON.stringify(created)}`)
    }

    // Step 2: 게시 확정
    const pubParams = new URLSearchParams()
    pubParams.set('creation_id', created.id)
    pubParams.set('access_token', IG_ACCESS_TOKEN)

    console.log('[Instagram Schedule] Step 2 - 게시 확정, creation_id:', created.id)
    const pubRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: pubParams.toString(),
    })
    const pub = await pubRes.json()
    console.log('[Instagram Schedule] Step 2 응답:', pub)

    if (!pub.id) {
      throw new Error(`게시 확정 실패: ${pub.error?.message || JSON.stringify(pub)}`)
    }

    res.json({
      success: true,
      containerId: created.id,
      mediaId: pub.id,
      scheduled: !!scheduledPublishTime,
      scheduledTime: scheduledPublishTime ? new Date(scheduledPublishTime * 1000).toISOString() : null,
    })
  } catch (err) {
    console.error('[Instagram Schedule] 실패:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ===== YouTube Data API v3 (OAuth 2.0 + upload) =====
const { google } = require('googleapis')

// Prefer environment variables, then fall back to client_secret.json for local development.
const ytCredentials = (() => {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'client_secret.json'), 'utf-8'))
    return raw.web || raw.installed
  } catch { return null }
})()

const YOUTUBE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/youtube/oauth/callback'
let ytOAuth2Client = null
let ytTokens = null

// Store OAuth tokens in Supabase when available, otherwise use a local file.
const ytTokenPath = path.join(__dirname, '.youtube_tokens.json')

async function loadYtTokens() {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('youtube_tokens').select('tokens').eq('id', 'default').maybeSingle()
      if (!error && data?.tokens) return data.tokens
    } catch (err) { console.warn('[YouTube] Supabase 토큰 로드 실패:', err.message) }
  }
  try {
    if (fs.existsSync(ytTokenPath)) return JSON.parse(fs.readFileSync(ytTokenPath, 'utf-8'))
  } catch {}
  return null
}

async function saveYtTokens(tokens) {
  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('youtube_tokens').upsert({
        id: 'default',
        tokens,
        updated_at: new Date().toISOString(),
      })
      if (error) console.warn('[YouTube] Supabase 토큰 저장 실패:', error.message)
      else return
    } catch (err) { console.warn('[YouTube] Supabase 토큰 저장 오류:', err.message) }
  }
  try { fs.writeFileSync(ytTokenPath, JSON.stringify(tokens, null, 2)) } catch {}
}

async function persistYtTokens(tokens) {
  const previousTokens = ytTokens || {}
  ytTokens = {
    ...previousTokens,
    ...(tokens || {}),
  }

  if (!ytTokens.refresh_token && previousTokens.refresh_token) {
    ytTokens.refresh_token = previousTokens.refresh_token
  }

  await saveYtTokens(ytTokens)
}

async function clearYtTokens() {
  if (supabaseAdmin) {
    try { await supabaseAdmin.from('youtube_tokens').delete().eq('id', 'default') } catch {}
  }
  try { fs.unlinkSync(ytTokenPath) } catch {}
}

// Load saved tokens asynchronously when the server starts.
loadYtTokens().then(t => { if (t) ytTokens = t })

function getYtOAuth2Client() {
  if (!ytCredentials) return null
  if (!ytOAuth2Client) {
    ytOAuth2Client = new google.auth.OAuth2(
      ytCredentials.client_id,
      ytCredentials.client_secret,
      YOUTUBE_REDIRECT_URI
    )
    ytOAuth2Client.on('tokens', (tokens) => {
      if (!tokens || Object.keys(tokens).length === 0) {
        return
      }

      persistYtTokens(tokens).catch((error) => {
        console.warn('[YouTube] refreshed token save failed:', error.message)
      })
    })
  }
  if (ytTokens) ytOAuth2Client.setCredentials(ytTokens)
  return ytOAuth2Client
}

async function validateYouTubeSession() {
  if (!ytCredentials) {
    return { authenticated: false, hasCredentials: false, state: 'unconfigured' }
  }

  if (!ytTokens) {
    return { authenticated: false, hasCredentials: true, state: 'expired' }
  }

  try {
    const client = getYtOAuth2Client()
    await client.getAccessToken()

    const youtube = google.youtube({ version: 'v3', auth: client })
    await youtube.channels.list({
      part: ['id'],
      mine: true,
      maxResults: 1,
    })

    return {
      authenticated: true,
      hasCredentials: true,
      state: 'connected',
    }
  } catch (error) {
    const detail = error?.response?.data?.error || error?.message || ''
    const shouldClearTokens =
      error?.code === 401 ||
      error?.status === 401 ||
      /invalid_grant|invalid_token|invalid credentials|unauthorized/i.test(String(detail))

    if (shouldClearTokens) {
      ytTokens = null
      try {
        if (ytOAuth2Client) {
          ytOAuth2Client.setCredentials({})
        }
      } catch {}
      await clearYtTokens()
    }

    return {
      authenticated: false,
      hasCredentials: true,
      state: 'expired',
      validationError: typeof detail === 'string' ? detail : JSON.stringify(detail),
    }
  }
}

async function validateInstagramSessionV2() {
  if (!IG_ACCESS_TOKEN || !IG_BUSINESS_ID) {
    return {
      connected: false,
      hasAccessToken: Boolean(IG_ACCESS_TOKEN),
      hasBusinessId: Boolean(IG_BUSINESS_ID),
      mode: 'server-token',
      state: 'expired',
    }
  }

  try {
    const response = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}?fields=id,username&access_token=${IG_ACCESS_TOKEN}`)
    const data = await response.json()

    if (!response.ok || data?.error || !data?.id) {
      const detail = data?.error?.message || `Instagram auth validation failed (${response.status})`
      return {
        connected: false,
        hasAccessToken: true,
        hasBusinessId: true,
        mode: 'server-token',
        state: 'expired',
        validationError: detail,
      }
    }

    return {
      connected: true,
      hasAccessToken: true,
      hasBusinessId: true,
      mode: 'server-token',
      state: 'connected',
      username: data.username || null,
    }
  } catch (error) {
    return {
      connected: false,
      hasAccessToken: true,
      hasBusinessId: true,
      mode: 'server-token',
      state: 'expired',
      validationError: error.message,
    }
  }
}

// Build the OAuth consent URL.
loadInstagramTokens().then((tokens) => {
  if (tokens) {
    instagramTokens = tokens
  }
})

async function validateInstagramSession() {
  const fallback = getInstagramFallbackAuth()
  const auth = getInstagramAuthMaterial()

  if (!auth?.accessToken || !auth?.businessId) {
    return {
      connected: false,
      hasAccessToken: false,
      hasBusinessId: false,
      mode: isInstagramOAuthConfigured() ? 'oauth' : 'server-token',
      state: isInstagramOAuthConfigured() ? 'expired' : 'unconfigured',
      canReconnect: isInstagramOAuthConfigured(),
      canDisconnect: false,
    }
  }

  try {
    const data = await instagramGraphGet(auth.businessId, auth.accessToken, {
      fields: 'id,username',
    })

    return {
      connected: true,
      hasAccessToken: true,
      hasBusinessId: true,
      mode: auth.mode,
      state: 'connected',
      username: data.username || auth.username || null,
      canReconnect: isInstagramOAuthConfigured(),
      canDisconnect: auth.mode === 'oauth',
    }
  } catch (error) {
    const detail = error.message
    const tokenLooksInvalid = /invalid|expired|unauthorized|session/i.test(detail)

    if (auth.mode === 'oauth' && tokenLooksInvalid) {
      await clearInstagramTokens()
    }

    return {
      connected: false,
      hasAccessToken: Boolean(fallback?.accessToken || instagramTokens?.accessToken),
      hasBusinessId: Boolean(fallback?.businessId || instagramTokens?.businessId),
      mode: auth.mode,
      state: isInstagramOAuthConfigured() ? 'expired' : 'unconfigured',
      validationError: detail,
      canReconnect: isInstagramOAuthConfigured(),
      canDisconnect: auth.mode === 'oauth' && Boolean(instagramTokens?.accessToken),
    }
  }
}

app.get('/api/instagram/auth-url', (_req, res) => {
  if (!isInstagramOAuthConfigured()) {
    return res.status(500).json({
      error: 'Instagram OAuth is not configured. META_APP_ID or INSTAGRAM_APP_ID, META_APP_SECRET or INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI are required.',
    })
  }

  instagramOAuthState = crypto.randomBytes(24).toString('hex')

  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  url.searchParams.set('client_id', META_APP_ID)
  url.searchParams.set('redirect_uri', INSTAGRAM_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set(
    'scope',
    [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
    ].join(',')
  )
  url.searchParams.set('state', instagramOAuthState)

  res.json({ url: url.toString() })
})

app.get('/api/instagram/oauth/callback', async (req, res) => {
  const { code, error, state } = req.query

  if (error) {
    return res.status(400).send(`<html><body><h2>Instagram 인증 거부</h2><p>${error}</p></body></html>`)
  }
  if (!code) {
    return res.status(400).send('Missing code')
  }
  if (instagramOAuthState && state !== instagramOAuthState) {
    return res.status(400).send('<html><body><h2>Instagram 인증 실패</h2><p>state mismatch</p></body></html>')
  }

  instagramOAuthState = null

  try {
    const shortUrl = new URL(`${IG_GRAPH_BASE}/oauth/access_token`)
    shortUrl.searchParams.set('client_id', META_APP_ID)
    shortUrl.searchParams.set('client_secret', META_APP_SECRET)
    shortUrl.searchParams.set('redirect_uri', INSTAGRAM_REDIRECT_URI)
    shortUrl.searchParams.set('code', String(code))

    const shortResponse = await fetch(shortUrl)
    const shortData = await shortResponse.json()
    if (!shortResponse.ok || !shortData.access_token) {
      throw new Error(shortData?.error?.message || 'Failed to exchange Instagram auth code')
    }

    const longUrl = new URL(`${IG_GRAPH_BASE}/oauth/access_token`)
    longUrl.searchParams.set('grant_type', 'fb_exchange_token')
    longUrl.searchParams.set('client_id', META_APP_ID)
    longUrl.searchParams.set('client_secret', META_APP_SECRET)
    longUrl.searchParams.set('fb_exchange_token', shortData.access_token)

    const longResponse = await fetch(longUrl)
    const longData = await longResponse.json()
    if (!longResponse.ok || !longData.access_token) {
      throw new Error(longData?.error?.message || 'Failed to upgrade Instagram access token')
    }

    const accessToken = longData.access_token
    const pages = await instagramGraphGet('me/accounts', accessToken, {
      fields: 'id,name,instagram_business_account{id,username}',
    })
    const page = (pages.data || []).find((item) => item.instagram_business_account?.id)
    if (!page?.instagram_business_account?.id) {
      throw new Error('No Instagram Business account is linked to this Meta account.')
    }

    const business = page.instagram_business_account
    await persistInstagramTokens({
      accessToken,
      businessId: business.id,
      username: business.username || null,
      pageId: page.id,
      updatedAt: new Date().toISOString(),
    })

    res.send('<html><body><h2>Instagram 인증 완료!</h2><p>이 창을 닫고 돌아가세요.</p><script>setTimeout(()=>window.close(),500)</script></body></html>')
  } catch (err) {
    console.error('[Instagram OAuth] callback failed:', err.message)
    res.status(500).send(`<html><body><h2>Instagram 인증 실패</h2><p>${err.message}</p></body></html>`)
  }
})

app.post('/api/instagram/logout', async (_req, res) => {
  await clearInstagramTokens()
  res.json({ success: true })
})

app.get('/api/youtube/auth-url', (req, res) => {
  const client = getYtOAuth2Client()
  if (!client) return res.status(500).json({ error: 'client_secret.json not found' })
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
  })
  res.json({ url })
})

app.get('/api/youtube/oauth/callback', async (req, res) => {
  const { code, error } = req.query
  console.log('[YouTube OAuth callback]', { hasCode: !!code, error })
  if (error) return res.status(400).send(`<html><body><h2>인증 거부</h2><p>${error}</p></body></html>`)
  if (!code) return res.status(400).send('Missing code')
  try {
    const client = getYtOAuth2Client()
    const { tokens } = await client.getToken(code)
    console.log('[YouTube OAuth] 토큰 획득 성공, scopes:', tokens.scope)
    client.setCredentials(tokens)
    await persistYtTokens(tokens)
    console.log('[YouTube OAuth] 토큰 저장 완료')
    res.send('<html><body><h2>YouTube 인증 완료!</h2><p>이 창을 닫고 돌아가세요.</p><script>setTimeout(()=>window.close(),500)</script></body></html>')
  } catch (err) {
    console.error('[YouTube OAuth] 토큰 획득 실패:', err.message)
    res.status(500).send(`<html><body><h2>인증 실패</h2><p>${err.message}</p></body></html>`)
  }
})

app.get('/api/youtube/auth-status', async (_req, res) => {
  try {
    const status = await validateYouTubeSession()
    res.json(status)
  } catch (error) {
    res.status(500).json({
      authenticated: false,
      hasCredentials: Boolean(ytCredentials),
      state: ytCredentials ? 'expired' : 'unconfigured',
      validationError: error.message,
    })
  }
})

app.post('/api/youtube/logout', async (req, res) => {
  ytTokens = null
  await clearYtTokens()
  if (ytOAuth2Client) ytOAuth2Client.revokeCredentials().catch(() => {})
  res.json({ success: true })
})

async function publishYouTubeVideoUpload(body = {}) {
  const snippet = body.snippet || {}
  const status = body.status || {}
  const title = body.title || snippet.title
  const description = body.description || snippet.description
  const tags = body.tags || snippet.tags
  const categoryId = body.categoryId || snippet.categoryId
  const privacyStatus = body.privacyStatus || status.privacyStatus
  const requestedPublishAt = body.scheduledAt || status.publishAt || null
  const videoUrl = body.videoUrl

  if (!ytTokens) {
    const error = new Error('YouTube 인증이 필요합니다. 먼저 Google 계정을 연결해 주세요.')
    error.code = 401
    throw error
  }
  if (!videoUrl) {
    const error = new Error('videoUrl이 필요합니다.')
    error.code = 400
    throw error
  }

  const publishAt = requestedPublishAt ? new Date(requestedPublishAt) : null
  if (publishAt && Number.isNaN(publishAt.getTime())) {
    const error = new Error('예약 발행 시간은 ISO 8601 형식이 필요합니다.')
    error.code = 400
    throw error
  }

  const client = getYtOAuth2Client()
  const youtube = google.youtube({ version: 'v3', auth: client })

  let videoBuffer
  // /output/ 경로는 hostname 무관하게 일단 로컬 파일을 시도한다 — 절대 URL
  // (https://<render-host>/output/...) 도 서버 자체 디스크를 가리키는 경우라서,
  // fetch 로 빙 돌리지 않고 직접 읽는 게 더 빠르고 안전하다 (Render 자체로의 외부
  // fetch 가 timeout 으로 실패하는 사례가 있었음).
  let localPath = null
  if (videoUrl.startsWith('/output/')) {
    localPath = path.join(__dirname, '..', videoUrl)
  } else {
    try {
      const parsed = new URL(videoUrl)
      if (parsed.pathname.startsWith('/output/')) {
        localPath = path.join(__dirname, '..', parsed.pathname)
      }
    } catch {}
  }
  if (localPath && fs.existsSync(localPath)) {
    videoBuffer = fs.readFileSync(localPath)
  } else {
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error(`영상 다운로드 실패: ${videoRes.status}`)
    videoBuffer = Buffer.from(await videoRes.arrayBuffer())
  }

  const tmpPath = path.join(__dirname, '..', 'output', `yt_upload_${Date.now()}.mp4`)
  fs.writeFileSync(tmpPath, videoBuffer)

  console.log('[YouTube] 업로드 시작:', { title, tags, size: videoBuffer.length })

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: title || 'Shorts test',
        description: description || '',
        tags: tags || [],
        categoryId: categoryId || '22',
      },
      status: {
        privacyStatus: publishAt ? 'private' : (privacyStatus || 'private'),
        ...(publishAt ? { publishAt: publishAt.toISOString() } : {}),
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(tmpPath),
    },
  })

  setTimeout(() => { try { fs.unlinkSync(tmpPath) } catch {} }, 5000)

  const videoId = response.data.id
  console.log('[YouTube] 업로드 완료:', videoId)

  return {
    success: true,
    videoId,
    scheduled: Boolean(publishAt),
    scheduledAt: publishAt ? publishAt.toISOString() : null,
    url: `https://youtu.be/${videoId}`,
    snippet: response.data.snippet,
  }
}

app.post('/api/youtube/upload', async (req, res) => {
  try {
    res.json(await publishYouTubeVideoUpload(req.body || {}))
  } catch (err) {
    console.error('[YouTube] 업로드 실패 전체:', JSON.stringify({
      code: err.code,
      message: err.message,
      status: err.status,
      errors: err.errors,
      response_data: err.response?.data,
      response_status: err.response?.status,
    }, null, 2))
    const detail = err.response?.data?.error?.message || err.errors?.[0]?.message || err.message
    res.status(err.code === 400 || err.code === 401 ? err.code : 500).json({ error: detail, code: err.code, fullError: err.response?.data })
  }
})

// ======================================================================
// Scheduled uploads backed by Supabase
// ======================================================================

const API_SECRET = process.env.API_SECRET || ''

function requireApiSecret(req, res, next) {
  const provided = req.headers['x-api-secret']
  if (!API_SECRET || provided !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// 예약 페이로드에 포함된 base64 data URL은 그대로 JSONB로 저장하면 수 MB 단위가 되어
// Supabase statement_timeout 을 초과한다. DB 에 쓰기 전에 Storage 공개 URL 로 치환한다.
async function normalizeScheduledContent(platform, rawContent) {
  if (!rawContent || typeof rawContent !== 'object') return rawContent || {}
  if (platform !== 'instagram' || !Array.isArray(rawContent.imageUrls)) return rawContent

  const normalizedImageUrls = await Promise.all(rawContent.imageUrls.map(async (url, idx) => {
    if (typeof url === 'string' && url.startsWith('data:')) {
      try {
        return await uploadDataUrlToStorage(url)
      } catch (err) {
        throw new Error(`이미지 ${idx + 1} Storage 업로드 실패: ${err.message}`)
      }
    }
    return url || null
  }))

  return {
    ...rawContent,
    imageUrls: normalizedImageUrls.filter(Boolean),
  }
}

app.post('/api/scheduled/create', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const { platform, extractionId, content, scheduledAt, scheduledId } = req.body
    if (!platform || !extractionId || !scheduledAt) {
      return res.status(400).json({ error: 'platform, extractionId, scheduledAt 필수' })
    }

    const normalizedContent = await normalizeScheduledContent(platform, content)

    if (scheduledId) {
      const { data, error } = await supabaseAdmin
        .from('scheduled_uploads')
        .update({
          scheduled_at: scheduledAt,
          content: normalizedContent || {},
        })
        .eq('id', scheduledId)
        .eq('extraction_id', extractionId)
        .eq('platform', platform)
        .eq('status', 'pending')
        .select()
        .single()

      if (error) throw error
      return res.json(data)
    }

    // If the same extraction/platform already has a pending reservation, update it instead.
    const { data: existingList } = await supabaseAdmin
      .from('scheduled_uploads')
      .select('*')
      .eq('extraction_id', extractionId)
      .eq('platform', platform)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (existingList && existingList.length > 0) {
      const first = existingList[0]
      // Remove duplicate pending rows and keep the newest one.
      if (existingList.length > 1) {
        const extraIds = existingList.slice(1).map(r => r.id)
        await supabaseAdmin.from('scheduled_uploads').delete().in('id', extraIds)
      }
      const { data, error } = await supabaseAdmin
        .from('scheduled_uploads')
        .update({
          scheduled_at: scheduledAt,
          content: normalizedContent || first.content || {},
        })
        .eq('id', first.id)
        .select()
        .single()
      if (error) throw error
      return res.json(data)
    }

    const { data, error } = await supabaseAdmin
      .from('scheduled_uploads')
      .insert({
        platform,
        extraction_id: extractionId,
        content: normalizedContent || {},
        scheduled_at: scheduledAt,
        status: 'pending',
      })
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Scheduled upload list
app.get('/api/scheduled/list', async (req, res) => {
  if (!supabaseAdmin) return res.json([])
  try {
    const { data, error } = await supabaseAdmin
      .from('scheduled_uploads')
      .select('id, platform, extraction_id, scheduled_at, status, uploaded_url, uploaded_at, error, attempts, created_at, content, content_title:content->>title')
      .order('scheduled_at', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (err) {
    if (err?.code === '42P01') {
      console.warn('[scheduled/list] scheduled_uploads 테이블이 없어 빈 목록으로 처리합니다.')
      return res.json([])
    }
    res.status(500).json({ error: err.message })
  }
})

// Delete a scheduled upload row
app.delete('/api/scheduled/:id', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const { error } = await supabaseAdmin
      .from('scheduled_uploads')
      .delete()
      .eq('id', req.params.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update a scheduled upload row
app.patch('/api/scheduled/:id', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const { scheduledAt, status, content } = req.body
    const patch = {}
    if (scheduledAt) patch.scheduled_at = scheduledAt
    if (status) patch.status = status
    if (content) {
      const { data: existing } = await supabaseAdmin
        .from('scheduled_uploads')
        .select('platform')
        .eq('id', req.params.id)
        .maybeSingle()
      patch.content = await normalizeScheduledContent(existing?.platform, content)
    }
    const { data, error } = await supabaseAdmin
      .from('scheduled_uploads')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- 숏폼(쇼츠/릴스) 플랫폼별 업로드 상태 헬퍼 ---
// upload_status.shorts 는 인스타그램/유튜브를 따로 추적한다.
// client/src/utils/shortsUploadStatus.js 와 동일한 규칙을 서버에서도 적용한다.
const SHORTS_PLATFORM_KEYS = ['instagram', 'youtube']

function normalizeShortsPlatformMeta(meta) {
  const src = meta && typeof meta === 'object' ? meta : {}
  const status = ['not_uploaded', 'scheduled', 'uploaded'].includes(src.status) ? src.status : 'not_uploaded'
  return {
    status,
    uploadedAt: src.uploadedAt || null,
    uploadedUrl: src.uploadedUrl || null,
    scheduledAt: src.scheduledAt || null,
    scheduledId: src.scheduledId || null,
  }
}

function deriveShortsPlatforms(shortsMeta) {
  const meta = shortsMeta && typeof shortsMeta === 'object' ? shortsMeta : {}
  if (meta.platforms && typeof meta.platforms === 'object') {
    return {
      instagram: normalizeShortsPlatformMeta(meta.platforms.instagram),
      youtube: normalizeShortsPlatformMeta(meta.platforms.youtube),
    }
  }
  const uploadedUrls = meta.uploadedUrls && typeof meta.uploadedUrls === 'object' ? meta.uploadedUrls : {}
  const targets = meta.uploadTargets && typeof meta.uploadTargets === 'object' ? meta.uploadTargets : null
  const result = {}
  for (const key of SHORTS_PLATFORM_KEYS) {
    if (uploadedUrls[key]) {
      result[key] = normalizeShortsPlatformMeta({ status: 'uploaded', uploadedUrl: uploadedUrls[key], uploadedAt: meta.uploadedAt || null })
    } else if (meta.status === 'uploaded' && (!targets || targets[key])) {
      result[key] = normalizeShortsPlatformMeta({ status: 'uploaded', uploadedAt: meta.uploadedAt || null })
    } else if (meta.status === 'scheduled' && (!targets || targets[key])) {
      result[key] = normalizeShortsPlatformMeta({ status: 'scheduled', scheduledAt: meta.scheduledAt || null })
    } else {
      result[key] = normalizeShortsPlatformMeta({ status: 'not_uploaded' })
    }
  }
  return result
}

function aggregateShortsStatus(platforms) {
  const list = SHORTS_PLATFORM_KEYS.map((key) => platforms?.[key]?.status || 'not_uploaded')
  if (list.every((status) => status === 'uploaded')) return 'uploaded'
  if (list.some((status) => status === 'not_uploaded')) return 'not_uploaded'
  return 'scheduled'
}

function buildShortsUploadStatus(prevShortsMeta, patches = {}) {
  const platforms = deriveShortsPlatforms(prevShortsMeta)
  for (const key of SHORTS_PLATFORM_KEYS) {
    if (patches[key]) {
      platforms[key] = normalizeShortsPlatformMeta({ ...platforms[key], ...patches[key] })
    }
  }
  const uploadedUrls = {
    instagram: platforms.instagram.uploadedUrl || null,
    youtube: platforms.youtube.uploadedUrl || null,
  }
  const uploadedAts = SHORTS_PLATFORM_KEYS
    .map((key) => platforms[key].uploadedAt)
    .filter(Boolean)
    .sort()
  return {
    status: aggregateShortsStatus(platforms),
    platforms,
    uploadedUrls,
    uploadedUrl: uploadedUrls.instagram || uploadedUrls.youtube || null,
    uploadedAt: uploadedAts.length ? uploadedAts[uploadedAts.length - 1] : null,
  }
}

// Called by GitHub Actions to execute due scheduled uploads.
app.post('/api/scheduled/run', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })

  try {
    // Find pending rows whose scheduled time has already passed.
    const nowIso = new Date().toISOString()
    const { data: dueItems, error: fetchErr } = await supabaseAdmin
      .from('scheduled_uploads')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(10)

    if (fetchErr) throw fetchErr

    const results = []
    for (const item of (dueItems || [])) {
      // Mark the row as actively uploading.
      await supabaseAdmin
        .from('scheduled_uploads')
        .update({ status: 'uploading', attempts: (item.attempts || 0) + 1 })
        .eq('id', item.id)

      try {
        let uploadResult = null

        // 예약 실행 경로는 인스타그램만 유지한다.
        // 레거시 YouTube/블로그 예약 실행 경로는 제거됨
        if (item.platform === 'instagram') {
          const c = item.content || {}
          let imageUrls = c.imageUrls || []
          let caption = c.caption || ''

          // If the row content is missing images, reload them from the extraction row.
          if (!imageUrls.length && item.extraction_id) {
            const { data: ext } = await supabaseAdmin
              .from('extractions')
              .select('instagram_images, instagram_content')
              .eq('id', item.extraction_id)
              .maybeSingle()
            const igImgs = ext?.instagram_images || []
            imageUrls = igImgs
              .map(img => img?.renderedImageUrl || img?.pngUrl || img?.url || img?.imageUrl)
              .filter(Boolean)
            const igContent = ext?.instagram_content
            if (!caption && igContent) {
              const hashtags = (igContent.hashtags || []).map(t => String(t).startsWith('#') ? t : `#${t}`).join(' ')
              caption = `${igContent.caption || ''}\n\n${hashtags}`.trim()
            }
          }

          // Instagram Graph API는 공개 HTTPS URL만 받으므로 data: URL을 Supabase Storage 공개 URL로 치환한다.
          const publicImageUrls = []
          for (const url of imageUrls) {
            if (typeof url === 'string' && url.startsWith('data:')) {
              publicImageUrls.push(await uploadDataUrlToStorage(url))
            } else if (url) {
              publicImageUrls.push(url)
            }
          }

          const result = await publishInstagramPostV2({ imageUrls: publicImageUrls, caption })
          uploadResult = { url: result.permalink, mediaId: result.mediaId }

        } else if (item.platform === 'shorts' || item.platform === 'shorts_instagram' || item.platform === 'shorts_youtube') {
          const { data: ext } = await supabaseAdmin
            .from('extractions')
            .select('shorts_video, shorts_script')
            .eq('id', item.extraction_id)
            .maybeSingle()

          const video = ext?.shorts_video || {}
          const script = ext?.shorts_script || {}
          const videoUrl = video.combinedVideoUrl || video.url || video.videoUrl
          if (!videoUrl) throw new Error('쇼츠/릴스 영상 URL이 없습니다.')

          // 플랫폼별 예약 행(shorts_instagram/shorts_youtube)이면 해당 플랫폼만,
          // 레거시 'shorts' 행이면 content.uploadTargets 를 따른다.
          const targets = item.platform === 'shorts_instagram'
            ? { instagram: true, youtube: false }
            : item.platform === 'shorts_youtube'
              ? { instagram: false, youtube: true }
              : (item.content?.uploadTargets || { instagram: true, youtube: true })
          const uploadedUrls = { instagram: null, youtube: null }
          const media = {}

          if (targets.instagram) {
            const publicVideoUrl = await ensurePublicInstagramVideoUrl(videoUrl)
            const result = await publishInstagramReelV2({
              videoUrl: publicVideoUrl,
              caption: buildReelsCaption(script),
            })
            uploadedUrls.instagram = result.permalink || result.url || null
            media.instagramMediaId = result.mediaId || result.id || null
          }

          if (targets.youtube) {
            const result = await publishYouTubeVideoUpload(buildShortsUploadPayload({
              script,
              videoUrl,
            }))
            uploadedUrls.youtube = result.url || null
            media.youtubeVideoId = result.videoId || null
          }

          uploadResult = {
            ...media,
            isShorts: true,
            uploadedUrls,
            url: uploadedUrls.instagram || uploadedUrls.youtube || null,
          }
        } else {
          throw new Error(`지원하지 않는 플랫폼: ${item.platform}`)
        }

        // Mark the scheduled upload as completed.
        const uploadedAtIso = new Date().toISOString()
        await supabaseAdmin
          .from('scheduled_uploads')
          .update({
            status: 'completed',
            uploaded_url: uploadResult?.url || null,
            uploaded_at: uploadedAtIso,
            error: null,
          })
          .eq('id', item.id)

        // Reflect the completion in extractions.upload_status for the content list UI.
        if (item.extraction_id) {
          try {
            const { data: extRow } = await supabaseAdmin
              .from('extractions')
              .select('upload_status')
              .eq('id', item.extraction_id)
              .maybeSingle()
            const prevStatus = extRow?.upload_status || {}
            let newStatus
            if (uploadResult?.isShorts) {
              // 숏폼: 실제 업로드된 플랫폼만 표시하고 나머지는 기존 상태를 유지한다.
              const patches = {}
              if (uploadResult.uploadedUrls?.instagram) {
                patches.instagram = { status: 'uploaded', uploadedAt: uploadedAtIso, uploadedUrl: uploadResult.uploadedUrls.instagram }
              }
              if (uploadResult.uploadedUrls?.youtube) {
                patches.youtube = { status: 'uploaded', uploadedAt: uploadedAtIso, uploadedUrl: uploadResult.uploadedUrls.youtube }
              }
              newStatus = {
                ...prevStatus,
                shorts: buildShortsUploadStatus(prevStatus.shorts, patches),
              }
            } else {
              newStatus = {
                ...prevStatus,
                [item.platform]: {
                  status: 'uploaded',
                  uploadedAt: uploadedAtIso,
                  uploadedUrl: uploadResult?.url || null,
                },
              }
            }
            await supabaseAdmin
              .from('extractions')
              .update({ upload_status: newStatus })
              .eq('id', item.extraction_id)
          } catch (e) {
            console.warn('[extractions.upload_status 업데이트 실패]', e.message)
          }
        }

        results.push({ id: item.id, ok: true, url: uploadResult?.url })

      } catch (uploadErr) {
        await supabaseAdmin
          .from('scheduled_uploads')
          .update({
            status: 'failed',
            error: uploadErr.message,
          })
          .eq('id', item.id)
        results.push({ id: item.id, ok: false, error: uploadErr.message })
      }
    }

    res.json({ processed: results.length, results })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ======================================================================
// Extractions backed by Supabase
// ======================================================================

app.get('/api/extractions', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    const page = req.query.page ? Number(req.query.page) : null
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : null
    const { channel, status, search } = req.query
    const result = await listExtractions(
      Number.isFinite(page) && Number.isFinite(pageSize)
        ? { page, pageSize, channel, status, search }
        : { channel, status, search }
    )
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/extractions', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    const item = await saveExtraction(req.body || {}, req)
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/extractions/:id', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    const item = await fetchExtractionById(req.params.id)
    if (!item) return res.status(404).json({ error: 'Extraction not found.' })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/extractions/:id', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    await deleteExtraction(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/extractions/:id/media', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    const item = await updateExtractionMedia(req.params.id, req.body || {}, req)
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/extractions/:id/content', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    const item = await updateExtractionContent(req.params.id, req.body || {})
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/extractions/:id/upload-status', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    const { channel, info } = req.body || {}
    if (!channel) return res.status(400).json({ error: 'channel is required' })
    const item = await updateUploadStatus(req.params.id, channel, info || {})
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/extractions/:id/channels/:channel', async (req, res) => {
  try {
    ensureSupabaseConfigured()
    const item = await deleteExtractionChannel(req.params.id, req.params.channel)
    res.json({ ok: true, item })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`)
})

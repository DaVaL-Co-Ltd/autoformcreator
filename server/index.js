import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { execFile } from 'child_process'
import crypto from 'crypto'
import { publishInstagramMediaWithRetry } from './services/instagram-publish.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const sharp = require('sharp')
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas')
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
registerOptionalFont('TmoneyRoundWind-Regular.woff', 'TmoneyRoundWind')
registerOptionalFont('KBODiaGothic-Light.woff', 'KBODiaGothic')
registerOptionalFont('A2z-Bold.woff2', 'A2z')

// Supabase ?대씪?댁뼵??(?쒕쾭 ?꾩슜)
const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

const app = express()

// CORS: ALLOWED_ORIGINS ?섍꼍蹂???덉쑝硫??쒗븳, ?놁쑝硫??꾩껜 ?덉슜 (媛쒕컻??
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || null
app.use(cors({
  origin: allowedOrigins || true,
  credentials: true,
}))

// JSON body for most routes (LlamaParse upload ?쒖쇅)
app.use((req, res, next) => {
  if (req.path === '/api/llamaparse/upload') return next()
  if (req.path === '/api/output/upload') return next()
  if (req.path === '/api/output/save') return next()
  express.json({ limit: '150mb' })(req, res, next)
})

// API ?쒗겕由?寃利?誘몃뱾?⑥뼱 (/api/* ?붾뱶?ъ씤??蹂댄샇)
// ?덉쇅: /health, /api/youtube/oauth/callback (Google??由щ뵒?됲듃?섎뒗 怨듦컻 ?붾뱶?ъ씤??
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  if (req.path === '/api/youtube/oauth/callback') return next()
  if (req.path === '/api/youtube/auth-url') return next()
  if (req.path === '/api/youtube/auth-status') return next()
  if (req.path === '/api/instagram/oauth/callback') return next()
  const expected = process.env.API_SECRET
  if (!expected) return next() // dev ?몄쓽: 誘몄꽕?????듦낵
  const provided = req.headers['x-app-secret']
  if (provided !== expected) {
    console.log(`[AUTH FAIL] path=${req.path} provided=${provided?.slice(0, 20)} expected=${expected?.slice(0, 20)}`)
    return res.status(401).json({ error: 'Unauthorized: invalid x-app-secret' })
  }
  next()
})

// LlamaParse Proxy - Upload (forward multipart as-is)
app.post('/api/llamaparse/upload', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const apiKey = process.env.LLAMAPARSE_API_KEY
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
    const apiKey = process.env.LLAMAPARSE_API_KEY
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
    const apiKey = process.env.LLAMAPARSE_API_KEY
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

// ===== HeyGen ?꾨━???꾨컮? 紐⑸줉 =====
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

// ===== HeyGen 而ㅼ뒪? ?꾨컮? 紐⑸줉 (?щ’ ?뺤씤?? =====
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

// ===== HeyGen 而ㅼ뒪? ?꾨컮? 紐⑸줉 (?щ? ?뺤씤?? =====
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

// ===== HeyGen ?꾨컮? ?곹깭 ?뺤씤 (avatars 紐⑸줉?먯꽌 議고쉶) =====
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

// ===== HeyGen ?뚯뒪?몄슜: ?깃났???대?吏 吏곸젒 ?낅줈??=====
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

// ===== HeyGen Upload Asset (base64 or filePath ??binary ??HeyGen) =====
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

// ===== HeyGen Avatar Group ?앹꽦 (image_key ??talking_photo_id) =====
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

// ===== 紐⑥뀡 諛곌꼍 ?곸긽 ?앹꽦 (FFmpeg) =====
app.post('/api/background/generate', async (req, res) => {
  const { style = 'gradient', duration = 8 } = req.body
  const outputDir2 = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir2)) fs.mkdirSync(outputDir2, { recursive: true })

  const ts = Date.now()
  const outputPath = path.join(outputDir2, `bg_${style}_${ts}.mp4`)

  // FFmpeg ?꾪꽣濡?紐⑥뀡 諛곌꼍 ?앹꽦 (1080x1920, 9:16)
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

// ===== ??댄? 諛곌꼍 ?대?吏 ?앹꽦 (Canvas, ?쇱そ ?곷떒 ??댄?) =====
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

    // ?щ챸 諛곌꼍 (?꾨컮? ?꾩뿉 ?ㅻ쾭?덉씠)
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

    // ?띿뒪?몃? ?щ윭 以꾨줈 遺꾪븷 (?뱀닔臾몄옄, 怨듬갚 湲곗?)
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
          // ?뱀닔臾몄옄??怨듬갚?먯꽌 ?먮Ⅴ湲?
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

// ===== ?명룷洹몃옒??諛곌꼍 ?대?吏 ?앹꽦 (Canvas + ?쒓? ?고듃) =====
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

app.post('/api/infographic/generate', async (req, res) => {
  const { scenes } = req.body
  if (!scenes?.length) return res.status(400).json({ error: 'Missing scenes' })

  const outputDir2 = path.join(__dirname, '..', 'output')
  if (!fs.existsSync(outputDir2)) fs.mkdirSync(outputDir2, { recursive: true })

  const results = []
  const themes = [
    { bg: '#F5F0E8', accent: '#D4A574', text: '#2D2016', sub: '#8B7355' },
    { bg: '#E8F0F5', accent: '#5B9BD5', text: '#1A2E3D', sub: '#5A7A94' },
    { bg: '#F0E8F5', accent: '#9B6BC5', text: '#2D1A3D', sub: '#7A5A94' },
    { bg: '#E8F5EE', accent: '#5BC58A', text: '#1A3D2D', sub: '#5A947A' },
    { bg: '#FFF8E8', accent: '#E5A83B', text: '#3D2D0A', sub: '#947A3A' },
  ]

  for (const scene of scenes) {
    if (scene.type !== 'infographic') continue
    const ts = Date.now()
    const filename = `infographic_${scene.sceneNumber}_${ts}.png`
    const filePath = path.join(outputDir2, filename)

    const theme = themes[(scene.sceneNumber - 1) % themes.length]
    const title = scene.keyword || ''
    const bullets = scene.bullets || []
    const narration = scene.narration || ''

    const W = 1080, H = 1920
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')

    // 諛곌꼍
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, W, H)

    // ?곷떒 ?μ떇 ??
    ctx.globalAlpha = 0.2; ctx.fillStyle = theme.accent
    ctx.beginPath(); ctx.arc(480, 200, 45, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.3
    ctx.beginPath(); ctx.arc(600, 200, 45, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    // ?쒕ぉ
    ctx.font = '52px Pretendard'
    ctx.fillStyle = theme.text
    ctx.textAlign = 'center'
    ctx.fillText(title, W / 2, 400)

    // 援щ텇??
    ctx.fillStyle = theme.accent; ctx.globalAlpha = 0.5
    roundRect(ctx, 340, 440, 400, 4, 2); ctx.fill()
    ctx.globalAlpha = 1

    // 諛?李⑦듃
    bullets.forEach((b, i) => {
      const y = 600 + i * 200
      const parts = b.split(':')
      const label = parts[0]?.trim() || b
      const value = parts[1]?.trim() || ''
      const numMatch = value.match(/[\d.]+/)
      const barWidth = numMatch ? Math.min(750, Math.max(200, parseFloat(numMatch[0]) * 10)) : 500

      // ?쇰꺼
      ctx.font = '38px Pretendard'
      ctx.fillStyle = theme.text
      ctx.textAlign = 'left'
      ctx.fillText(label, 120, y)

      // 諛곌꼍 諛?
      ctx.globalAlpha = 0.3; ctx.fillStyle = theme.accent
      roundRect(ctx, 120, y + 20, barWidth, 55, 28); ctx.fill()
      // 吏꾪뻾 諛?
      ctx.globalAlpha = 1; ctx.fillStyle = theme.accent
      roundRect(ctx, 120, y + 20, barWidth * 0.85, 55, 28); ctx.fill()

      // 媛?
      ctx.font = '34px Pretendard'
      ctx.fillStyle = theme.accent
      ctx.textAlign = 'left'
      ctx.fillText(value, 140 + barWidth * 0.85, y + 58)
    })

    // ?뚰꽣留덊겕
    ctx.font = '22px Pretendard'
    ctx.fillStyle = theme.sub
    ctx.globalAlpha = 0.5
    ctx.textAlign = 'right'
    ctx.fillText('MYBIZ', 1010, 1870)
    ctx.globalAlpha = 1

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

function escapeXml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ===== ?명룷洹몃옒???대?吏 ??HeyGen ?낅줈????URL 諛섑솚 =====
app.post('/api/infographic/upload-to-heygen', async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY
  const { localPath } = req.body
  if (!apiKey) return res.status(500).json({ error: 'HEYGEN_API_KEY not configured on server' })
  if (!localPath || !fs.existsSync(localPath)) return res.status(400).json({ error: 'File not found' })

  try {
    const buffer = fs.readFileSync(localPath)
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

// ===== ?먮쭑 踰덉씤 (FFmpeg) =====
// ?섎젅?댁뀡??理쒕? maxLines以??⑥쐞濡?遺꾪븷
function splitNarration(text, maxCharsPerLine = 18) {
  const chunks = []
  let remaining = text.trim()
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      chunks.push(remaining)
      break
    }
    // ?먯뿰?ㅻ윭???딄?: 留덉묠?? ?쇳몴, 怨듬갚 湲곗?
    let cut = -1
    for (let i = Math.min(maxCharsPerLine, remaining.length) - 1; i >= Math.floor(maxCharsPerLine * 0.5); i--) {
      if (/[.!??귨펽,\s]/.test(remaining[i])) { cut = i + 1; break }
    }
    if (cut === -1) cut = maxCharsPerLine
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  return chunks
}

// ?ㅽ??쇰퀎 FFmpeg force_style 留ㅽ븨 (9:16 ?좏뒠釉??쇱툩 湲곗?)
const subtitleFontConfigs = {
  default: { fontName: 'Pretendard Variable', fontSize: 10, marginV: 20, bold: 0, italic: 0, spacing: 0 },
  bold: { fontName: 'A2z', fontSize: 10.8, marginV: 20, bold: -1, italic: 0, spacing: 0.2 },
  dongle: { fontName: 'TmoneyRoundWind', fontSize: 11.2, marginV: 18, bold: 0, italic: 0, spacing: 0 },
  handwriting: { fontName: 'Maplestory', fontSize: 10.4, marginV: 20, bold: 0, italic: 0, spacing: 0.05 },
  gothic: { fontName: 'KBODiaGothic', fontSize: 10.2, marginV: 20, bold: 0, italic: 0, spacing: 0.35 },
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

// ??댄? ?ㅻ쾭?덉씠 ?대?吏 ?앹꽦 (Canvas, ?щ챸 諛곌꼍)
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

  // 以꾨컮轅?
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

app.post('/api/subtitle/burn', async (req, res) => {
  const { videoUrl, scenes, subtitleStyle, subtitleFont, animatedTitles } = req.body
  if (!videoUrl || !scenes?.length) return res.status(400).json({ error: 'Missing videoUrl or scenes' })
  // animatedTitles: [{ sceneNumber, localPath }] ??WebM ?뚰뙆 ?곸긽 ?ㅻ쾭?덉씠
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
    // 1) HeyGen ?곸긽 ?ㅼ슫濡쒕뱶
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error(`?곸긽 ?ㅼ슫濡쒕뱶 ?ㅽ뙣: ${videoRes.status}`)
    const buffer = Buffer.from(await videoRes.arrayBuffer())
    fs.writeFileSync(inputPath, buffer)

    // 2) ?곸긽 湲몄씠 ?뺤씤
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

    // 3) SRT ?앹꽦 ??湲곕낯 2以? 珥?3以꾩씠硫?3以??좎?, 4以??댁긽?대㈃ 2以꾩뵫 遺꾪븷
    const maxCharsPerLine = 16
    let srtContent = ''
    let srtIdx = 1
    const totalChars = scenes.reduce((sum, s) => sum + (s.narration || '').length, 0) || 1
    let currentTime = 0

    for (const scene of scenes) {
      const sceneDur = (scene.narration.length / totalChars) * duration
      const lines = splitNarration(scene.narration, maxCharsPerLine)
      // 釉붾줉 遺꾪븷: 2以?湲곕낯, 3以꾩? 洹몃?濡??좎?, 4以??댁긽? 2以꾩뵫
      const blocks = []
      const linesPerBlock = lines.length === 3 ? 3 : 2
      for (let j = 0; j < lines.length; j += linesPerBlock) {
        blocks.push(lines.slice(j, j + linesPerBlock).join('\n'))
      }
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

    // 4) ??댄? ?ㅻ쾭?덉씠 ?앹꽦 (avatar_keyword ?? ??animatedTitles ?덉쑝硫?WebM, ?놁쑝硫?PNG
    const titleOverlays = []
    let titleTime = 0
    for (const scene of scenes) {
      const sceneDur = (scene.narration.length / totalChars) * duration
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

    // 5) FFmpeg濡??먮쭑 + ??댄? ?ㅻ쾭?덉씠 踰덉씤
    const srtPathEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    const fontsDirEscaped = path.join(__dirname, 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:')
    const resolvedFont = getSubtitleFontConfig(subtitleFont || 'default')
    const forceStyle = getForceStyle(subtitleStyle || 'classic', subtitleFont || 'default')

    // FFmpeg ?꾪꽣 援ъ꽦: ?먮쭑 + ??댄? ?ㅻ쾭?덉씠 (?좊땲硫붿씠??WebM? itsoffset?쇰줈 ??대컢 留욎땄)
    let filterComplex = ''
    const inputs = ['-i', inputPath]
    titleOverlays.forEach((t) => {
      if (t.animated) {
        // WebM ?뚰뙆 ?곸긽: itsoffset?쇰줈 ???쒖옉 ?쒓컙??留욎텛怨? ??湲몄씠留뚰겮 諛섎났
        inputs.push('-itsoffset', t.start.toFixed(3), '-stream_loop', '-1', '-i', t.path)
      } else {
        inputs.push('-i', t.path)
      }
    })

    if (titleOverlays.length > 0) {
      // overlay 泥댁씤: [0]???먮쭑 ????댄? ?쒖감 ?ㅻ쾭?덉씠
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
        const args = [...inputs, '-filter_complex', filterComplex, '-map', '[out]', '-map', '0:a', '-c:a', 'copy', '-y', outputPath]
        execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`FFmpeg ?ㅻ쪟: ${err.message}\n${(stderr || '').slice(-500)}`))
          else resolve()
        })
      })
    } else {
      // ??댄? ?놁쑝硫??먮쭑留?
      await new Promise((resolve, reject) => {
        const args = [
          '-i', inputPath,
          '-vf', `subtitles='${srtPathEscaped}':fontsdir='${fontsDirEscaped}':force_style='${forceStyle}'`,
          '-c:a', 'copy',
          '-y', outputPath,
        ]
        execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`FFmpeg ?ㅻ쪟: ${err.message}\n${(stderr || '').slice(-500)}`))
          else resolve()
        })
      })
    }

    // ??댄? ?꾩떆 ?뚯씪 ?뺣━ (PNG留???젣, ?좊땲硫붿씠??WebM? 蹂댁〈)
    titleOverlays.forEach(t => { if (t.cleanup) { try { fs.unlinkSync(t.path) } catch {} } })

    // 5) ?묐떟
    const size = fs.statSync(outputPath).size
    const url = `/output/final_${ts}.mp4`
    res.json({
      url,
      size,
      srtUrl: `/output/subtitle_${ts}.srt`,
      requestedFont: subtitleFont || 'default',
      resolvedFont: resolvedFont.fontName,
    })

    // ?먮낯 ?뚯씪 ?뺣━ (吏????젣)
    setTimeout(() => { try { fs.unlinkSync(inputPath) } catch {} }, 60000)
  } catch (err) {
    try { fs.unlinkSync(inputPath) } catch {}
    try { fs.unlinkSync(srtPath) } catch {}
    res.status(500).json({ error: err.message })
  }
})

// ===== Remotion ?쒕쾭?ъ씠???뚮뜑留?=====
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

    // 踰덈뱾 罹먯떛 + ?뚯뒪 蹂寃????먮룞 ?щ쾲?ㅻ쭅
    const sourceMtime = getRemotionSourceMtime()
    if (!remotionBundleUrl || sourceMtime > remotionBundleMtime) {
      console.log(`[Remotion] ${remotionBundleUrl ? '?뚯뒪 蹂寃?媛먯?, ?щ쾲?ㅻ쭅' : '踰덈뱾留??쒖옉'}...`)
      const entryPoint = path.join(__dirname, '..', 'client', 'src', 'remotion', 'index.jsx')
      remotionBundleUrl = await bundle({
        entryPoint,
        onProgress: (p) => { if (p % 20 === 0) console.log(`[Remotion] 踰덈뱾 吏꾪뻾: ${p}%`) },
      })
      remotionBundleMtime = sourceMtime
      console.log('[Remotion] 踰덈뱾 ?꾨즺:', remotionBundleUrl)
    }

    // 而댄룷吏???좏깮
    const composition = await selectComposition({
      serveUrl: remotionBundleUrl,
      id: compositionId,
      inputProps: props || {},
    })

    // durationInFrames / fps ?ㅻ쾭?쇱씠??
    composition.durationInFrames = durationInFrames
    composition.fps = fps

    const ts = Date.now()
    const ext = transparent ? 'webm' : 'mp4'
    const codec = transparent ? 'vp8' : 'h264'
    const outputPath = path.join(outputDir2, `remotion_${compositionId}_${ts}.${ext}`)

    console.log(`[Remotion] ?뚮뜑 ?쒖옉: ${compositionId} (${durationInFrames}f, ${fps}fps, ${codec}${transparent ? ', transparent' : ''})`)
    await renderMedia({
      composition,
      serveUrl: remotionBundleUrl,
      codec,
      outputLocation: outputPath,
      inputProps: props || {},
      imageFormat: transparent ? 'png' : 'jpeg',
      pixelFormat: transparent ? 'yuva420p' : 'yuv420p',
    })
    console.log(`[Remotion] ?뚮뜑 ?꾨즺: ${outputPath}`)

    const size = fs.statSync(outputPath).size
    res.json({ url: `/output/remotion_${compositionId}_${ts}.${ext}`, filePath: outputPath, size })
  } catch (err) {
    console.error('[Remotion] ?뚮뜑 ?먮윭:', err)
    // 踰덈뱾 ?먮윭 ??罹먯떆 珥덇린??
    if (err.message?.includes('bundle')) remotionBundleUrl = null
    res.status(500).json({ error: err.message })
  }
})

// Remotion ?뚮뜑留?寃곌낵 MP4 ??HeyGen ?낅줈??
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
// ngrok 臾대즺 寃쎄퀬 ?섏씠吏 ?고쉶: Content-Type??媛뺤젣 ?ㅼ젙
app.use('/output', (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase()
  const mimeMap = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg' }
  if (mimeMap[ext]) res.setHeader('Content-Type', mimeMap[ext])
  res.setHeader('ngrok-skip-browser-warning', 'true')
  next()
}, express.static(outputDir))

// ===== File upload ??public URL =====
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

  // 60珥???꾩븘??(Imagen ?대?吏 ?⑸웾 ?鍮?
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

// ?대?吏 ?낅줈??(?⑥씪 ?먮뒗 罹먮윭?)
async function publishInstagramPostLegacy({ imageUrls = [], caption = '' }) {
  if (!IG_ACCESS_TOKEN || !IG_BUSINESS_ID) {
    throw new Error('Instagram environment variables are missing: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID')
  }
  if (!imageUrls.length) throw new Error('?대?吏 URL???놁뒿?덈떎')

  const urls = imageUrls.filter(Boolean).slice(0, 10)
  if (urls.length === 1) {
    // ?⑥씪 ?대?吏
    const createRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: urls[0], caption, access_token: IG_ACCESS_TOKEN }),
    })
    const created = await createRes.json()
    if (!createRes.ok || !created.id) throw new Error(`而⑦뀒?대꼫 ?앹꽦 ?ㅽ뙣: ${JSON.stringify(created)}`)
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

  // 罹먮윭? (?щ윭 ?대?吏)
  const childIds = []
  for (const url of urls) {
    const r = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: IG_ACCESS_TOKEN }),
    })
    const d = await r.json()
    if (!r.ok || !d.id) throw new Error(`罹먮윭? ?먯떇 ?앹꽦 ?ㅽ뙣: ${JSON.stringify(d)}`)
    childIds.push(d.id)
  }

  // ?먯떇 誘몃뵒?대뱾??FINISHED ???뚭퉴吏 ?湲?
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
  if (!carouselRes.ok || !carousel.id) throw new Error(`罹먮윭? 而⑦뀒?대꼫 ?앹꽦 ?ㅽ뙣: ${JSON.stringify(carousel)}`)

  // 罹먮윭? 而⑦뀒?대꼫??FINISHED ???뚭퉴吏 ?湲?
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

// 誘몃뵒??而⑦뀒?대꼫媛 寃뚯떆 以鍮꾨맆 ?뚭퉴吏 ?湲?(理쒕? 60珥?
async function waitForMediaReadyLegacy(mediaIds, maxWait = 60000) {
  const interval = 2000
  const start = Date.now()
  for (const id of mediaIds) {
    while (Date.now() - start < maxWait) {
      const r = await fetch(`${IG_GRAPH_BASE}/${id}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`)
      const d = await r.json()
      if (d.status_code === 'FINISHED') break
      if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED') {
        throw new Error(`誘몃뵒??泥섎━ ?ㅽ뙣 (${id}): ${d.status_code}`)
      }
      await new Promise(res => setTimeout(res, interval))
    }
  }
}

// base64 data URL??Supabase Storage???낅줈????怨듦컻 URL 諛섑솚
async function uploadDataUrlToStorage(dataUrl, filename) {
  if (!supabaseAdmin) throw new Error('Supabase is not configured')
  if (!dataUrl?.startsWith('data:')) return dataUrl // ?대? URL?대㈃ 洹몃?濡?
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('?섎せ??data URL')
  const [, mime, b64] = match
  const buf = Buffer.from(b64, 'base64')
  const ext = mime.split('/')[1] || 'png'
  const path = `instagram/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabaseAdmin.storage.from('extraction-images').upload(path, buf, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error(`?ㅽ넗由ъ? ?낅줈???ㅽ뙣: ${error.message}`)
  const { data: pub } = supabaseAdmin.storage.from('extraction-images').getPublicUrl(path)
  return pub?.publicUrl
}

async function publishInstagramPostV2({ imageUrls = [], caption = '' }) {
  const auth = getInstagramAuthMaterial()
  if (!auth?.accessToken || !auth?.businessId) {
    throw new Error('Instagram ?몄쬆 ?뺣낫媛 ?놁뒿?덈떎. ?ㅼ젙?먯꽌 ?ㅼ떆 ?곌껐??二쇱꽭??')
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

async function waitForInstagramMediaReady(mediaIds, accessToken, maxWait = 60000) {
  const interval = 2000

  for (const id of mediaIds) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < maxWait) {
      const media = await instagramGraphGet(id, accessToken, { fields: 'status_code' })
      if (media.status_code === 'FINISHED') {
        break
      }
      if (media.status_code === 'ERROR' || media.status_code === 'EXPIRED') {
        throw new Error(`Instagram media processing failed (${id}): ${media.status_code}`)
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }

    if (Date.now() - startedAt >= maxWait) {
      throw new Error(`Instagram media processing timed out (${id})`)
    }
  }
}

// ===== Naver Blog Publish (Playwright) =====
app.post('/api/naver/publish', async (req, res) => {
  try {
    const { title, content, tags } = req.body
    if (!title || !content) return res.status(400).json({ success: false, source: 'server-api', endpoint: '/api/naver/publish', error: 'title, content ?꾩닔' })
    const { uploadToNaverBlog } = await import('./services/naver-blog.js')
    const result = await uploadToNaverBlog({ title, content, tags: tags || [] })
    res.json({ success: true, source: 'server-api', endpoint: '/api/naver/publish', url: result.url })
  } catch (err) {
    console.error('[Naver Blog] ?낅줈???ㅽ뙣:', err.message)
    res.status(500).json({ success: false, source: 'server-api', endpoint: '/api/naver/publish', error: err.message })
  }
})

app.post('/api/instagram/publish', async (req, res) => {
  try {
    const { imageUrls = [], caption } = req.body
    // data URL?대㈃ Supabase???낅줈????怨듦컻 URL濡?蹂??
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
    console.error('[Instagram] ?낅줈???ㅽ뙣:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ===== YouTube Data API v3 (OAuth 2.0 + ?낅줈?? =====
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

const { google } = require('googleapis')

// ?섍꼍蹂???곗꽑, ?놁쑝硫?client_secret.json ?뚯씪 ?대갚 (媛쒕컻 ?몄쓽)
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

// ?좏겙 ??μ냼: Supabase ?곗꽑, ?놁쑝硫??뚯씪 ?대갚
const ytTokenPath = path.join(__dirname, '.youtube_tokens.json')

async function loadYtTokens() {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.from('youtube_tokens').select('tokens').eq('id', 'default').maybeSingle()
      if (!error && data?.tokens) return data.tokens
    } catch (err) { console.warn('[YouTube] Supabase ?좏겙 濡쒕뱶 ?ㅽ뙣:', err.message) }
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
      if (error) console.warn('[YouTube] Supabase ?좏겙 ????ㅽ뙣:', error.message)
      else return
    } catch (err) { console.warn('[YouTube] Supabase ?좏겙 ????ㅻ쪟:', err.message) }
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

// ?쒕쾭 ?쒖옉 ???좏겙 濡쒕뱶 (鍮꾨룞湲?
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

// OAuth ?몄쬆 URL ?앹꽦
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
      'business_management',
    ].join(',')
  )
  url.searchParams.set('state', instagramOAuthState)

  res.json({ url: url.toString() })
})

app.get('/api/instagram/oauth/callback', async (req, res) => {
  const { code, error, state } = req.query

  if (error) {
    return res.status(400).send(`<html><body><h2>Instagram ?몄쬆 嫄곕?</h2><p>${error}</p></body></html>`)
  }
  if (!code) {
    return res.status(400).send('Missing code')
  }
  if (instagramOAuthState && state !== instagramOAuthState) {
    return res.status(400).send('<html><body><h2>Instagram ?몄쬆 ?ㅽ뙣</h2><p>state mismatch</p></body></html>')
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

    res.send('<html><body><h2>Instagram ?몄쬆 ?꾨즺!</h2><p>??李쎌쓣 ?リ퀬 ?뚯븘媛?몄슂.</p><script>setTimeout(()=>window.close(),500)</script></body></html>')
  } catch (err) {
    console.error('[Instagram OAuth] callback failed:', err.message)
    res.status(500).send(`<html><body><h2>Instagram ?몄쬆 ?ㅽ뙣</h2><p>${err.message}</p></body></html>`)
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

// OAuth 肄쒕갚
app.get('/api/youtube/oauth/callback', async (req, res) => {
  const { code, error } = req.query
  console.log('[YouTube OAuth callback]', { hasCode: !!code, error })
  if (error) return res.status(400).send(`<html><body><h2>?몄쬆 嫄곕???/h2><p>${error}</p></body></html>`)
  if (!code) return res.status(400).send('Missing code')
  try {
    const client = getYtOAuth2Client()
    const { tokens } = await client.getToken(code)
    console.log('[YouTube OAuth] ?좏겙 ?띾뱷 ?깃났, scopes:', tokens.scope)
    client.setCredentials(tokens)
    await persistYtTokens(tokens)
    console.log('[YouTube OAuth] ?좏겙 ????꾨즺')
    res.send('<html><body><h2>YouTube ?몄쬆 ?꾨즺!</h2><p>??李쎌쓣 ?リ퀬 ?뚯븘媛?몄슂.</p><script>setTimeout(()=>window.close(),500)</script></body></html>')
  } catch (err) {
    console.error('[YouTube OAuth] ?좏겙 ?띾뱷 ?ㅽ뙣:', err.message)
    res.status(500).send(`<html><body><h2>?몄쬆 ?ㅽ뙣</h2><p>${err.message}</p></body></html>`)
  }
})

// ?몄쬆 ?곹깭 ?뺤씤
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

// ?몄쬆 ?댁젣
app.post('/api/youtube/logout', async (req, res) => {
  ytTokens = null
  await clearYtTokens()
  if (ytOAuth2Client) ytOAuth2Client.revokeCredentials().catch(() => {})
  res.json({ success: true })
})

// ?ㅼ젣 ?낅줈??
app.post('/api/youtube/upload', async (req, res) => {
  // ?됰㈃ 援ъ“ ?먮뒗 { snippet, status, videoUrl } 援ъ“ 紐⑤몢 吏??
  const body = req.body || {}
  const snippet = body.snippet || {}
  const status = body.status || {}
  const title = body.title || snippet.title
  const description = body.description || snippet.description
  const tags = body.tags || snippet.tags
  const categoryId = body.categoryId || snippet.categoryId
  const privacyStatus = body.privacyStatus || status.privacyStatus
  const requestedPublishAt = body.scheduledAt || status.publishAt || null
  const videoUrl = body.videoUrl

  if (!ytTokens) return res.status(401).json({ error: 'YouTube ?몄쬆???꾩슂?⑸땲?? 癒쇱? Google 怨꾩젙???곌껐?섏꽭??' })
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl???꾩슂?⑸땲??' })

  const publishAt = requestedPublishAt ? new Date(requestedPublishAt) : null
  if (publishAt && Number.isNaN(publishAt.getTime())) {
    return res.status(400).json({ error: '?덉빟 諛쒗뻾 ?쒓컙? ISO 8601 ?뺤떇???꾩슂?⑸땲??' })
  }

  const client = getYtOAuth2Client()
  const youtube = google.youtube({ version: 'v3', auth: client })

  try {
    // ?곸긽 ?ㅼ슫濡쒕뱶 (濡쒖뺄 寃쎈줈 ?먮뒗 URL)
    let videoBuffer
    const localPath = videoUrl.startsWith('/output/') ? path.join(__dirname, '..', videoUrl) : null
    if (localPath && fs.existsSync(localPath)) {
      videoBuffer = fs.readFileSync(localPath)
    } else {
      const videoRes = await fetch(videoUrl)
      if (!videoRes.ok) throw new Error(`?곸긽 ?ㅼ슫濡쒕뱶 ?ㅽ뙣: ${videoRes.status}`)
      videoBuffer = Buffer.from(await videoRes.arrayBuffer())
    }

    // ?꾩떆 ?뚯씪濡????(?ㅽ듃由??꾩슂)
    const tmpPath = path.join(__dirname, '..', 'output', `yt_upload_${Date.now()}.mp4`)
    fs.writeFileSync(tmpPath, videoBuffer)

    console.log('[YouTube] ?낅줈???쒖옉:', { title, tags, size: videoBuffer.length })

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

    // ?꾩떆 ?뚯씪 ??젣
    setTimeout(() => { try { fs.unlinkSync(tmpPath) } catch {} }, 5000)

    const videoId = response.data.id
    console.log('[YouTube] ?낅줈???꾨즺:', videoId)

    res.json({
      success: true,
      videoId,
      scheduled: Boolean(publishAt),
      scheduledAt: publishAt ? publishAt.toISOString() : null,
      url: `https://youtu.be/${videoId}`,
      snippet: response.data.snippet,
    })
  } catch (err) {
    console.error('[YouTube] ?낅줈???ㅽ뙣 ?꾩껜:', JSON.stringify({
      code: err.code,
      message: err.message,
      status: err.status,
      errors: err.errors,
      response_data: err.response?.data,
      response_status: err.response?.status,
    }, null, 2))
    const detail = err.response?.data?.error?.message || err.errors?.[0]?.message || err.message
    res.status(err.code === 401 ? 401 : 500).json({ error: detail, code: err.code, fullError: err.response?.data })
  }
})

// ======================================================================
// ?덉빟 ?낅줈??(Scheduled Uploads) ??Supabase 湲곕컲
// ======================================================================

const API_SECRET = process.env.API_SECRET || ''

function requireApiSecret(req, res, next) {
  const provided = req.headers['x-api-secret']
  if (!API_SECRET || provided !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ?덉빟 ?앹꽦
app.post('/api/scheduled/create', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const { platform, extractionId, content, scheduledAt, scheduledId } = req.body
    if (!platform || !extractionId || !scheduledAt) {
      return res.status(400).json({ error: 'platform, extractionId, scheduledAt ?꾩닔' })
    }

    if (scheduledId) {
      const { data, error } = await supabaseAdmin
        .from('scheduled_uploads')
        .update({
          scheduled_at: scheduledAt,
          content: content || {},
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

    // 以묐났 諛⑹?: ?숈씪 extraction_id + platform??pending ?덉빟???덉쑝硫?update
    const { data: existingList } = await supabaseAdmin
      .from('scheduled_uploads')
      .select('*')
      .eq('extraction_id', extractionId)
      .eq('platform', platform)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (existingList && existingList.length > 0) {
      const first = existingList[0]
      // 以묐났???섎㉧吏 pending ?뺣━
      if (existingList.length > 1) {
        const extraIds = existingList.slice(1).map(r => r.id)
        await supabaseAdmin.from('scheduled_uploads').delete().in('id', extraIds)
      }
      const { data, error } = await supabaseAdmin
        .from('scheduled_uploads')
        .update({
          scheduled_at: scheduledAt,
          content: content || first.content || {},
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
        content: content || {},
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

// ?덉빟 紐⑸줉
app.get('/api/scheduled/list', async (req, res) => {
  if (!supabaseAdmin) return res.json([])
  try {
    const { data, error } = await supabaseAdmin
      .from('scheduled_uploads')
      .select('*')
      .order('scheduled_at', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (err) {
    if (err?.code === '42P01') {
      console.warn('[scheduled/list] scheduled_uploads ?뚯씠釉붿씠 ?놁뼱 鍮?紐⑸줉?쇰줈 泥섎━?⑸땲??')
      return res.json([])
    }
    res.status(500).json({ error: err.message })
  }
})

// ?덉빟 ??젣
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

// ?덉빟 ?섏젙
app.patch('/api/scheduled/:id', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const { scheduledAt, status, content } = req.body
    const patch = {}
    if (scheduledAt) patch.scheduled_at = scheduledAt
    if (status) patch.status = status
    if (content) patch.content = content
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

// GitHub Actions ?몄텧 ???덉빟???낅줈???ㅽ뻾 (湲濡쒕쾶 x-app-secret 誘몃뱾?⑥뼱濡??몄쬆)
app.post('/api/scheduled/run', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })

  try {
    // ?ㅽ뻾 ?쒓컖 ?꾨떖??pending ??ぉ 議고쉶
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
      // ?낅줈??以묒쑝濡??쒖떆
      await supabaseAdmin
        .from('scheduled_uploads')
        .update({ status: 'uploading', attempts: (item.attempts || 0) + 1 })
        .eq('id', item.id)

      try {
        let uploadResult = null

        // ?뚮옯?쇰퀎 ?낅줈???ㅽ뻾
        // ?덉빟 ?ㅽ뻾 寃쎈줈???몄뒪?洹몃옩留??좎??섍퀬, 釉붾줈洹??좏뒠釉??덇굅??遺꾧린??鍮꾪솢?깊솕?쒕떎.
        // 예약 실행 경로는 인스타그램만 유지한다.
        // 레거시 YouTube/블로그 예약 실행 경로는 제거됨
        if (item.platform === 'instagram') {
          const c = item.content || {}
          let imageUrls = c.imageUrls || []
          let caption = c.caption || ''

          // content???대?吏 ?놁쑝硫?extraction?먯꽌 議고쉶
          if (!imageUrls.length && item.extraction_id) {
            const { data: ext } = await supabaseAdmin
              .from('extractions')
              .select('instagram_images, instagram_content')
              .eq('id', item.extraction_id)
              .maybeSingle()
            const igImgs = ext?.instagram_images || []
            imageUrls = igImgs.map(img => img?.url || img?.imageUrl).filter(Boolean)
            const igContent = ext?.instagram_content
            if (!caption && igContent) {
              const hashtags = (igContent.hashtags || []).map(t => String(t).startsWith('#') ? t : `#${t}`).join(' ')
              caption = `${igContent.caption || ''}\n\n${hashtags}`.trim()
            }
          }

          const result = await publishInstagramPostV2({ imageUrls, caption })
          uploadResult = { url: result.permalink, mediaId: result.mediaId }

        } else {
          throw new Error(`지원하지 않는 플랫폼: ${item.platform}`)
        }

        // 성공 처리
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

        // extractions.upload_status ?먮룄 ?낅줈???꾨즺 諛섏쁺 (肄섑뀗痢?愿由ъ뿉???쒖떆??
        if (item.extraction_id) {
          try {
            const { data: extRow } = await supabaseAdmin
              .from('extractions')
              .select('upload_status')
              .eq('id', item.extraction_id)
              .maybeSingle()
            const newStatus = {
              ...(extRow?.upload_status || {}),
              [item.platform]: {
                status: 'uploaded',
                uploadedAt: uploadedAtIso,
                uploadedUrl: uploadResult?.url || null,
              },
            }
            await supabaseAdmin
              .from('extractions')
              .update({ upload_status: newStatus })
              .eq('id', item.extraction_id)
          } catch (e) {
            console.warn('[extractions.upload_status ?낅뜲?댄듃 ?ㅽ뙣]', e.message)
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

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`)
})

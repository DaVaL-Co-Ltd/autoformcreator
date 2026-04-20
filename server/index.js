import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { execFile } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const sharp = require('sharp')
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas')
const fontsDir = path.join(__dirname, 'fonts')
GlobalFonts.registerFromPath(path.join(fontsDir, 'PretendardVariable.ttf'), 'Pretendard')

// Supabase 클라이언트 (서버 전용)
const { createClient: createSupabaseClient } = require('@supabase/supabase-js')
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

const app = express()

// CORS: ALLOWED_ORIGINS 환경변수 있으면 제한, 없으면 전체 허용 (개발용)
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || null
app.use(cors({
  origin: allowedOrigins || true,
  credentials: true,
}))

// JSON body for most routes (LlamaParse upload 제외)
app.use((req, res, next) => {
  if (req.path === '/api/llamaparse/upload') return next()
  if (req.path === '/api/output/upload') return next()
  if (req.path === '/api/output/save') return next()
  express.json({ limit: '150mb' })(req, res, next)
})

// API 시크릿 검증 미들웨어 (/api/* 엔드포인트 보호)
// 예외: /health, /api/youtube/oauth/callback (Google이 리디렉트하는 공개 엔드포인트)
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next()
  if (req.path === '/api/youtube/oauth/callback') return next()
  if (req.path === '/api/youtube/auth-url') return next()
  if (req.path === '/api/youtube/auth-status') return next()
  const expected = process.env.API_SECRET
  if (!expected) return next() // dev 편의: 미설정 시 통과
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

// ===== HeyGen 프리셋 아바타 목록 =====
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

// ===== HeyGen 커스텀 아바타 목록 (슬롯 확인용) =====
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

// ===== HeyGen 아바타 상태 확인 (avatars 목록에서 조회) =====
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

// ===== HeyGen 테스트용: 성공한 이미지 직접 업로드 =====
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

  // FFmpeg 필터로 모션 배경 생성 (1080x1920, 9:16)
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

// ===== 타이틀 배경 이미지 생성 (Canvas, 왼쪽 상단 타이틀) =====
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

    // 투명 배경 (아바타 위에 오버레이)
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

    // 텍스트를 여러 줄로 분할 (특수문자, 공백 기준)
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
          // 특수문자나 공백에서 자르기
          let bestCut = i
          for (let j = i; j >= Math.floor(i * 0.5); j--) {
            if (/[\s,.:!?·\-]/.test(remaining[j])) { bestCut = j + 1; break }
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

// ===== 인포그래픽 배경 이미지 생성 (Canvas + 한글 폰트) =====
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

    // 배경
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, W, H)

    // 상단 장식 원
    ctx.globalAlpha = 0.2; ctx.fillStyle = theme.accent
    ctx.beginPath(); ctx.arc(480, 200, 45, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.3
    ctx.beginPath(); ctx.arc(600, 200, 45, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    // 제목
    ctx.font = '52px Pretendard'
    ctx.fillStyle = theme.text
    ctx.textAlign = 'center'
    ctx.fillText(title, W / 2, 400)

    // 구분선
    ctx.fillStyle = theme.accent; ctx.globalAlpha = 0.5
    roundRect(ctx, 340, 440, 400, 4, 2); ctx.fill()
    ctx.globalAlpha = 1

    // 바 차트
    bullets.forEach((b, i) => {
      const y = 600 + i * 200
      const parts = b.split(':')
      const label = parts[0]?.trim() || b
      const value = parts[1]?.trim() || ''
      const numMatch = value.match(/[\d.]+/)
      const barWidth = numMatch ? Math.min(750, Math.max(200, parseFloat(numMatch[0]) * 10)) : 500

      // 라벨
      ctx.font = '38px Pretendard'
      ctx.fillStyle = theme.text
      ctx.textAlign = 'left'
      ctx.fillText(label, 120, y)

      // 배경 바
      ctx.globalAlpha = 0.3; ctx.fillStyle = theme.accent
      roundRect(ctx, 120, y + 20, barWidth, 55, 28); ctx.fill()
      // 진행 바
      ctx.globalAlpha = 1; ctx.fillStyle = theme.accent
      roundRect(ctx, 120, y + 20, barWidth * 0.85, 55, 28); ctx.fill()

      // 값
      ctx.font = '34px Pretendard'
      ctx.fillStyle = theme.accent
      ctx.textAlign = 'left'
      ctx.fillText(value, 140 + barWidth * 0.85, y + 58)
    })

    // 워터마크
    ctx.font = '22px Pretendard'
    ctx.fillStyle = theme.sub
    ctx.globalAlpha = 0.5
    ctx.textAlign = 'right'
    ctx.fillText('마이베스트', 1010, 1870)
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

// ===== 인포그래픽 이미지 → HeyGen 업로드 → URL 반환 =====
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

// ===== 자막 번인 (FFmpeg) =====
// 나레이션을 최대 maxLines줄 단위로 분할
function splitNarration(text, maxCharsPerLine = 18) {
  const chunks = []
  let remaining = text.trim()
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      chunks.push(remaining)
      break
    }
    // 자연스러운 끊김: 마침표, 쉼표, 공백 기준
    let cut = -1
    for (let i = Math.min(maxCharsPerLine, remaining.length) - 1; i >= Math.floor(maxCharsPerLine * 0.5); i--) {
      if (/[.!?。，,\s]/.test(remaining[i])) { cut = i + 1; break }
    }
    if (cut === -1) cut = maxCharsPerLine
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  return chunks
}

// 스타일별 FFmpeg force_style 매핑 (9:16 유튜브 쇼츠 기준)
function getForceStyle(style) {
  const sz = 10
  const base = `FontName=Pretendard Variable,FontSize=${sz},Alignment=2,MarginV=20`
  const styles = {
    classic:  `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,BorderStyle=3,BackColour=&HB0000000`,
    classic2: `${base},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=0.5,Shadow=0`,
  }
  return styles[style] || styles.classic
}

// 타이틀 오버레이 이미지 생성 (Canvas, 투명 배경)
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
          if (/[\s,.:!?·\-]/.test(remaining[j])) { bestCut = j + 1; break }
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
  const { videoUrl, scenes, subtitleStyle, animatedTitles } = req.body
  if (!videoUrl || !scenes?.length) return res.status(400).json({ error: 'Missing videoUrl or scenes' })
  // animatedTitles: [{ sceneNumber, localPath }] — WebM 알파 영상 오버레이
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
    // 1) HeyGen 영상 다운로드
    const videoRes = await fetch(videoUrl)
    if (!videoRes.ok) throw new Error(`영상 다운로드 실패: ${videoRes.status}`)
    const buffer = Buffer.from(await videoRes.arrayBuffer())
    fs.writeFileSync(inputPath, buffer)

    // 2) 영상 길이 확인
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

    // 3) SRT 생성 — 기본 2줄, 총 3줄이면 3줄 유지, 4줄 이상이면 2줄씩 분할
    const maxCharsPerLine = 16
    let srtContent = ''
    let srtIdx = 1
    const totalChars = scenes.reduce((sum, s) => sum + (s.narration || '').length, 0) || 1
    let currentTime = 0

    for (const scene of scenes) {
      const sceneDur = (scene.narration.length / totalChars) * duration
      const lines = splitNarration(scene.narration, maxCharsPerLine)
      // 블록 분할: 2줄 기본, 3줄은 그대로 유지, 4줄 이상은 2줄씩
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

    // 4) 타이틀 오버레이 생성 (avatar_keyword 씬) — animatedTitles 있으면 WebM, 없으면 PNG
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

    // 5) FFmpeg로 자막 + 타이틀 오버레이 번인
    const srtPathEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:')
    const fontsDirEscaped = path.join(__dirname, 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:')
    const forceStyle = getForceStyle(subtitleStyle || 'classic')

    // FFmpeg 필터 구성: 자막 + 타이틀 오버레이 (애니메이션 WebM은 itsoffset으로 타이밍 맞춤)
    let filterComplex = ''
    const inputs = ['-i', inputPath]
    titleOverlays.forEach((t) => {
      if (t.animated) {
        // WebM 알파 영상: itsoffset으로 씬 시작 시간에 맞추고, 씬 길이만큼 반복
        inputs.push('-itsoffset', t.start.toFixed(3), '-stream_loop', '-1', '-i', t.path)
      } else {
        inputs.push('-i', t.path)
      }
    })

    if (titleOverlays.length > 0) {
      // overlay 체인: [0]에 자막 → 타이틀 순차 오버레이
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
          if (err) reject(new Error(`FFmpeg 오류: ${err.message}\n${(stderr || '').slice(-500)}`))
          else resolve()
        })
      })
    } else {
      // 타이틀 없으면 자막만
      await new Promise((resolve, reject) => {
        const args = [
          '-i', inputPath,
          '-vf', `subtitles='${srtPathEscaped}':fontsdir='${fontsDirEscaped}':force_style='${forceStyle}'`,
          '-c:a', 'copy',
          '-y', outputPath,
        ]
        execFile(ffmpegPath, args, { timeout: 300000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(`FFmpeg 오류: ${err.message}\n${(stderr || '').slice(-500)}`))
          else resolve()
        })
      })
    }

    // 타이틀 임시 파일 정리 (PNG만 삭제, 애니메이션 WebM은 보존)
    titleOverlays.forEach(t => { if (t.cleanup) { try { fs.unlinkSync(t.path) } catch {} } })

    // 5) 응답
    const size = fs.statSync(outputPath).size
    const url = `/output/final_${ts}.mp4`
    res.json({ url, size, srtUrl: `/output/subtitle_${ts}.srt` })

    // 원본 파일 정리 (지연 삭제)
    setTimeout(() => { try { fs.unlinkSync(inputPath) } catch {} }, 60000)
  } catch (err) {
    try { fs.unlinkSync(inputPath) } catch {}
    try { fs.unlinkSync(srtPath) } catch {}
    res.status(500).json({ error: err.message })
  }
})

// ===== Remotion 서버사이드 렌더링 =====
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

    // 번들 캐싱 + 소스 변경 시 자동 재번들링
    const sourceMtime = getRemotionSourceMtime()
    if (!remotionBundleUrl || sourceMtime > remotionBundleMtime) {
      console.log(`[Remotion] ${remotionBundleUrl ? '소스 변경 감지, 재번들링' : '번들링 시작'}...`)
      const entryPoint = path.join(__dirname, '..', 'client', 'src', 'remotion', 'index.jsx')
      remotionBundleUrl = await bundle({
        entryPoint,
        onProgress: (p) => { if (p % 20 === 0) console.log(`[Remotion] 번들 진행: ${p}%`) },
      })
      remotionBundleMtime = sourceMtime
      console.log('[Remotion] 번들 완료:', remotionBundleUrl)
    }

    // 컴포지션 선택
    const composition = await selectComposition({
      serveUrl: remotionBundleUrl,
      id: compositionId,
      inputProps: props || {},
    })

    // durationInFrames / fps 오버라이드
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
    console.error('[Remotion] 렌더 에러:', err)
    // 번들 에러 시 캐시 초기화
    if (err.message?.includes('bundle')) remotionBundleUrl = null
    res.status(500).json({ error: err.message })
  }
})

// Remotion 렌더링 결과 MP4 → HeyGen 업로드
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
// ngrok 무료 경고 페이지 우회: Content-Type을 강제 설정
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

  // 60초 타임아웃 (Imagen 이미지 용량 대비)
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
const IG_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

// 이미지 업로드 (단일 또는 캐러셀)
async function publishInstagramPost({ imageUrls = [], caption = '' }) {
  if (!IG_ACCESS_TOKEN || !IG_BUSINESS_ID) {
    throw new Error('Instagram 환경변수(INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ID) 미설정')
  }
  if (!imageUrls.length) throw new Error('이미지 URL이 없습니다')

  const urls = imageUrls.filter(Boolean)
  if (urls.length === 1) {
    // 단일 이미지
    const createRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: urls[0], caption, access_token: IG_ACCESS_TOKEN }),
    })
    const created = await createRes.json()
    if (!createRes.ok || !created.id) throw new Error(`컨테이너 생성 실패: ${JSON.stringify(created)}`)

    const pubRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: created.id, access_token: IG_ACCESS_TOKEN }),
    })
    const pub = await pubRes.json()
    if (!pubRes.ok || !pub.id) throw new Error(`게시 실패: ${JSON.stringify(pub)}`)
    return { mediaId: pub.id, permalink: `https://instagram.com/p/${pub.id}/` }
  }

  // 캐러셀 (여러 이미지)
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

  const pubRes = await fetch(`${IG_GRAPH_BASE}/${IG_BUSINESS_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: carousel.id, access_token: IG_ACCESS_TOKEN }),
  })
  const pub = await pubRes.json()
  if (!pubRes.ok || !pub.id) throw new Error(`캐러셀 게시 실패: ${JSON.stringify(pub)}`)
  return { mediaId: pub.id, permalink: `https://instagram.com/p/${pub.id}/` }
}

// base64 data URL을 Supabase Storage에 업로드 후 공개 URL 반환
async function uploadDataUrlToStorage(dataUrl, filename) {
  if (!supabaseAdmin) throw new Error('Supabase 미설정')
  if (!dataUrl?.startsWith('data:')) return dataUrl // 이미 URL이면 그대로
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('잘못된 data URL')
  const [, mime, b64] = match
  const buf = Buffer.from(b64, 'base64')
  const ext = mime.split('/')[1] || 'png'
  const path = `instagram/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabaseAdmin.storage.from('extraction-images').upload(path, buf, {
    contentType: mime,
    upsert: false,
  })
  if (error) throw new Error(`스토리지 업로드 실패: ${error.message}`)
  const { data: pub } = supabaseAdmin.storage.from('extraction-images').getPublicUrl(path)
  return pub?.publicUrl
}

app.post('/api/instagram/publish', async (req, res) => {
  try {
    const { imageUrls = [], caption } = req.body
    // data URL이면 Supabase에 업로드 후 공개 URL로 변환
    const publicUrls = []
    for (const url of imageUrls) {
      if (typeof url === 'string' && url.startsWith('data:')) {
        publicUrls.push(await uploadDataUrlToStorage(url))
      } else if (url) {
        publicUrls.push(url)
      }
    }
    const result = await publishInstagramPost({ imageUrls: publicUrls, caption })
    res.json({ success: true, ...result, uploadedUrls: publicUrls })
  } catch (err) {
    console.error('[Instagram] 업로드 실패:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ===== YouTube Data API v3 (OAuth 2.0 + 업로드) =====
const { google } = require('googleapis')

// 환경변수 우선, 없으면 client_secret.json 파일 폴백 (개발 편의)
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

// 토큰 저장소: Supabase 우선, 없으면 파일 폴백
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

async function clearYtTokens() {
  if (supabaseAdmin) {
    try { await supabaseAdmin.from('youtube_tokens').delete().eq('id', 'default') } catch {}
  }
  try { fs.unlinkSync(ytTokenPath) } catch {}
}

// 서버 시작 시 토큰 로드 (비동기)
loadYtTokens().then(t => { if (t) ytTokens = t })

function getYtOAuth2Client() {
  if (!ytCredentials) return null
  if (!ytOAuth2Client) {
    ytOAuth2Client = new google.auth.OAuth2(
      ytCredentials.client_id,
      ytCredentials.client_secret,
      YOUTUBE_REDIRECT_URI
    )
  }
  if (ytTokens) ytOAuth2Client.setCredentials(ytTokens)
  return ytOAuth2Client
}

// OAuth 인증 URL 생성
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

// OAuth 콜백
app.get('/api/youtube/oauth/callback', async (req, res) => {
  const { code, error } = req.query
  console.log('[YouTube OAuth callback]', { hasCode: !!code, error })
  if (error) return res.status(400).send(`<html><body><h2>인증 거부됨</h2><p>${error}</p></body></html>`)
  if (!code) return res.status(400).send('Missing code')
  try {
    const client = getYtOAuth2Client()
    const { tokens } = await client.getToken(code)
    console.log('[YouTube OAuth] 토큰 획득 성공, scopes:', tokens.scope)
    client.setCredentials(tokens)
    ytTokens = tokens
    await saveYtTokens(tokens)
    console.log('[YouTube OAuth] 토큰 저장 완료')
    res.send('<html><body><h2>YouTube 인증 완료!</h2><p>이 창을 닫고 돌아가세요.</p><script>setTimeout(()=>window.close(),500)</script></body></html>')
  } catch (err) {
    console.error('[YouTube OAuth] 토큰 획득 실패:', err.message)
    res.status(500).send(`<html><body><h2>인증 실패</h2><p>${err.message}</p></body></html>`)
  }
})

// 인증 상태 확인
app.get('/api/youtube/auth-status', (req, res) => {
  res.json({ authenticated: !!ytTokens, hasCredentials: !!ytCredentials })
})

// 인증 해제
app.post('/api/youtube/logout', async (req, res) => {
  ytTokens = null
  await clearYtTokens()
  if (ytOAuth2Client) ytOAuth2Client.revokeCredentials().catch(() => {})
  res.json({ success: true })
})

// 실제 업로드
app.post('/api/youtube/upload', async (req, res) => {
  // 평면 구조 또는 { snippet, status, videoUrl } 구조 모두 지원
  const body = req.body || {}
  const snippet = body.snippet || {}
  const status = body.status || {}
  const title = body.title || snippet.title
  const description = body.description || snippet.description
  const tags = body.tags || snippet.tags
  const categoryId = body.categoryId || snippet.categoryId
  const privacyStatus = body.privacyStatus || status.privacyStatus
  const videoUrl = body.videoUrl

  if (!ytTokens) return res.status(401).json({ error: 'YouTube 인증이 필요합니다. 먼저 Google 계정을 연결하세요.' })
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl이 필요합니다.' })

  const client = getYtOAuth2Client()
  const youtube = google.youtube({ version: 'v3', auth: client })

  try {
    // 영상 다운로드 (로컬 경로 또는 URL)
    let videoBuffer
    const localPath = videoUrl.startsWith('/output/') ? path.join(__dirname, '..', videoUrl) : null
    if (localPath && fs.existsSync(localPath)) {
      videoBuffer = fs.readFileSync(localPath)
    } else {
      const videoRes = await fetch(videoUrl)
      if (!videoRes.ok) throw new Error(`영상 다운로드 실패: ${videoRes.status}`)
      videoBuffer = Buffer.from(await videoRes.arrayBuffer())
    }

    // 임시 파일로 저장 (스트림 필요)
    const tmpPath = path.join(__dirname, '..', 'output', `yt_upload_${Date.now()}.mp4`)
    fs.writeFileSync(tmpPath, videoBuffer)

    console.log('[YouTube] 업로드 시작:', { title, tags, size: videoBuffer.length })

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: title || '숏폼 테스트',
          description: description || '',
          tags: tags || [],
          categoryId: categoryId || '22',
        },
        status: {
          privacyStatus: privacyStatus || 'private',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(tmpPath),
      },
    })

    // 임시 파일 삭제
    setTimeout(() => { try { fs.unlinkSync(tmpPath) } catch {} }, 5000)

    const videoId = response.data.id
    console.log('[YouTube] 업로드 완료:', videoId)

    res.json({
      success: true,
      videoId,
      url: `https://youtu.be/${videoId}`,
      snippet: response.data.snippet,
    })
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
    res.status(err.code === 401 ? 401 : 500).json({ error: detail, code: err.code, fullError: err.response?.data })
  }
})

// ======================================================================
// 예약 업로드 (Scheduled Uploads) — Supabase 기반
// ======================================================================

const API_SECRET = process.env.API_SECRET || ''

function requireApiSecret(req, res, next) {
  const provided = req.headers['x-api-secret']
  if (!API_SECRET || provided !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// 예약 생성
app.post('/api/scheduled/create', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const { platform, extractionId, content, scheduledAt } = req.body
    if (!platform || !extractionId || !scheduledAt) {
      return res.status(400).json({ error: 'platform, extractionId, scheduledAt 필수' })
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

// 예약 목록
app.get('/api/scheduled/list', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })
  try {
    const { data, error } = await supabaseAdmin
      .from('scheduled_uploads')
      .select('*')
      .order('scheduled_at', { ascending: true })
    if (error) throw error
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 예약 삭제
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

// 예약 수정
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

// GitHub Actions 호출 — 예약된 업로드 실행 (글로벌 x-app-secret 미들웨어로 인증)
app.post('/api/scheduled/run', async (req, res) => {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase not configured' })

  try {
    // 실행 시각 도달한 pending 항목 조회
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
      // 업로드 중으로 표시
      await supabaseAdmin
        .from('scheduled_uploads')
        .update({ status: 'uploading', attempts: (item.attempts || 0) + 1 })
        .eq('id', item.id)

      try {
        let uploadResult = null

        // 플랫폼별 업로드 실행
        if (item.platform === 'shorts' || item.platform === 'youtube') {
          const c = item.content || {}
          let videoUrl = c.videoUrl
          let title = c.title
          let description = c.description
          let tags = c.tags

          // content에 videoUrl 없으면 extractions 테이블에서 조회
          if (!videoUrl && item.extraction_id) {
            const { data: ext } = await supabaseAdmin
              .from('extractions')
              .select('shorts_video, shorts_script')
              .eq('id', item.extraction_id)
              .maybeSingle()
            const sv = ext?.shorts_video
            const ss = ext?.shorts_script
            videoUrl = sv?.url || sv?.videoUrl
            if (!title) title = ss?.uploadTitle || ss?.title
            if (!description && ss) {
              const parts = []
              if (ss.hook) parts.push(ss.hook)
              if (Array.isArray(ss.scenes)) ss.scenes.forEach((s, i) => s.narration && parts.push(`${i + 1}. ${s.narration}`))
              if (ss.cta) parts.push(`\n${ss.cta}`)
              description = parts.join('\n')
            }
            if (!tags?.length) tags = (ss?.hashtags || []).map(t => t.replace(/^#/, ''))
          }

          if (!videoUrl) throw new Error('videoUrl 없음')

          const client = getYtOAuth2Client()
          if (!client) throw new Error('YouTube 인증 필요')
          const youtube = google.youtube({ version: 'v3', auth: client })
          const { Readable } = require('stream')
          const videoRes = await fetch(videoUrl)
          if (!videoRes.ok) throw new Error(`영상 다운로드 실패: ${videoRes.status}`)
          const videoBuffer = Buffer.from(await videoRes.arrayBuffer())
          const stream = Readable.from(videoBuffer)

          const finalTitle = (title || '숏폼 영상').slice(0, 100)
          const titleWithShorts = finalTitle.includes('#Shorts') ? finalTitle : `${finalTitle} #Shorts`.slice(0, 100)
          const finalTags = Array.isArray(tags) ? tags : []
          if (!finalTags.includes('Shorts')) finalTags.unshift('Shorts')

          const response = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
              snippet: {
                title: titleWithShorts,
                description: (description || '').slice(0, 5000),
                tags: finalTags,
                categoryId: '22',
              },
              status: { privacyStatus: c.privacyStatus || 'public', selfDeclaredMadeForKids: false },
            },
            media: { body: stream },
          })
          uploadResult = { url: `https://youtu.be/${response.data.id}`, videoId: response.data.id }

        } else if (item.platform === 'blog' || item.platform === 'naver') {
          throw new Error('네이버 블로그 서버 업로드 미구현 (브라우저 기반)')

        } else if (item.platform === 'instagram') {
          const c = item.content || {}
          let imageUrls = c.imageUrls || []
          let caption = c.caption || ''

          // content에 이미지 없으면 extraction에서 조회
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

          const result = await publishInstagramPost({ imageUrls, caption })
          uploadResult = { url: result.permalink, mediaId: result.mediaId }

        } else {
          throw new Error(`지원하지 않는 플랫폼: ${item.platform}`)
        }

        // 성공 처리
        await supabaseAdmin
          .from('scheduled_uploads')
          .update({
            status: 'completed',
            uploaded_url: uploadResult?.url || null,
            uploaded_at: new Date().toISOString(),
            error: null,
          })
          .eq('id', item.id)
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

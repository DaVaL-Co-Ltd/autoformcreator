import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())

// ElevenLabs는 별도 body 처리 (아래 라우트에서 직접 수집)

// JSON body for most routes (ElevenLabs와 LlamaParse upload 제외)
app.use((req, res, next) => {
  if (req.path === '/api/llamaparse/upload') return next()
  if (req.path.startsWith('/api/elevenlabs')) return next()
  if (req.path === '/api/output/upload') return next()
  if (req.path === '/api/output/save') return next()
  express.json({ limit: '150mb' })(req, res, next)
})

// LlamaParse Proxy - Upload (forward multipart as-is)
app.post('/api/llamaparse/upload', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks)
      const response = await fetch('https://api.cloud.llamaindex.ai/api/v1/parsing/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${req.headers['x-api-key']}`,
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
    const response = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${req.params.jobId}`, {
      headers: { Authorization: `Bearer ${req.headers['x-api-key']}` },
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
    const response = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${req.params.jobId}/result/markdown`, {
      headers: { Authorization: `Bearer ${req.headers['x-api-key']}` },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ElevenLabs Proxy - TTS (body를 직접 수집하여 UTF-8 한글 보존)
app.post('/api/elevenlabs/tts/:voiceId', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const rawBody = Buffer.concat(chunks)
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${req.params.voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': req.headers['x-api-key'],
        },
        body: rawBody,
      })
      if (!response.ok) {
        const err = await response.text()
        return res.status(response.status).send(err)
      }
      res.set('Content-Type', 'audio/mpeg')
      const buffer = await response.arrayBuffer()
      res.send(Buffer.from(buffer))
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
})

// ElevenLabs TTS with timestamps (문장별 타이밍 포함)
app.post('/api/elevenlabs/tts-timestamps/:voiceId', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const rawBody = Buffer.concat(chunks)
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${req.params.voiceId}/with-timestamps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'xi-api-key': req.headers['x-api-key'],
        },
        body: rawBody,
      })
    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).send(err)
    }
      const data = await response.json()
      res.json(data)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
})

// fal.ai Proxy - Submit (모델 경로를 x-fal-model 헤더로 전달)
app.post('/api/fal/submit', async (req, res) => {
  try {
    const model = req.headers['x-fal-model']
    if (!model) return res.status(400).json({ error: 'x-fal-model header required' })
    const response = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${req.headers['x-api-key']}`,
      },
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// fal.ai Proxy - Result (response_url을 x-fal-response-url 헤더로 전달)
app.get('/api/fal/result/:requestId', async (req, res) => {
  try {
    const responseUrl = req.headers['x-fal-response-url']
    if (!responseUrl) return res.status(400).json({ error: 'x-fal-response-url header required' })
    const response = await fetch(responseUrl, {
      headers: { Authorization: `Key ${req.headers['x-api-key']}` },
    })
    const data = await response.json()
    // fal.ai는 진행 중일 때 422를 반환 — 클라이언트가 폴링할 수 있도록 200으로 전달
    if (response.status === 422 || data.detail?.includes?.('still in progress')) {
      return res.json({ status: 'IN_PROGRESS', ...data })
    }
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Luma Proxy - Create Generation
app.post('/api/luma/generations', async (req, res) => {
  try {
    const response = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.headers['x-api-key']}`,
      },
      body: JSON.stringify(req.body),
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Luma Proxy - Get Generation Status
app.get('/api/luma/generations/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${req.params.id}`, {
      headers: { Authorization: `Bearer ${req.headers['x-api-key']}` },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Creatomate Proxy - Render (대용량 base64 지원)
app.post('/api/creatomate/renders', async (req, res) => {
  try {
    const bodyStr = JSON.stringify(req.body)
    console.log(`[Creatomate] 렌더 요청: ${(bodyStr.length / 1024 / 1024).toFixed(1)}MB, elements: ${req.body.elements?.length || 0}`)
    const response = await fetch('https://api.creatomate.com/v2/renders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.headers['x-api-key']}`,
      },
      body: bodyStr,
    })
    const data = await response.json()
    if (!response.ok) {
      console.error(`[Creatomate] 오류 ${response.status}:`, JSON.stringify(data).slice(0, 500))
      return res.status(response.status).json(data)
    }
    res.json(data)
  } catch (err) {
    console.error(`[Creatomate] 서버 에러:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

// Creatomate Proxy - Get Render Status
app.get('/api/creatomate/renders/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.creatomate.com/v2/renders/${req.params.id}`, {
      headers: { Authorization: `Bearer ${req.headers['x-api-key']}` },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Notion API
const NOTION_API_KEY = process.env.NOTION_API_KEY || ''
const NOTION_DB_ID = process.env.NOTION_DB_ID || ''

function buildNotionBlocks(fileName, channels, summary, data, blogImages) {
  const blocks = []
  const text = (content) => ({ text: { content } })
  const paragraph = (content) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [text(content)] } })
  const heading2 = (content) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: [text(content)] } })
  const image = (url) => ({ object: 'block', type: 'image', image: { type: 'external', external: { url } } })
  const heading3 = (content) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [text(content)] } })
  const bullet = (content) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [text(content)] } })
  const divider = () => ({ object: 'block', type: 'divider', divider: {} })

  // 기본 정보
  blocks.push(paragraph(`📁 파일: ${fileName || '없음'}`))
  blocks.push(paragraph(`📅 생성일: ${new Date().toLocaleDateString('ko-KR')} ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`))
  blocks.push(paragraph(`📺 채널: ${(channels || []).map(ch => ch.channel).join(', ')}`))
  blocks.push(divider())

  // 요약
  if (summary) {
    blocks.push(heading2('📊 핵심 요약'))
    if (summary.summary) blocks.push(paragraph(summary.summary))
    if (summary.keyData?.length) {
      for (const kd of summary.keyData) {
        blocks.push(bullet(`${kd.label}: ${kd.value}${kd.context ? ` (${kd.context})` : ''}`))
      }
    }
    if (summary.insights?.length) {
      blocks.push(heading3('💡 인사이트'))
      for (const ins of summary.insights) blocks.push(bullet(ins))
    }
    blocks.push(divider())
  }

  // 블로그
  if (data?.blogContent) {
    blocks.push(heading2('📝 블로그'))
    blocks.push(paragraph(`제목: ${data.blogContent.title || ''}`))
    for (const sec of data.blogContent.sections || []) {
      blocks.push(heading3(sec.heading || ''))
      const img = (blogImages || []).find(i => i.heading === sec.heading)
      if (img?.imageUrl && img.imageUrl.startsWith('http')) blocks.push(image(img.imageUrl))
      if (sec.keyPhrase) blocks.push(paragraph(`💬 ${sec.keyPhrase}`))
      blocks.push(paragraph((sec.content || '').slice(0, 2000)))
    }
    blocks.push(divider())
  }

  // 뉴스레터
  if (data?.newsletterContent) {
    blocks.push(heading2('📧 뉴스레터'))
    blocks.push(paragraph(`제목: ${data.newsletterContent.subject || ''}`))
    blocks.push(paragraph(`헤드라인: ${data.newsletterContent.headline || ''}`))
    if (data.newsletterContent.keyPoints?.length) {
      for (const kp of data.newsletterContent.keyPoints) blocks.push(bullet(kp))
    }
    blocks.push(paragraph((data.newsletterContent.body || '').slice(0, 2000)))
    blocks.push(divider())
  }

  // 인스타그램
  if (data?.instagramContent) {
    blocks.push(heading2('📸 인스타그램'))
    blocks.push(paragraph(`카드 ${data.instagramContent.cards?.length || 0}장`))
    for (const card of data.instagramContent.cards || []) {
      blocks.push(bullet(`${card.cardNumber}. ${card.headline} — ${card.body || ''}${card.dataPoint ? ` [${card.dataPoint}]` : ''}`))
    }
    if (data.instagramContent.caption) blocks.push(paragraph(`캡션: ${data.instagramContent.caption}`))
    blocks.push(divider())
  }

  // 숏폼
  if (data?.shortsScript) {
    blocks.push(heading2('🎬 숏폼 대본'))
    blocks.push(paragraph(`제목: ${data.shortsScript.title || ''} | ${data.shortsScript.duration || 0}초`))
    for (const scene of data.shortsScript.scenes || []) {
      blocks.push(bullet(`씬${scene.sceneNumber} (${scene.duration}초): ${scene.narration || ''}`))
    }
    blocks.push(divider())
  }

  // 롱폼
  if (data?.longformScript) {
    blocks.push(heading2('🎥 롱폼 대본'))
    blocks.push(paragraph(`제목: ${data.longformScript.title || ''} | ${data.longformScript.estimatedDuration || ''}`))
    for (const sec of data.longformScript.sections || []) {
      blocks.push(heading3(`${sec.sectionNumber}. ${sec.title || ''}`))
      blocks.push(paragraph((sec.narration || '').slice(0, 2000)))
    }
  }

  // Notion 블록 최대 100개 제한
  return blocks.slice(0, 100)
}

// Notion - 콘텐츠 저장
app.post('/api/notion/save', async (req, res) => {
  try {
    const { fileName, channels, summary, data, blogImages } = req.body

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB_ID },
        properties: {
          Name: { title: [{ text: { content: summary?.title || fileName || '새 콘텐츠' } }] },
        },
        children: buildNotionBlocks(fileName, channels, summary, data, blogImages),
      }),
    })
    const result = await response.json()
    if (!response.ok) return res.status(response.status).json(result)
    res.json({ id: result.id, url: result.url })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Notion - 콘텐츠 목록 조회
app.get('/api/notion/list', async (req, res) => {
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        page_size: 50,
      }),
    })
    const result = await response.json()
    if (!response.ok) return res.status(response.status).json(result)
    res.json(result.results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Notion - 페이지 상세 조회 (children blocks)
app.get('/api/notion/page/:pageId', async (req, res) => {
  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${req.params.pageId}/children`, {
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
      },
    })
    const result = await response.json()
    if (!response.ok) return res.status(response.status).json(result)
    res.json(result.results)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== ElevenLabs Lip-Sync Proxy =====
// Submit lip-sync job (video URL + audio base64 → ElevenLabs Dubbing API)
app.post('/api/elevenlabs/lip-sync', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const { videoUrl, audioBase64 } = body
      const apiKey = req.headers['x-api-key']

      // Download video from Veo URL
      const videoRes = await fetch(videoUrl)
      if (!videoRes.ok) throw new Error(`Video download failed: ${videoRes.status}`)
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer())

      // Decode audio from base64
      const audioBuffer = Buffer.from(audioBase64, 'base64')

      // Build multipart form for ElevenLabs Dubbing API
      const boundary = '----PipelineBoundary' + Date.now()
      const parts = []

      // Video file part
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`
      )
      parts.push(videoBuffer)
      parts.push('\r\n')

      // Source lang
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="source_lang"\r\n\r\nko\r\n`)
      // Target lang
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="target_lang"\r\n\r\nko\r\n`)
      // Mode
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="mode"\r\n\r\nautomatic\r\n`)
      // Num speakers
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="num_speakers"\r\n\r\n1\r\n`)

      parts.push(`--${boundary}--\r\n`)

      const multipartBody = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p))

      const response = await fetch('https://api.elevenlabs.io/v1/dubbing', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
      })

      const data = await response.json()
      if (!response.ok) return res.status(response.status).json(data)
      res.json({ id: data.dubbing_id, status: data.status || 'processing', expected_duration: data.expected_duration_sec })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
})

// Poll lip-sync status
app.get('/api/elevenlabs/lip-sync/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/dubbing/${req.params.id}`, {
      headers: { 'xi-api-key': req.headers['x-api-key'] },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Download lip-synced video
app.get('/api/elevenlabs/lip-sync/:id/download', async (req, res) => {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/dubbing/${req.params.id}/audio/ko`, {
      headers: { 'xi-api-key': req.headers['x-api-key'] },
    })
    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).send(err)
    }
    res.set('Content-Type', response.headers.get('content-type') || 'video/mp4')
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== ElevenLabs Video Upscaler Proxy =====
app.post('/api/elevenlabs/upscale', (req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString())
      const { videoUrl } = body
      const apiKey = req.headers['x-api-key']

      // Download video
      const videoRes = await fetch(videoUrl)
      if (!videoRes.ok) throw new Error(`Video download failed: ${videoRes.status}`)
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer())

      const boundary = '----UpscaleBoundary' + Date.now()
      const parts = []
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`)
      parts.push(videoBuffer)
      parts.push(`\r\n--${boundary}--\r\n`)

      const multipartBody = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p))

      const response = await fetch('https://api.elevenlabs.io/v1/video/upscale', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: multipartBody,
      })

      const data = await response.json()
      if (!response.ok) return res.status(response.status).json(data)
      res.json({ id: data.id || data.task_id, status: data.status || 'processing' })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
})

app.get('/api/elevenlabs/upscale/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/video/upscale/${req.params.id}`, {
      headers: { 'xi-api-key': req.headers['x-api-key'] },
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

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`)
})

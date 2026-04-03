import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.use(cors())

// JSON body for most routes (LlamaParse upload 제외)
app.use((req, res, next) => {
  if (req.path === '/api/llamaparse/upload') return next()
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

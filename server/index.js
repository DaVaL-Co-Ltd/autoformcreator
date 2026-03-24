import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())

// JSON body for most routes
app.use((req, res, next) => {
  if (req.path === '/api/llamaparse/upload') {
    // Skip JSON parsing for file upload - handle raw
    return next()
  }
  express.json({ limit: '50mb' })(req, res, next)
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

// ElevenLabs Proxy - TTS
app.post('/api/elevenlabs/tts/:voiceId', async (req, res) => {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${req.params.voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': req.headers['x-api-key'],
      },
      body: JSON.stringify(req.body),
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

// Flux Proxy - Generate
app.post('/api/flux/:model', async (req, res) => {
  try {
    const response = await fetch(`https://api.bfl.ml/v1/${req.params.model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-key': req.headers['x-api-key'],
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

// Flux Proxy - Get Result
app.get('/api/flux/result/:taskId', async (req, res) => {
  try {
    const response = await fetch(`https://api.bfl.ml/v1/get_result?id=${req.params.taskId}`, {
      headers: { 'x-key': req.headers['x-api-key'] },
    })
    const data = await response.json()
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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`)
})

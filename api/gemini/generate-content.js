const { isAuthorizedRequest, rejectUnauthorized } = require('../_requestAuth')

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const MODEL_NAME_PATTERN = /^gemini-[a-z0-9._-]+$/i

function getServerGeminiApiKey() {
  return String(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim()
}

function sanitizePayload(body) {
  const payload = {}

  if (Array.isArray(body.contents)) payload.contents = body.contents
  if (body.generationConfig && typeof body.generationConfig === 'object') payload.generationConfig = body.generationConfig
  if (Array.isArray(body.safetySettings)) payload.safetySettings = body.safetySettings
  if (Array.isArray(body.tools)) payload.tools = body.tools
  if (body.toolConfig && typeof body.toolConfig === 'object') payload.toolConfig = body.toolConfig
  if (body.systemInstruction && typeof body.systemInstruction === 'object') payload.systemInstruction = body.systemInstruction

  return payload
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAuthorizedRequest(req)) {
    return rejectUnauthorized(res)
  }

  const apiKey = getServerGeminiApiKey()
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY or GEMINI_API_KEY is not configured on the server.' })
  }

  const model = String(req.body?.model || '').trim()
  if (!MODEL_NAME_PATTERN.test(model)) {
    return res.status(400).json({ error: 'A valid Gemini model name is required.' })
  }

  const payload = sanitizePayload(req.body || {})
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
}

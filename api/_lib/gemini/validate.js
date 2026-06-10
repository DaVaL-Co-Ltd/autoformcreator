const crypto = require('crypto')
const { isAuthorizedRequest, rejectUnauthorized } = require('../requestAuth')

const DEFAULT_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getSourceEntries() {
  const entries = []
  const addSplitEntries = (name, value) => {
    const values = String(value || '')
      .split(/[\n,;]/)
      .map((key) => key.trim())
      .filter(Boolean)

    if (values.length === 0) {
      entries.push({ name, value: '' })
      return
    }

    values.forEach((key, index) => {
      entries.push({
        name: values.length === 1 ? name : `${name}[${index + 1}]`,
        value: key,
      })
    })
  }

  addSplitEntries('GEMINI_API_KEYS', process.env.GEMINI_API_KEYS || '')
  addSplitEntries('GOOGLE_API_KEY', process.env.GOOGLE_API_KEY || '')
  addSplitEntries('GEMINI_API_KEY', process.env.GEMINI_API_KEY || '')

  for (let i = 1; i <= 10; i += 1) {
    addSplitEntries(`GEMINI_API_KEY_${i}`, process.env[`GEMINI_API_KEY_${i}`] || '')
  }

  return entries
}

function buildFingerprint(value) {
  if (!value) return null
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function summarizeDiagnosis({ status, message, valid, present }) {
  if (!present) return 'Environment variable is not set.'
  if (valid) return 'Gemini accepted the key.'

  const normalized = String(message || '').toLowerCase()

  if (normalized.includes('api key not valid') || normalized.includes('api key not found')) {
    return 'The value is present, but Gemini rejected it as an invalid API key.'
  }
  if (normalized.includes('reported as leaked')) {
    return 'This key appears to have been blocked after being reported as leaked.'
  }
  if (status === 403) {
    return 'Gemini received the key, but access was denied. Check API restrictions, project access, or region policy.'
  }
  if (status === 404) {
    return 'The key may be fine, but the requested model or endpoint was not available.'
  }
  if (status >= 500) {
    return 'Gemini returned a server error. Retry after a short delay.'
  }

  return message || 'Gemini validation failed for an unknown reason.'
}

async function readJsonSafe(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { rawText: text }
  }
}

async function validateKeyAgainstGemini({ name, value, model }) {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return {
      name,
      present: false,
      valid: false,
      fingerprint: null,
      responseStatus: null,
      message: 'Environment variable is empty.',
      diagnosis: 'Environment variable is not set.',
    }
  }

  const response = await fetch(`${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': trimmed,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 1 },
    }),
  })

  const data = await readJsonSafe(response)
  const message =
    data?.error?.message ||
    data?.message ||
    data?.rawText ||
    (response.ok ? 'Gemini accepted the key.' : `Gemini returned HTTP ${response.status}.`)
  const valid = response.ok

  return {
    name,
    present: true,
    valid,
    fingerprint: buildFingerprint(trimmed),
    responseStatus: response.status,
    message,
    diagnosis: summarizeDiagnosis({
      status: response.status,
      message,
      valid,
      present: true,
    }),
  }
}

function getServerSelectedSource(results) {
  if (results.find((entry) => entry.name.startsWith('GEMINI_API_KEYS') && entry.present)) return 'GEMINI_API_KEYS'
  if (results.find((entry) => entry.name === 'GOOGLE_API_KEY' && entry.present)) return 'GOOGLE_API_KEY'
  if (results.find((entry) => entry.name === 'GEMINI_API_KEY' && entry.present)) return 'GEMINI_API_KEY'
  return null
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isAuthorizedRequest(req)) {
    return rejectUnauthorized(res)
  }

  const model = typeof req.query?.model === 'string' && req.query.model.trim()
    ? req.query.model.trim()
    : DEFAULT_MODEL

  try {
    const sourceEntries = getSourceEntries()
    const uniqueValidationCache = new Map()
    const results = []

    for (const source of sourceEntries) {
      const trimmed = String(source.value || '').trim()
      const cacheKey = trimmed ? `${model}:${buildFingerprint(trimmed)}` : `${source.name}:empty`

      if (!uniqueValidationCache.has(cacheKey)) {
        uniqueValidationCache.set(
          cacheKey,
          await validateKeyAgainstGemini({ name: source.name, value: trimmed, model })
        )
      }

      const cached = uniqueValidationCache.get(cacheKey)
      results.push({ ...cached, name: source.name })
    }

    const serverSelectedSource = getServerSelectedSource(results)
    const serverSelectedResult = results.find((entry) => (
      serverSelectedSource === 'GEMINI_API_KEYS'
        ? entry.name.startsWith('GEMINI_API_KEYS') && entry.present
        : entry.name === serverSelectedSource
    )) || null
    return res.status(200).json({
      checkedAt: new Date().toISOString(),
      model,
      summary: {
        anyPresent: results.some((entry) => entry.present),
        anyValid: results.some((entry) => entry.valid),
        serverSelectedSource,
        serverSelectedValid: Boolean(serverSelectedResult?.valid),
        clientBuildValid: false,
        precedenceNote:
          results.some((entry) => entry.name.startsWith('GEMINI_API_KEYS') && entry.present) &&
          (
            results.some((entry) => entry.name === 'GOOGLE_API_KEY' && entry.present) ||
            results.some((entry) => entry.name === 'GEMINI_API_KEY' && entry.present) ||
            results.some((entry) => /^GEMINI_API_KEY_\d+$/.test(entry.name) && entry.present)
          )
            ? 'GEMINI_API_KEYS is used first; other Gemini key variables are appended if they contain distinct keys.'
            : null,
        buildNote: 'Gemini requests now run through the server proxy, so the browser no longer needs a Gemini API key.',
      },
      sources: results,
    })
  } catch (error) {
    return res.status(500).json({
      error: 'Gemini validation endpoint failed.',
      message: error.message,
      checkedAt: new Date().toISOString(),
      model,
    })
  }
}

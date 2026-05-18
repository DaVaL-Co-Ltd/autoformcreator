const { isAuthorizedRequest, rejectUnauthorized } = require('../_lib/requestAuth')
const { getLlamaParseAuthHeader } = require('../_lib/llamaparse')

const config = { api: { bodyParser: false } }

async function handler(req, res) {
  if (!isAuthorizedRequest(req)) return rejectUnauthorized(res)
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = getLlamaParseAuthHeader()
  if (!authHeader) {
    return res.status(500).json({ error: 'LLAMAPARSE_API_KEY not configured on server' })
  }

  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks)
      const response = await fetch('https://api.cloud.llamaindex.ai/api/v1/parsing/upload', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
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
}

module.exports = handler
module.exports.config = config

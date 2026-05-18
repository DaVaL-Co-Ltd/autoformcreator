const { isAuthorizedRequest, rejectUnauthorized } = require('../../../../_lib/requestAuth')
const { getLlamaParseAuthHeader } = require('../../../../_lib/llamaparse')

module.exports = async function handler(req, res) {
  if (!isAuthorizedRequest(req)) return rejectUnauthorized(res)
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = getLlamaParseAuthHeader()
  if (!authHeader) {
    return res.status(500).json({ error: 'LLAMAPARSE_API_KEY not configured on server' })
  }

  const { jobId } = req.query
  try {
    const response = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${jobId}/result/markdown`, {
      headers: { Authorization: authHeader },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

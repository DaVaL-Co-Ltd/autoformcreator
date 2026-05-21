const { isAuthorizedRequest, rejectUnauthorized } = require('../../requestAuth')
const { ensureSupabaseConfigured, updateExtractionContent } = require('../../extractionsStore')

module.exports = async function handler(req, res) {
  if (!isAuthorizedRequest(req)) return rejectUnauthorized(res)
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  try {
    ensureSupabaseConfigured()
    const id = String(req.query.id || '').trim()
    if (!id) return res.status(400).json({ error: 'Extraction id is required.' })

    const item = await updateExtractionContent(id, req.body || {})
    return res.status(200).json(item)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

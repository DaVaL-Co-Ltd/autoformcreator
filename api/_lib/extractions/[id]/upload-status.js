const { isAuthorizedRequest, rejectUnauthorized } = require('../../requestAuth')
const { ensureSupabaseConfigured, updateUploadStatus } = require('../../extractionsStore')

module.exports = async function handler(req, res) {
  if (!isAuthorizedRequest(req)) return rejectUnauthorized(res)
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  try {
    ensureSupabaseConfigured()
    const id = String(req.query.id || '').trim()
    const channel = String(req.body?.channel || '').trim()
    if (!id || !channel) {
      return res.status(400).json({ error: 'Extraction id and channel are required.' })
    }

    const item = await updateUploadStatus(id, channel, req.body?.info || {})
    return res.status(200).json(item)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

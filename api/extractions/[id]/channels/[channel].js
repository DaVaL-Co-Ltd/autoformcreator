const { isAuthorizedRequest, rejectUnauthorized } = require('../../../_requestAuth')
const { ensureSupabaseConfigured, deleteExtractionChannel } = require('../../../_extractionsStore')

module.exports = async function handler(req, res) {
  if (!isAuthorizedRequest(req)) return rejectUnauthorized(res)
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  try {
    ensureSupabaseConfigured()
    const id = String(req.query.id || '').trim()
    const channel = String(req.query.channel || '').trim()
    if (!id || !channel) {
      return res.status(400).json({ error: 'Extraction id and channel are required.' })
    }

    const item = await deleteExtractionChannel(id, channel)
    return res.status(200).json({ ok: true, item })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

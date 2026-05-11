const { isAuthorizedRequest, rejectUnauthorized } = require('../../_requestAuth')
const { ensureSupabaseConfigured, fetchExtractionById, deleteExtraction } = require('../../_extractionsStore')

module.exports = async function handler(req, res) {
  if (!isAuthorizedRequest(req)) return rejectUnauthorized(res)

  try {
    ensureSupabaseConfigured()
    const id = String(req.query.id || '').trim()
    if (!id) return res.status(400).json({ error: 'Extraction id is required.' })

    if (req.method === 'GET') {
      const item = await fetchExtractionById(id)
      if (!item) return res.status(404).json({ error: 'Extraction not found.' })
      return res.status(200).json(item)
    }

    if (req.method === 'DELETE') {
      await deleteExtraction(id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

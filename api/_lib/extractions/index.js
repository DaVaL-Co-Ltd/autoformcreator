const { isAuthorizedRequest, rejectUnauthorized } = require('../requestAuth')
const { ensureSupabaseConfigured, listExtractions, saveExtraction } = require('../extractionsStore')

module.exports = async function handler(req, res) {
  if (!isAuthorizedRequest(req)) return rejectUnauthorized(res)

  try {
    ensureSupabaseConfigured()

    if (req.method === 'GET') {
      const page = req.query.page ? Number(req.query.page) : null
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : null
      const result = await listExtractions(
        Number.isFinite(page) && Number.isFinite(pageSize)
          ? { page, pageSize }
          : {}
      )
      return res.status(200).json(result)
    }

    if (req.method === 'POST') {
      const item = await saveExtraction(req.body || {}, req)
      return res.status(200).json(item)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

const { buildYoutubeAuthUrl } = require('../platformAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const data = buildYoutubeAuthUrl()
    return res.status(200).json({ url: data.url })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

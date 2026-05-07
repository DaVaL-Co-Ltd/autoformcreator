const { clearYoutubeTokens, isApiSecretValid } = require('../_platformAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!isApiSecretValid(req)) {
    return res.status(401).json({ error: 'Unauthorized: invalid x-app-secret' })
  }

  clearYoutubeTokens()
  return res.status(200).json({ success: true })
}

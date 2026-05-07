const { validateYoutubeSession } = require('../_platformAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const status = await validateYoutubeSession()
    return res.status(200).json(status)
  } catch (error) {
    return res.status(500).json({
      authenticated: false,
      hasCredentials: true,
      state: 'expired',
      validationError: error.message,
    })
  }
}

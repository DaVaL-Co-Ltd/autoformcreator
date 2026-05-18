const { validateInstagramSession } = require('../platformAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const status = await validateInstagramSession()
    return res.status(200).json(status)
  } catch (error) {
    return res.status(500).json({
      connected: false,
      hasAccessToken: false,
      hasBusinessId: false,
      mode: 'server-token',
      state: 'expired',
      username: null,
      validationError: error.message,
      canReconnect: false,
      canDisconnect: false,
    })
  }
}

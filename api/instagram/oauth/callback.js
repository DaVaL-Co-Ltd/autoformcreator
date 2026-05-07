const { handleInstagramOAuthCallback } = require('../../_platformAuth')

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed')
  }

  const { code, error, state } = req.query || {}
  if (error) {
    return res.status(400).send(`<html><body><h2>Instagram 인증 거부</h2><p>${error}</p></body></html>`)
  }
  if (!code) {
    return res.status(400).send('Missing code')
  }

  try {
    await handleInstagramOAuthCallback({ code, state })
    return res
      .status(200)
      .send('<html><body><h2>Instagram 인증 완료!</h2><p>이 창을 닫고 돌아가세요.</p><script>setTimeout(()=>window.close(),500)</script></body></html>')
  } catch (callbackError) {
    return res.status(500).send(`<html><body><h2>Instagram 인증 실패</h2><p>${callbackError.message}</p></body></html>`)
  }
}

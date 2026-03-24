export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { voiceId } = req.query
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': req.headers['x-api-key'],
      },
      body: JSON.stringify(req.body),
    })
    if (!response.ok) {
      const err = await response.text()
      return res.status(response.status).send(err)
    }
    res.setHeader('Content-Type', 'audio/mpeg')
    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { taskId } = req.query
  try {
    const response = await fetch(`https://api.bfl.ml/v1/get_result?id=${taskId}`, {
      headers: { 'x-key': req.headers['x-api-key'] },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

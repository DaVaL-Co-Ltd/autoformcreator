export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { jobId } = req.query
  try {
    const response = await fetch(`https://api.cloud.llamaindex.ai/api/v1/parsing/job/${jobId}`, {
      headers: { Authorization: `Bearer ${req.headers['x-api-key']}` },
    })
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json(data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

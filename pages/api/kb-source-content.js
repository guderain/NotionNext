const DEFAULT_KB_AI_BASE_URL =
  process.env.NODE_ENV === 'production' ? 'http://49.232.223.253:8000' : 'http://127.0.0.1:8000'
const KB_AI_BASE_URL = process.env.KB_AI_BASE_URL || DEFAULT_KB_AI_BASE_URL
const KB_AI_API_KEY = process.env.KB_AI_API_KEY || ''

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!KB_AI_API_KEY) {
    return res.status(500).json({ error: 'Server missing KB_AI_API_KEY' })
  }

  const path = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path
  if (!path) {
    return res.status(400).json({ error: 'Missing path' })
  }

  try {
    const upstream = await fetch(`${KB_AI_BASE_URL}/api/v1/sources/content?path=${encodeURIComponent(path)}`, {
      headers: { 'X-API-Key': KB_AI_API_KEY }
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
    return res.send(text)
  } catch (error) {
    return res.status(502).json({ error: 'Upstream source request failed', detail: String(error) })
  }
}

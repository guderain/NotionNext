const DEFAULT_KB_AI_BASE_URL =
  process.env.NODE_ENV === 'production' ? 'https://api.wangguanxi.space' : 'http://127.0.0.1:8000'
const KB_AI_BASE_URL = process.env.KB_AI_BASE_URL || DEFAULT_KB_AI_BASE_URL
const KB_AI_API_KEY = process.env.KB_AI_API_KEY || ''

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: true
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!KB_AI_API_KEY) {
    return res.status(500).json({ error: 'Server missing KB_AI_API_KEY' })
  }

  try {
    const upstream = await fetch(`${KB_AI_BASE_URL}/api/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': KB_AI_API_KEY
      },
      body: JSON.stringify(req.body || {})
    })

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text()
      return res.status(upstream.status).send(errText || 'Upstream stream error')
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        res.write(Buffer.from(value))
      }
    }
    res.end()
  } catch (error) {
    return res.status(502).json({ error: 'Upstream stream request failed', detail: String(error) })
  }
}

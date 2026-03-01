const DEFAULT_KB_AI_BASE_URL =
  process.env.NODE_ENV === 'production' ? 'https://api.wangguanxi.space' : 'http://127.0.0.1:8000'
const KB_AI_BASE_URL = process.env.KB_AI_BASE_URL || DEFAULT_KB_AI_BASE_URL
const KB_AI_API_KEY = process.env.KB_AI_API_KEY || ''

export const config = {
  maxDuration: 60
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 本地联调排查：检查 env 是否生效（排查完可删除）
  if (process.env.NODE_ENV === 'development') {
    console.log('[kb-chat] KB_AI_BASE_URL:', KB_AI_BASE_URL, '| KB_AI_API_KEY:', KB_AI_API_KEY ? '已配置' : '未配置')
  }
  if (!KB_AI_API_KEY) {
    return res.status(500).json({ error: 'Server missing KB_AI_API_KEY' })
  }

  try {
    const upstream = await fetch(`${KB_AI_BASE_URL}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': KB_AI_API_KEY
      },
      body: JSON.stringify(req.body || {})
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
    return res.send(text)
  } catch (error) {
    return res.status(502).json({ error: 'Upstream chat request failed', detail: String(error) })
  }
}

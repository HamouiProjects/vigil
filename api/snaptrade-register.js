import { createHmac } from 'crypto'

function snapSign(clientId, consumerKey, path) {
  const timestamp  = Math.floor(Date.now() / 1000).toString()
  const signature  = createHmac('sha256', consumerKey).update(clientId + timestamp + path).digest('base64')
  return { timestamp, signature }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const CLIENT_ID    = process.env.SNAPTRADE_CLIENT_ID
  const CONSUMER_KEY = process.env.SNAPTRADE_CONSUMER_KEY
  if (!CLIENT_ID || !CONSUMER_KEY) return res.status(500).json({ error: 'SnapTrade credentials not configured on server' })

  const { userId } = req.body ?? {}
  if (!userId) return res.status(400).json({ error: 'userId is required' })

  const path = '/api/v1/snapTrade/registerUser'
  const { timestamp, signature } = snapSign(CLIENT_ID, CONSUMER_KEY, path)
  const url = `https://api.snaptrade.com${path}?clientId=${encodeURIComponent(CLIENT_ID)}&timestamp=${timestamp}&signature=${encodeURIComponent(signature)}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(10000),
    })
    const result = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: result.message || result.detail || 'SnapTrade registration failed' })
    return res.status(200).json({ userId: result.userId, userSecret: result.userSecret })
  } catch {
    return res.status(502).json({ error: 'Could not reach SnapTrade.' })
  }
}

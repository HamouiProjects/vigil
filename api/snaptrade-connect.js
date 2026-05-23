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

  const { userId, userSecret, broker } = req.body ?? {}
  if (!userId || !userSecret || !broker) return res.status(400).json({ error: 'userId, userSecret, and broker are required' })

  const path = '/api/v1/snapTrade/login'
  const { timestamp, signature } = snapSign(CLIENT_ID, CONSUMER_KEY, path)
  const params = new URLSearchParams({ clientId: CLIENT_ID, timestamp, signature, userId, userSecret })
  const url = `https://api.snaptrade.com${path}?${params}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker, connectionType: 'read' }),
      signal: AbortSignal.timeout(10000),
    })
    const result = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: result.message || result.detail || 'SnapTrade login failed' })
    return res.status(200).json({ redirectURI: result.redirectURI })
  } catch {
    return res.status(502).json({ error: 'Could not reach SnapTrade.' })
  }
}

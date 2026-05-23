import { createHmac } from 'crypto'

function snapSign(clientId, consumerKey, path) {
  const timestamp  = Math.floor(Date.now() / 1000).toString()
  const signature  = createHmac('sha256', consumerKey).update(clientId + timestamp + path).digest('base64')
  return { timestamp, signature }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const CLIENT_ID    = process.env.SNAPTRADE_CLIENT_ID
  const CONSUMER_KEY = process.env.SNAPTRADE_CONSUMER_KEY
  if (!CLIENT_ID || !CONSUMER_KEY) return res.status(500).json({ error: 'SnapTrade credentials not configured on server' })

  const path = '/api/v1/brokerages'
  const { timestamp, signature } = snapSign(CLIENT_ID, CONSUMER_KEY, path)
  const params = new URLSearchParams({ clientId: CLIENT_ID, timestamp, signature })
  const url = `https://api.snaptrade.com${path}?${params}`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const result   = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: result.message || result.detail || 'SnapTrade error' })
    const brokers = result
      .filter(b => b.enabled !== false)
      .map(b => ({
        slug:    b.id,
        name:    b.display_name || b.name || b.id,
        logoUrl: b.square_logo_url || b.logo_url || b.logo || null,
      }))
    return res.status(200).json({ brokers })
  } catch {
    return res.status(502).json({ error: 'Could not reach SnapTrade.' })
  }
}

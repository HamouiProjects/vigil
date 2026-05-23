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

  const { userId, userSecret } = req.body ?? {}
  if (!userId || !userSecret) return res.status(400).json({ error: 'userId and userSecret are required' })

  const path = '/api/v1/holdings'
  const { timestamp, signature } = snapSign(CLIENT_ID, CONSUMER_KEY, path)
  const params = new URLSearchParams({ clientId: CLIENT_ID, timestamp, signature, userId, userSecret })
  const url = `https://api.snaptrade.com${path}?${params}`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const result   = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: result.message || result.detail || 'SnapTrade error' })

    const holdings   = []
    const accountMap = {}
    for (const item of result) {
      const accountName = item.account?.institution_name || item.account?.name || 'Account'
      const accountId   = item.account?.id
      if (accountId && !accountMap[accountId]) accountMap[accountId] = { id: accountId, name: accountName }
      for (const pos of (item.positions ?? [])) {
        const ticker = pos.symbol?.symbol?.rawTicker || pos.symbol?.symbol?.symbol || '?'
        const name   = pos.symbol?.symbol?.description || ticker
        const qty    = parseFloat(pos.units) || 0
        const price  = parseFloat(pos.price) || 0
        const value  = qty * price
        if (qty > 0) holdings.push({ ticker, name, qty, price, value, accountName })
      }
    }
    return res.status(200).json({ holdings, accounts: Object.values(accountMap) })
  } catch {
    return res.status(502).json({ error: 'Could not reach SnapTrade.' })
  }
}

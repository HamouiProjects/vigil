import { createHmac } from 'crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { apiKey, apiSecret } = req.body ?? {}
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'apiKey and apiSecret are required' })

  const timestamp   = Date.now().toString()
  const recvWindow  = '5000'
  const queryString = 'category=linear&settleCoin=USDT'
  const signPayload = timestamp + apiKey + recvWindow + queryString
  const signature   = createHmac('sha256', apiSecret).update(signPayload).digest('hex')

  try {
    const response = await fetch(
      'https://api.bybit.com/v5/position/list?category=linear&settleCoin=USDT',
      {
        headers: {
          'X-BAPI-API-KEY':     apiKey,
          'X-BAPI-TIMESTAMP':   timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
          'X-BAPI-SIGN':        signature,
        },
        signal: AbortSignal.timeout(10000),
      }
    )
    const result = await response.json()
    if (result.retCode !== 0) return res.status(400).json({ error: result.retMsg || 'Bybit API error', retCode: result.retCode })
    return res.status(200).json(result)
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach Bybit. Check your connection.' })
  }
}

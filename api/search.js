import { search as yahooSearch } from './_yahoo.js'
import { applyCors } from './_cors.js'
import { rateLimit } from './_ratelimit.js'

export default async function handler(req, res) {
  applyCors(req, res)

  if (req.method === 'OPTIONS') return res.status(200).end()

  const q = (req.query.q || '').trim()
  if (!q) return res.status(200).json({ results: [] })

  const rl = await rateLimit(req, 'search', 30)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'rate_limited' })
  }

  try {
    const results = await yahooSearch(q)
    return res.status(200).json({ results })
  } catch {
    return res.status(200).json({ results: [] })
  }
}

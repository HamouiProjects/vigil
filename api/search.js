import { search as yahooSearch } from './_yahoo.js'
import { applyCors } from './_cors.js'

export default async function handler(req, res) {
  applyCors(req, res)

  if (req.method === 'OPTIONS') return res.status(200).end()

  const q = (req.query.q || '').trim()
  if (!q) return res.status(200).json({ results: [] })

  try {
    const results = await yahooSearch(q)
    return res.status(200).json({ results })
  } catch {
    return res.status(200).json({ results: [] })
  }
}

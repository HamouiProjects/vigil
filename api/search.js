import { search as yahooSearch } from './_yahoo.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

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

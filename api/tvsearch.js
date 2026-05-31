function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const text = (req.query.text || '').trim()
  if (!text) return res.status(200).json([])

  const url =
    `https://symbol-search.tradingview.com/symbol_search/?text=${encodeURIComponent(text)}` +
    '&hl=0&lang=en&type=&exchange=&domain=production'

  try {
    const r = await fetch(url, {
      headers: {
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })

    if (!r.ok) {
      return res.status(502).json({ error: `Upstream HTTP ${r.status}` })
    }

    const raw = await r.json()
    if (!Array.isArray(raw)) {
      return res.status(502).json({ error: 'Invalid upstream response' })
    }

    const items = raw
      .slice(0, 15)
      .map(row => {
        const cleanSymbol = stripHtml(row.symbol).trim()
        const exchange = stripHtml(row.exchange).trim()
        const description = stripHtml(row.description).trim()
        const type = stripHtml(row.type).trim()
        const sym = exchange && cleanSymbol ? `${exchange}:${cleanSymbol}` : cleanSymbol
        return { sym, name: cleanSymbol, description, exchange, type }
      })
      .filter(item => item.sym)

    return res.status(200).json(items)
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Search failed' })
  }
}

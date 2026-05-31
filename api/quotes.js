import supabase from './_supabase.js'
import { getQuotes } from './_yahoo.js'

const FRESH_MS = 90_000

function toQuoteRow(row, stale) {
  return {
    symbol: row.symbol,
    price: row.price ?? null,
    change: row.change ?? null,
    change_pct: row.change_pct ?? null,
    currency: row.currency ?? null,
    name: row.name ?? null,
    asset_type: row.asset_type ?? null,
    exchange: row.exchange ?? null,
    country: row.country ?? null,
    stale: !!stale,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const symbols = (req.query.symbols || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)

  if (!symbols.length) return res.status(200).json({ quotes: [] })

  const now = Date.now()

  try {
    const { data: cached, error: dbErr } = await supabase
      .from('quote_cache')
      .select('*')
      .in('symbol', symbols)

    if (dbErr) throw dbErr

    const cachedBySym = new Map((cached ?? []).map(r => [r.symbol, r]))
    const freshQuotes = []
    const needFetch = []

    for (const sym of symbols) {
      const row = cachedBySym.get(sym)
      if (row) {
        const age = now - new Date(row.updated_at).getTime()
        if (age >= 0 && age < FRESH_MS) {
          freshQuotes.push(toQuoteRow(row, false))
          continue
        }
      }
      needFetch.push(sym)
    }

    let fetchedQuotes = []
    const staleQuotes = []

    if (needFetch.length) {
      try {
        fetchedQuotes = await getQuotes(needFetch)

        if (fetchedQuotes.length) {
          const upsertRows = fetchedQuotes.map(q => ({
            symbol: q.symbol,
            price: q.price,
            change: q.change,
            change_pct: q.change_pct,
            currency: q.currency,
            name: q.name,
            asset_type: q.asset_type,
            exchange: q.exchange,
            country: q.country,
            stale: false,
            updated_at: new Date().toISOString(),
          }))

          const { error: upsertErr } = await supabase
            .from('quote_cache')
            .upsert(upsertRows, { onConflict: 'symbol' })

          if (upsertErr) throw upsertErr
        }
      } catch {
        for (const sym of needFetch) {
          const row = cachedBySym.get(sym)
          if (row) staleQuotes.push(toQuoteRow(row, true))
        }
        if (freshQuotes.length === 0 && staleQuotes.length === 0) {
          return res.status(502).json({ error: 'Quotes unavailable' })
        }
      }
    }

    const fetchedBySym = new Map(fetchedQuotes.map(q => [q.symbol, toQuoteRow(q, false)]))
    const freshBySym = new Map(freshQuotes.map(q => [q.symbol, q]))
    const staleBySym = new Map(staleQuotes.map(q => [q.symbol, q]))

    const quotes = symbols
      .map(sym => fetchedBySym.get(sym) ?? freshBySym.get(sym) ?? staleBySym.get(sym))
      .filter(Boolean)

    return res.status(200).json({ quotes })
  } catch (err) {
    const msg = err.message || 'Failed to load quotes'
    return res.status(500).json({ error: msg })
  }
}

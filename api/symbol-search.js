import { applyCors } from './_cors.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 200
const MAX_RESULTS = 30

const UPSTREAM_BASE = 'https://symbol-search.tradingview.com/symbol_search/'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Origin: 'https://www.tradingview.com',
  Referer: 'https://www.tradingview.com/',
  Accept: 'application/json',
}

/** @type {Map<string, { t: number, results: object[] }>} */
const memoryCache = new Map()

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, '')
}

function getFreshCache(key) {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.t >= CACHE_TTL_MS) return null
  return entry.results
}

function setCache(key, results) {
  memoryCache.set(key, { t: Date.now(), results })
  if (memoryCache.size > MAX_CACHE_ENTRIES) {
    let oldestKey = null
    let oldestT = Infinity
    for (const [k, v] of memoryCache) {
      if (v.t < oldestT) {
        oldestT = v.t
        oldestKey = k
      }
    }
    if (oldestKey) memoryCache.delete(oldestKey)
  }
}

function normalizeItem(item) {
  const cleanedSymbol = stripHtml(item.symbol).trim()
  if (!cleanedSymbol) return null

  const prefix = item.prefix || item.exchange || ''
  return {
    tvSymbol: `${prefix}:${cleanedSymbol}`,
    display: cleanedSymbol,
    description: stripHtml(item.description).trim(),
    exchange: String(item.exchange || ''),
    type: String(item.type || ''),
  }
}

function normalizeResults(items) {
  if (!Array.isArray(items)) return []
  const results = []
  for (const item of items) {
    const row = normalizeItem(item)
    if (!row) continue
    results.push(row)
    if (results.length >= MAX_RESULTS) break
  }
  return results
}

function setResponseHeaders(res) {
  res.setHeader('Cache-Control', 'public, max-age=300')
}

async function fetchUpstream(q) {
  const url = `${UPSTREAM_BASE}?text=${encodeURIComponent(q)}&hl=0&exchange=&lang=en&type=&domain=production`
  return fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000) })
}

export default async function handler(req, res) {
  applyCors(req, res)

  if (req.method === 'OPTIONS') return res.status(200).end()

  const q = (req.query.q || '').trim()

  if (!q) {
    return res.status(200).json({ results: [] })
  }

  if (req.query.debug) {
    try {
      const upstream = await fetchUpstream(q)
      let items = []
      if (upstream.ok) {
        try {
          items = await upstream.json()
        } catch {
          items = []
        }
      }
      const results = normalizeResults(items)
      return res.status(200).json({
        q,
        upstreamStatus: upstream.status,
        upstreamOk: upstream.ok,
        count: results.length,
        sample: results.slice(0, 3),
      })
    } catch (err) {
      return res.status(200).json({
        q,
        upstreamStatus: null,
        upstreamOk: false,
        count: 0,
        sample: [],
        error: String(err?.message ?? 'fetch failed').slice(0, 80),
      })
    }
  }

  const cacheKey = q.toLowerCase()
  const fresh = getFreshCache(cacheKey)
  if (fresh) {
    setResponseHeaders(res)
    return res.status(200).json({ results: fresh })
  }

  try {
    const upstream = await fetchUpstream(q)
    if (!upstream.ok) {
      setResponseHeaders(res)
      return res.status(200).json({ results: [], error: `upstream ${upstream.status}` })
    }

    let items
    try {
      items = await upstream.json()
    } catch {
      setResponseHeaders(res)
      return res.status(200).json({ results: [], error: 'invalid JSON' })
    }

    const results = normalizeResults(items)
    setCache(cacheKey, results)
    setResponseHeaders(res)
    return res.status(200).json({ results })
  } catch (err) {
    setResponseHeaders(res)
    return res.status(200).json({ results: [], error: String(err?.message ?? 'fetch failed').slice(0, 80) })
  }
}

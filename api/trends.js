import supabase from './_supabase.js'
import { applyCors } from './_cors.js'

const FRESH_MS = 12 * 60 * 60 * 1000
const MAX_KEYWORDS = 5

function parseKeywords(raw) {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS)
}

function cacheKey(geo, date, keywordJoined) {
  return `trends:${geo}:${date}:${keywordJoined.toLowerCase()}`
}

async function readTrendsCache(key) {
  if (!supabase) return { cachedRow: null }
  try {
    const { data, error: dbErr } = await supabase
      .from('feed_cache')
      .select('*')
      .eq('feed_url', key)
      .maybeSingle()
    if (dbErr || !data) return { cachedRow: null }
    const age = Date.now() - new Date(data.updated_at).getTime()
    if (age >= 0 && age < FRESH_MS) {
      return { cachedRow: data, fresh: true }
    }
    return { cachedRow: data, fresh: false }
  } catch {
    return { cachedRow: null }
  }
}

async function cacheWrite(key, payload) {
  if (!supabase) return
  try {
    await supabase.from('feed_cache').upsert(
      {
        feed_url: key,
        title: payload.keywords.join(', '),
        items: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'feed_url' },
    )
  } catch { /* best-effort */ }
}

// Provider: SerpApi google_trends TIMESERIES (swap fetchFromSerpApi to change provider)
async function fetchFromSerpApi(keywords, date, geo, apiKey) {
  const q = keywords.join(',')
  const u = `https://serpapi.com/search.json?engine=google_trends&data_type=TIMESERIES&q=${encodeURIComponent(q)}&date=${encodeURIComponent(date)}${geo ? `&geo=${encodeURIComponent(geo)}` : ''}&api_key=${apiKey}`
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) })
  const data = await res.json()
  if (data.search_metadata?.status === 'Error' || !data.interest_over_time?.timeline_data) {
    return { error: 'TRENDS_UNAVAILABLE' }
  }
  const points = (data.interest_over_time.timeline_data || []).map((d) => ({
    t: Number(d.timestamp) * 1000,
    label: d.date,
    values: keywords.map((_, i) => d.values?.[i]?.extracted_value ?? null),
  }))
  const hasData = points.some((p) => p.values.some((v) => v != null))
  if (!points.length || !hasData) return { error: 'TRENDS_UNAVAILABLE' }
  return { keywords, date, geo, points }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const rawKeyword = (req.query.keyword || '').trim()
  if (!rawKeyword || rawKeyword.length > 200) {
    return res.status(400).json({ error: 'invalid keyword' })
  }

  const keywords = parseKeywords(rawKeyword)
  if (!keywords.length) {
    return res.status(400).json({ error: 'invalid keyword' })
  }

  const date = (req.query.date || 'today 12-m').trim()
  const geo = (req.query.geo || '').trim()
  const fresh = req.query.fresh === '1'

  if (!process.env.SERPAPI_KEY) {
    return res.status(200).json({ error: 'TRENDS_NOT_CONFIGURED' })
  }

  const key = cacheKey(geo, date, keywords.join(','))

  const { cachedRow, fresh: cacheFresh } = await readTrendsCache(key)
  if (!fresh && cacheFresh && cachedRow?.items?.points) {
    return res.status(200).json(cachedRow.items)
  }

  try {
    const result = await fetchFromSerpApi(keywords, date, geo, process.env.SERPAPI_KEY)
    if (result.error) {
      return res.status(200).json({ error: result.error })
    }
    await cacheWrite(key, result)
    return res.status(200).json(result)
  } catch {
    return res.status(200).json({ error: 'TRENDS_UNAVAILABLE' })
  }
}

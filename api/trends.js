import supabase from './_supabase.js'
import { applyCors } from './_cors.js'

const FRESH_MS = 12 * 60 * 60 * 1000

function cacheKey(geo, date, keyword) {
  return `trends:${geo}:${date}:${keyword.toLowerCase().trim()}`
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
        title: payload.keyword,
        items: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'feed_url' },
    )
  } catch { /* best-effort */ }
}

// Provider: SerpApi google_trends TIMESERIES (swap fetchFromSerpApi to change provider)
async function fetchFromSerpApi(keyword, date, geo, apiKey) {
  const u = `https://serpapi.com/search.json?engine=google_trends&data_type=TIMESERIES&q=${encodeURIComponent(keyword)}&date=${encodeURIComponent(date)}${geo ? `&geo=${encodeURIComponent(geo)}` : ''}&api_key=${apiKey}`
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) })
  const data = await res.json()
  if (data.search_metadata?.status === 'Error' || !data.interest_over_time?.timeline_data) {
    return { error: 'TRENDS_UNAVAILABLE' }
  }
  const points = (data.interest_over_time.timeline_data || [])
    .map((d) => ({
      t: Number(d.timestamp) * 1000,
      label: d.date,
      value: d.values?.[0]?.extracted_value ?? null,
    }))
    .filter((p) => p.value != null)
  if (!points.length) return { error: 'TRENDS_UNAVAILABLE' }
  return { keyword, date, geo, points }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const keyword = (req.query.keyword || '').trim()
  if (!keyword || keyword.length > 120) {
    return res.status(400).json({ error: 'invalid keyword' })
  }

  const date = (req.query.date || 'today 12-m').trim()
  const geo = (req.query.geo || '').trim()

  if (!process.env.SERPAPI_KEY) {
    return res.status(200).json({ error: 'TRENDS_NOT_CONFIGURED' })
  }

  const key = cacheKey(geo, date, keyword)

  const { cachedRow, fresh } = await readTrendsCache(key)
  if (fresh && cachedRow?.items?.points) {
    return res.status(200).json(cachedRow.items)
  }

  try {
    const result = await fetchFromSerpApi(keyword, date, geo, process.env.SERPAPI_KEY)
    if (result.error) {
      return res.status(200).json({ error: result.error })
    }
    await cacheWrite(key, result)
    return res.status(200).json(result)
  } catch {
    return res.status(200).json({ error: 'TRENDS_UNAVAILABLE' })
  }
}

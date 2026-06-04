const EMPTY_FC = { type: 'FeatureCollection', features: [] }

const SOURCE_TTL_MS = {
  gdelt: 600_000,
}

/** @type {Map<string, { body: object, storedAt: number }>} */
const memoryCache = new Map()

function cacheKey(source, params) {
  return `${source}:${JSON.stringify(params)}`
}

function getFreshCache(key, ttlMs) {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.storedAt >= ttlMs) return null
  return entry.body
}

function setCache(key, body) {
  memoryCache.set(key, { body, storedAt: Date.now() })
}

function getStaleCache(key) {
  return memoryCache.get(key)?.body ?? null
}

function setGeoHeaders(res) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
}

function normalizeGdelt(raw) {
  const features = (raw?.features || [])
    .map((f) => {
      if (!f?.geometry) return null
      const props = f.properties || {}
      const rawName = props.name ?? props.location ?? 'Unknown location'
      const name = String(rawName).replace(/<[^>]*>/g, '').trim() || 'Unknown location'
      let count = props.count
      if (count == null && props.featurecount != null) count = props.featurecount
      if (count == null) count = 1
      count = Number(count)
      if (Number.isNaN(count)) count = 1
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: { name, count },
      }
    })
    .filter(Boolean)

  return { type: 'FeatureCollection', features }
}

async function fetchGdelt(query) {
  const q =
    query ||
    '(airstrike OR shelling OR clashes OR militants OR offensive OR insurgents OR "armed conflict")'
  const url = `https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(q)}&format=GeoJSON&mode=pointdata&maxpoints=250&timespan=24H`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  let raw = null
  try {
    raw = await res.json()
  } catch {
    return EMPTY_FC
  }
  if (!res.ok || !raw?.features) return EMPTY_FC
  return normalizeGdelt(raw)
}

async function handleGdelt(req) {
  const q = (req.query.q || '').trim() || undefined
  const params = { q: q ?? '' }
  const key = cacheKey('gdelt', params)
  const ttl = SOURCE_TTL_MS.gdelt

  const fresh = getFreshCache(key, ttl)
  if (fresh) return fresh

  try {
    const body = await fetchGdelt(q)
    setCache(key, body)
    return body
  } catch {
    return getStaleCache(key) ?? EMPTY_FC
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const source = (req.query.source || '').toLowerCase()

  try {
    let body = EMPTY_FC

    switch (source) {
      case 'gdelt':
        body = await handleGdelt(req)
        break
      default:
        return res.status(400).json({ error: 'invalid source' })
    }

    setGeoHeaders(res)
    return res.status(200).json(body)
  } catch {
    const key =
      source === 'gdelt'
        ? cacheKey('gdelt', { q: (req.query.q || '').trim() || '' })
        : null
    const stale = key ? getStaleCache(key) : null
    setGeoHeaders(res)
    return res.status(200).json(stale ?? EMPTY_FC)
  }
}

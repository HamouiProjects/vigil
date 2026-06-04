const EMPTY_FC = { type: 'FeatureCollection', features: [] }
const AIRCRAFT_UPSTREAM = 'https://api.adsb.lol/v2/mil'

const SOURCE_TTL_MS = {
  gdelt: 600_000,
  aircraft: 15_000,
  firms: 900_000,
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

function redactUpstreamUrl(url) {
  try {
    const u = new URL(url)
    for (const param of ['key', 'api_key', 'MAP_KEY']) {
      if (u.searchParams.has(param)) u.searchParams.set(param, 'REDACTED')
    }
    u.pathname = u.pathname.replace(/\/csv\/[^/]+/, '/csv/REDACTED')
    return u.toString()
  } catch {
    return url.replace(/\/csv\/[^/]+/, '/csv/REDACTED')
  }
}

function getFirmsUpstreamUrl() {
  const mapKey = process.env.FIRMS_MAP_KEY || ''
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/VIIRS_NOAA20_NRT/world/1`
}

function getGdeltUpstreamUrl(query) {
  const q =
    query ||
    '(airstrike OR shelling OR clashes OR militants OR offensive OR insurgents OR "armed conflict")'
  return `https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(q)}&format=GeoJSON&maxpoints=250`
}

function getUpstreamUrl(source, req) {
  switch (source) {
    case 'gdelt': {
      const q = (req.query.q || '').trim() || undefined
      return getGdeltUpstreamUrl(q)
    }
    case 'aircraft':
      return AIRCRAFT_UPSTREAM
    case 'firms':
      return getFirmsUpstreamUrl()
    default:
      return null
  }
}

function parseCsvLine(line) {
  return line.split(',').map((s) => s.trim())
}

function headerIndex(headers, name) {
  const target = name.toLowerCase()
  return headers.findIndex((h) => h.toLowerCase() === target)
}

function normalizeFirms(csvText) {
  try {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length < 2) return EMPTY_FC

    const headers = parseCsvLine(lines[0])
    const latIdx = headerIndex(headers, 'latitude')
    const lonIdx = headerIndex(headers, 'longitude')
    const frpIdx = headerIndex(headers, 'frp')
    const confIdx = headerIndex(headers, 'confidence')
    const dateIdx = headerIndex(headers, 'acq_date')
    const timeIdx = headerIndex(headers, 'acq_time')
    if (latIdx < 0 || lonIdx < 0) return EMPTY_FC

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i])
      const lat = Number(row[latIdx])
      const lon = Number(row[lonIdx])
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue
      rows.push({
        lat,
        lon,
        frp: frpIdx >= 0 ? Number(row[frpIdx]) || 0 : 0,
        confidence: confIdx >= 0 ? (row[confIdx] ?? '') : '',
        acq_date: dateIdx >= 0 ? (row[dateIdx] ?? '') : '',
        acq_time: timeIdx >= 0 ? (row[timeIdx] ?? '') : '',
      })
    }

    rows.sort((a, b) => b.frp - a.frp)
    const features = rows.slice(0, 600).map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: {
        frp: r.frp,
        confidence: r.confidence,
        acq_date: r.acq_date,
        acq_time: r.acq_time,
      },
    }))

    return { type: 'FeatureCollection', features }
  } catch {
    return EMPTY_FC
  }
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

function normalizeAircraft(raw) {
  const ac = raw?.ac
  if (!Array.isArray(ac)) return EMPTY_FC

  const features = ac
    .map((a) => {
      const lat = Number(a.lat)
      const lon = Number(a.lon)
      if (Number.isNaN(lat) || Number.isNaN(lon)) return null
      const track = typeof a.track === 'number' ? a.track : null
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          callsign: (a.flight || '').trim(),
          hex: a.hex ?? '',
          type: a.t ?? '',
          reg: a.r ?? '',
          alt: a.alt_baro ?? null,
          speed: a.gs ?? null,
          track,
        },
      }
    })
    .filter(Boolean)

  return { type: 'FeatureCollection', features }
}

async function fetchGdelt(query) {
  const url = getGdeltUpstreamUrl(query)
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

async function fetchFirms() {
  if (!process.env.FIRMS_MAP_KEY) return EMPTY_FC

  const url = getFirmsUpstreamUrl()
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  let text = ''
  try {
    text = await res.text()
  } catch {
    return EMPTY_FC
  }
  if (!res.ok) return EMPTY_FC
  return normalizeFirms(text)
}

async function fetchAircraft() {
  const res = await fetch(AIRCRAFT_UPSTREAM, { signal: AbortSignal.timeout(8000) })
  let raw = null
  try {
    raw = await res.json()
  } catch {
    return EMPTY_FC
  }
  if (!res.ok || !Array.isArray(raw?.ac)) return EMPTY_FC
  return normalizeAircraft(raw)
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

async function handleFirms() {
  const key = cacheKey('firms', {})
  const ttl = SOURCE_TTL_MS.firms

  const fresh = getFreshCache(key, ttl)
  if (fresh) return fresh

  try {
    const body = await fetchFirms()
    setCache(key, body)
    return body
  } catch {
    return getStaleCache(key) ?? EMPTY_FC
  }
}

async function handleAircraft() {
  const key = cacheKey('aircraft', {})
  const ttl = SOURCE_TTL_MS.aircraft

  const fresh = getFreshCache(key, ttl)
  if (fresh) return fresh

  try {
    const body = await fetchAircraft()
    setCache(key, body)
    return body
  } catch {
    return getStaleCache(key) ?? EMPTY_FC
  }
}

async function handleDebugPassthrough(req, res, source) {
  const upstreamUrl = getUpstreamUrl(source, req)
  if (!upstreamUrl) {
    return res.status(400).json({ error: 'invalid source' })
  }

  try {
    const upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(8000) })
    const contentType = upstream.headers.get('content-type') || ''
    const text = await upstream.text()
    return res.status(200).json({
      source,
      upstreamUrl: redactUpstreamUrl(upstreamUrl),
      upstreamStatus: upstream.status,
      contentType,
      bodySnippet: text.slice(0, 800),
    })
  } catch (err) {
    return res.status(200).json({
      source,
      upstreamUrl: redactUpstreamUrl(upstreamUrl),
      upstreamStatus: null,
      contentType: '',
      bodySnippet: String(err?.message ?? 'fetch failed').slice(0, 800),
    })
  }
}

function staleCacheKey(source, req) {
  if (source === 'gdelt') {
    return cacheKey('gdelt', { q: (req.query.q || '').trim() || '' })
  }
  if (source === 'aircraft') return cacheKey('aircraft', {})
  if (source === 'firms') return cacheKey('firms', {})
  return null
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const source = (req.query.source || '').toLowerCase()

  if (req.query.debug === '1') {
    return handleDebugPassthrough(req, res, source)
  }

  try {
    let body = EMPTY_FC

    switch (source) {
      case 'gdelt':
        body = await handleGdelt(req)
        break
      case 'aircraft':
        body = await handleAircraft()
        break
      case 'firms':
        body = await handleFirms()
        break
      default:
        return res.status(400).json({ error: 'invalid source' })
    }

    setGeoHeaders(res)
    return res.status(200).json(body)
  } catch {
    const key = staleCacheKey(source, req)
    const stale = key ? getStaleCache(key) : null
    setGeoHeaders(res)
    return res.status(200).json(stale ?? EMPTY_FC)
  }
}

import { applyCors } from './_cors.js'
import { rateLimit } from './_ratelimit.js'

const EMPTY_FC = { type: 'FeatureCollection', features: [] }
const AIRCRAFT_UPSTREAM = 'https://api.adsb.lol/v2/mil'
const AIRCRAFT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

const SOURCE_META = {
  aircraft: {
    source: 'aircraft',
    sourceName: 'adsb.lol military ADS-B',
    sourceUrl: 'https://adsb.lol/',
  },
  firms: {
    source: 'firms',
    sourceName: 'NASA FIRMS VIIRS NOAA-20 NRT',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
  },
  conflict: {
    source: 'conflict',
    sourceName: 'GDELT GEO 2.0',
    sourceUrl: 'https://www.gdeltproject.org/',
  },
}

const SOURCE_TTL_MS = {
  aircraft: 15_000,
  firms: 900_000,
  conflict: 900_000,
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

function getCacheStoredAt(source) {
  const entry = memoryCache.get(cacheKey(source, {}))
  return entry ? entry.storedAt : null
}

function buildMeta(source, body) {
  const storedAt = getCacheStoredAt(source)
  const fetchedAt = new Date(storedAt ?? Date.now()).toISOString()
  const count = Array.isArray(body?.features) ? body.features.length : 0
  return { ...SOURCE_META[source], fetchedAt, count }
}

function setGeoHeaders(res) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300')
}

function debugAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.DEBUG_ENDPOINTS === '1'
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

const GDELT_CONFLICT_QUERY = '(war OR clashes OR airstrike OR shelling OR offensive OR militants OR insurgency OR "armed conflict")'

function getGdeltConflictUrl() {
  return 'https://api.gdeltproject.org/api/v2/geo/geo?query=' + encodeURIComponent(GDELT_CONFLICT_QUERY) + '&mode=country&format=GeoJSON&timespan=7d'
}

function getUpstreamUrl(source, req) {
  switch (source) {
    case 'aircraft':
      return AIRCRAFT_UPSTREAM
    case 'firms':
      return getFirmsUpstreamUrl()
    case 'conflict':
      return getGdeltConflictUrl()
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
          squawk: a.squawk ?? null,
        },
      }
    })
    .filter(Boolean)

  return { type: 'FeatureCollection', features }
}

function normalizeConflict(raw) {
  if (!raw || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) return EMPTY_FC
  const features = raw.features
    .map((f) => {
      if (!f.geometry) return null
      return {
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          name: f.properties?.name ?? '',
          count: Number(f.properties?.count) || 0,
        },
      }
    })
    .filter(Boolean)
  return { type: 'FeatureCollection', features }
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
  const res = await fetch(AIRCRAFT_UPSTREAM, { headers: AIRCRAFT_HEADERS, signal: AbortSignal.timeout(8000) })
  let raw = null
  try {
    raw = await res.json()
  } catch {
    return EMPTY_FC
  }
  if (!res.ok || !Array.isArray(raw?.ac)) return EMPTY_FC
  return normalizeAircraft(raw)
}

async function fetchConflict() {
  const res = await fetch(getGdeltConflictUrl(), { signal: AbortSignal.timeout(12000) })
  let raw = null
  try {
    raw = await res.json()
  } catch {
    return EMPTY_FC
  }
  if (!res.ok) return EMPTY_FC
  return normalizeConflict(raw)
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

async function handleConflict() {
  const key = cacheKey('conflict', {})
  const ttl = SOURCE_TTL_MS.conflict

  const fresh = getFreshCache(key, ttl)
  if (fresh) return fresh

  try {
    const body = await fetchConflict()
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
    const upstream = await fetch(upstreamUrl, { headers: source === 'aircraft' ? AIRCRAFT_HEADERS : undefined, signal: AbortSignal.timeout(8000) })
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

function staleCacheKey(source) {
  if (source === 'aircraft') return cacheKey('aircraft', {})
  if (source === 'firms') return cacheKey('firms', {})
  if (source === 'conflict') return cacheKey('conflict', {})
  return null
}

export default async function handler(req, res) {
  applyCors(req, res)

  if (req.method === 'OPTIONS') return res.status(200).end()

  const source = (req.query.source || '').toLowerCase()

  if (source !== 'aircraft' && source !== 'firms' && source !== 'conflict') {
    return res.status(400).json({ error: 'invalid source' })
  }

  const rl = await rateLimit(req, 'geo', 30)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'rate_limited' })
  }

  if (req.query.debug === '1' && debugAllowed()) {
    return handleDebugPassthrough(req, res, source)
  }

  try {
    let body = EMPTY_FC

    switch (source) {
      case 'aircraft':
        body = await handleAircraft()
        break
      case 'firms':
        body = await handleFirms()
        break
      case 'conflict':
        body = await handleConflict()
        break
    }

    setGeoHeaders(res)
    return res.status(200).json({ ...body, meta: buildMeta(source, body) })
  } catch {
    const key = staleCacheKey(source)
    const stale = key ? getStaleCache(key) : null
    const fallbackBody = stale ?? EMPTY_FC
    setGeoHeaders(res)
    return res.status(200).json({ ...fallbackBody, meta: buildMeta(source, fallbackBody) })
  }
}

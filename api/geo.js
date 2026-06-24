import { applyCors } from './_cors.js'
import { rateLimit } from './_ratelimit.js'
import zlib from 'node:zlib'
import { COUNTRY_BY_FIPS } from './_conflict_countries.js'

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
    sourceName: 'GDELT 2.0 Event database',
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

// ---- Conflict: GDELT 2.0 raw 15-minute Event files -> per-country conflict-event choropleth ----
// Free, no key. We tally CAMEO conflict events (EventRootCode 18 assault / 19 fight / 20 mass
// violence) by ActionGeo_CountryCode (where the event happened, FIPS 10-4) across a trailing
// window of 15-minute export files, then attach each country's polygon from COUNTRY_BY_FIPS.
const GDELT_BASE = 'http://data.gdeltproject.org/gdeltv2'
const CONFLICT_WINDOW_FILES = 12 // 12 x 15min = trailing ~3h of events (tune at eyeball)
const CONFLICT_FILE_TIMEOUT_MS = 6000
const CONFLICT_ROOT_CODES = new Set(['18', '19', '20'])
const COL_EVENT_ROOT = 28 // EventRootCode
const COL_ACTION_COUNTRY = 53 // ActionGeo_CountryCode (FIPS 10-4)
const GDELT_HEADERS = { 'User-Agent': AIRCRAFT_HEADERS['User-Agent'] }

function gdeltStamp(ms) {
  const dt = new Date(ms)
  return (
    dt.getUTCFullYear().toString() +
    String(dt.getUTCMonth() + 1).padStart(2, '0') +
    String(dt.getUTCDate()).padStart(2, '0') +
    String(dt.getUTCHours()).padStart(2, '0') +
    String(dt.getUTCMinutes()).padStart(2, '0') +
    '00'
  )
}

// Build the trailing window of export URLs from current UTC time. We start one 15-minute slot
// back (files publish a few minutes after each boundary) so the newest URL always exists; any
// individual miss is tolerated by Promise.allSettled.
function recentExportUrls(n) {
  const slot = 15 * 60 * 1000
  const newest = Math.floor(Date.now() / slot) * slot - slot
  const urls = []
  for (let i = 0; i < n; i++) {
    urls.push(`${GDELT_BASE}/${gdeltStamp(newest - i * slot)}.export.CSV.zip`)
  }
  return urls
}

// Extract a single-file (stored or deflated) PKZIP entry without an external dependency, using
// Node's built-in raw inflate. GDELT export zips contain exactly one tab-delimited .CSV.
function unzipSingle(buf) {
  if (!buf || buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) return null
  const method = buf.readUInt16LE(8)
  const compSize = buf.readUInt32LE(18)
  const nameLen = buf.readUInt16LE(26)
  const extraLen = buf.readUInt16LE(28)
  const dataStart = 30 + nameLen + extraLen
  if (dataStart > buf.length) return null
  if (method === 0) {
    return buf.subarray(dataStart, compSize ? dataStart + compSize : undefined).toString('latin1')
  }
  if (method !== 8) return null
  let deflated
  if (compSize > 0) {
    deflated = buf.subarray(dataStart, dataStart + compSize)
  } else {
    // No size in the local header (data descriptor): bound at the central directory signature.
    const cdIdx = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), dataStart)
    deflated = buf.subarray(dataStart, cdIdx > dataStart ? cdIdx : undefined)
  }
  try {
    return zlib.inflateRawSync(deflated).toString('latin1')
  } catch {
    return null
  }
}

// Conflict columns are ASCII, so latin1 decode + tab split is correct (tabs are single 0x09
// bytes, never produced inside a UTF-8 multibyte sequence). Mutates `counts` (FIPS -> tally).
async function tallyExport(url, counts) {
  try {
    const res = await fetch(url, { headers: GDELT_HEADERS, signal: AbortSignal.timeout(CONFLICT_FILE_TIMEOUT_MS) })
    if (!res.ok) return
    const text = unzipSingle(Buffer.from(await res.arrayBuffer()))
    if (!text) return
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue
      const cols = line.split('\t')
      if (cols.length < 54) continue
      if (!CONFLICT_ROOT_CODES.has(cols[COL_EVENT_ROOT])) continue
      const fips = cols[COL_ACTION_COUNTRY]
      if (!fips) continue
      counts[fips] = (counts[fips] || 0) + 1
    }
  } catch {
    /* skip this file */
  }
}

// Resolve FIPS tallies to country polygon features, summing counts that map to the same country
// (GDELT splits Palestinian territory into WE + GZ, both resolving to the one Palestine polygon).
function countsToFeatureCollection(counts) {
  const byName = new Map()
  for (const fips in counts) {
    const c = COUNTRY_BY_FIPS[fips]
    if (!c) continue
    const cur = byName.get(c.name)
    if (cur) cur.count += counts[fips]
    else byName.set(c.name, { name: c.name, geometry: c.geometry, count: counts[fips] })
  }
  const features = []
  for (const v of byName.values()) {
    if (v.count > 0) {
      features.push({ type: 'Feature', geometry: v.geometry, properties: { name: v.name, count: v.count } })
    }
  }
  return { type: 'FeatureCollection', features }
}

function getUpstreamUrl(source) {
  switch (source) {
    case 'aircraft':
      return AIRCRAFT_UPSTREAM
    case 'firms':
      return getFirmsUpstreamUrl()
    case 'conflict':
      return `${GDELT_BASE}/lastupdate.txt`
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
  try {
    const counts = {}
    await Promise.allSettled(recentExportUrls(CONFLICT_WINDOW_FILES).map((u) => tallyExport(u, counts)))
    if (Object.keys(counts).length === 0) return EMPTY_FC
    return countsToFeatureCollection(counts)
  } catch {
    return EMPTY_FC
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

async function handleConflict() {
  const key = cacheKey('conflict', {})
  const ttl = SOURCE_TTL_MS.conflict

  const fresh = getFreshCache(key, ttl)
  if (fresh) return fresh

  try {
    const body = await fetchConflict()
    // Only cache a non-empty result so a transient upstream miss does not pin an empty map for 15 min.
    if (body.features.length > 0) setCache(key, body)
    return body.features.length > 0 ? body : (getStaleCache(key) ?? body)
  } catch {
    return getStaleCache(key) ?? EMPTY_FC
  }
}

async function handleDebugPassthrough(req, res, source) {
  const upstreamUrl = getUpstreamUrl(source)
  if (!upstreamUrl) {
    return res.status(400).json({ error: 'invalid source' })
  }

  try {
    const upstream = await fetch(upstreamUrl, { headers: (source === 'aircraft' || source === 'conflict') ? AIRCRAFT_HEADERS : undefined, signal: AbortSignal.timeout(8000) })
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

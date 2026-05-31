import fetch from 'node-fetch'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const TIMEOUT_MS = 8000
const QUOTE_BASE = 'https://query1.finance.yahoo.com'
const CHUNK_SIZE = 50

const SUFFIX_COUNTRY = {
  DE: 'de',
  L: 'gb',
  PA: 'fr',
  TW: 'tw',
  TA: 'il',
  SW: 'ch',
  HK: 'hk',
  T: 'jp',
  TO: 'ca',
  AX: 'au',
  MI: 'it',
  MC: 'es',
  AS: 'nl',
  ST: 'se',
}

const CURRENCY_COUNTRY = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', CHF: 'ch', AUD: 'au',
  CAD: 'ca', NZD: 'nz', HKD: 'hk', SGD: 'sg', SEK: 'se', NOK: 'no',
  DKK: 'dk', CNY: 'cn', INR: 'in', KRW: 'kr', MXN: 'mx', BRL: 'br',
  ZAR: 'za', TRY: 'tr', PLN: 'pl', THB: 'th', IDR: 'id', MYR: 'my',
  PHP: 'ph', TWD: 'tw', ILS: 'il', RUB: 'ru', HUF: 'hu', CZK: 'cz',
}

const NULL_COUNTRY_TYPES = new Set([
  'CRYPTOCURRENCY', 'FUTURE', 'INDEX', 'MUTUALFUND', 'OPTION', 'WARRANT',
])

let cachedCookie = null
let cachedCrumb = null

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout))
}

function parseCookies(res) {
  if (typeof res.headers.raw === 'function') {
    const raw = res.headers.raw()['set-cookie']
    if (raw) {
      const list = Array.isArray(raw) ? raw : [raw]
      return list.map(c => String(c).split(';')[0]).filter(Boolean).join('; ')
    }
  }
  const single = res.headers.get('set-cookie')
  if (single) {
    return single.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
  }
  return ''
}

function isCrumbError(status, bodyText) {
  if (status === 401) return true
  const t = (bodyText || '').toLowerCase()
  return t.includes('unauthorized') || t.includes('invalid crumb')
}

export function deriveCountry(symbol, assetType, currency) {
  const sym = String(symbol || '').toUpperCase()
  const type = String(assetType || '').toUpperCase()

  if (NULL_COUNTRY_TYPES.has(type)) return null
  if (sym.endsWith('=X') || type === 'CURRENCY') {
    const cur = String(currency || '').toUpperCase()
    return CURRENCY_COUNTRY[cur] ?? null
  }

  const dot = sym.lastIndexOf('.')
  if (dot > 0) {
    const suffix = sym.slice(dot + 1)
    if (SUFFIX_COUNTRY[suffix]) return SUFFIX_COUNTRY[suffix]
  }

  if ((type === 'EQUITY' || type === 'ETF') && dot < 0) return 'us'

  return null
}

async function refreshCookieCrumb() {
  let cookie = ''
  for (const url of ['https://fc.yahoo.com', 'https://finance.yahoo.com']) {
    const cookieRes = await fetchWithTimeout(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
    })
    cookie = parseCookies(cookieRes)
    if (cookie) break
  }
  if (!cookie) throw new Error('Failed to obtain Yahoo cookie')

  const crumbRes = await fetchWithTimeout(`${QUOTE_BASE}/v1/test/getcrumb`, {
    headers: { 'User-Agent': UA, Cookie: cookie },
  })
  if (!crumbRes.ok) throw new Error(`Crumb request failed: HTTP ${crumbRes.status}`)
  const crumb = (await crumbRes.text()).trim()
  if (!crumb) throw new Error('Empty Yahoo crumb')

  cachedCookie = cookie
  cachedCrumb = crumb
  return { cookie, crumb }
}

async function ensureSession(force = false) {
  if (!force && cachedCookie && cachedCrumb) {
    return { cookie: cachedCookie, crumb: cachedCrumb }
  }
  return refreshCookieCrumb()
}

function mapQuoteResult(q) {
  const symbol = q.symbol
  const currency = q.currency ?? null
  const asset_type = q.quoteType ?? null
  return {
    symbol,
    price: q.regularMarketPrice ?? null,
    change: q.regularMarketChange ?? null,
    change_pct: q.regularMarketChangePercent ?? null,
    currency,
    name: q.shortName || q.longName || null,
    asset_type,
    exchange: q.fullExchangeName || q.exchange || null,
    country: deriveCountry(symbol, asset_type, currency),
  }
}

async function fetchQuoteChunk(symbols, retried = false) {
  const { cookie, crumb } = await ensureSession(retried)
  const url =
    `${QUOTE_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}` +
    `&crumb=${encodeURIComponent(crumb)}`

  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': UA, Cookie: cookie },
  })
  const bodyText = await res.text()

  if (isCrumbError(res.status, bodyText) && !retried) {
    await refreshCookieCrumb()
    return fetchQuoteChunk(symbols, true)
  }

  if (!res.ok) throw new Error(`Yahoo quote HTTP ${res.status}`)

  let data
  try {
    data = JSON.parse(bodyText)
  } catch {
    throw new Error('Invalid Yahoo quote response')
  }

  const results = data?.quoteResponse?.result
  if (!Array.isArray(results)) return []
  return results.map(mapQuoteResult)
}

export async function getQuotes(symbols) {
  const unique = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))]
  if (!unique.length) return []

  const out = []
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE)
    const batch = await fetchQuoteChunk(chunk)
    out.push(...batch)
  }
  return out
}

function mapSearchResult(q) {
  const symbol = q.symbol
  const asset_type = q.quoteType ?? q.type ?? null
  const currency = q.currency ?? null
  return {
    symbol,
    name: q.shortname || q.shortName || q.longname || q.longName || null,
    exchange: q.exchDisp || q.exchange || null,
    type: asset_type,
    country: deriveCountry(symbol, asset_type, currency),
  }
}

export async function search(query) {
  const q = String(query || '').trim()
  if (!q) return []

  const url = `${QUOTE_BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Yahoo search HTTP ${res.status}`)

  const data = await res.json()
  const quotes = data?.quotes
  if (!Array.isArray(quotes)) return []
  return quotes.slice(0, 12).map(mapSearchResult)
}

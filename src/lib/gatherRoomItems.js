import { GN_SEARCH_URL, KF_DEFAULT_TABS, nsExtractSource, nsCleanTitle } from '../widgets/NewsSearchWidget.jsx'
import { SUGGESTIONS } from '../widgets/RssFeedWidget.jsx'
import { PLATFORMS } from '../widgets/SocialFeedWidget.jsx'

async function fetchSourceParts(sources, perSource) {
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const res = await fetch(`/api/rss?url=${encodeURIComponent(src.url)}`, {
        signal: AbortSignal.timeout(12000),
      })
      const data = await res.json()
      const items = (data?.items ?? []).slice(0, perSource)
      return items.map((it) => {
        const isFeed = src.kind === 'feed'
        const outlet = isFeed ? (nsExtractSource(it.title) || src.label) : src.label
        const title = isFeed ? nsCleanTitle(it.title) : it.title
        return {
          source: outlet,
          title,
          url: it.link,
          publishedAt: it.pubDate,
          excerpt: isFeed ? '' : (it.description || ''),
        }
      })
    }),
  )

  return sources.map((src, i) => {
    const r = results[i]
    const items = r.status === 'fulfilled' ? r.value : []
    return { label: src.label, items }
  })
}

export async function gatherRoomItems(workspace, { maxSources = 6, perSource = 6 } = {}) {
  if (!workspace?.widgets?.length) return []

  const groups = []

  for (const w of workspace.widgets) {
    if (w.type === 'feed') {
      const tabs = w.config?.tabs ?? KF_DEFAULT_TABS
      const keywords = tabs.map((t) => t.keyword).filter(Boolean)
      const primaryKeyword = keywords[0] || 'World'
      const sourceUrl = GN_SEARCH_URL(primaryKeyword)
      const includeInBrief = w.config?.includeInBrief !== false

      const sources = []
      const seen = new Set()
      for (const tab of tabs) {
        const url = GN_SEARCH_URL(tab.keyword)
        if (!url || seen.has(url)) continue
        seen.add(url)
        sources.push({ label: tab.keyword, url, kind: 'feed' })
      }

      const capped = sources.slice(0, maxSources)
      const parts = await fetchSourceParts(capped, perSource)
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'News Search', sourceUrl, includeInBrief, parts })
    } else if (w.type === 'rss') {
      const includeInBrief = w.config?.includeInBrief !== false
      const sources = []
      const seen = new Set()
      for (const f of SUGGESTIONS.slice(0, 6)) {
        if (!f.url || seen.has(f.url)) continue
        seen.add(f.url)
        sources.push({ label: f.name, url: f.url, kind: 'rss' })
      }

      const parts = await fetchSourceParts(sources, perSource)
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'RSS', sourceUrl: null, includeInBrief, parts })
    } else if (w.type === 'social') {
      const includeInBrief = w.config?.includeInBrief !== false
      const accounts = w.config?.accounts ?? []
      const sources = []
      const seen = new Set()
      for (const account of accounts) {
        if (account.enabled === false) continue
        const platform = PLATFORMS[account.platform]
        if (!platform) continue
        const url = platform.feedUrl(account.value)
        if (!url || seen.has(url)) continue
        seen.add(url)
        sources.push({ label: account.value, url, kind: 'rss' })
      }
      const parts = await fetchSourceParts(sources, perSource)
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'Social', sourceUrl: null, includeInBrief, parts })
    } else if (w.type === 'browser') {
      const includeInBrief = w.config?.includeInBrief !== false
      const items = []
      const directSeen = new Set()
      for (const a of (w.config?.saved ?? [])) {
        if (!a?.url || !a?.title || directSeen.has(a.url)) continue
        directSeen.add(a.url)
        items.push({ source: a.source || '', title: a.title, url: a.url, publishedAt: a.publishedAt ?? null, excerpt: a.excerpt || '' })
      }
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'Reader', sourceUrl: null, includeInBrief, items })
    }
  }

  return groups
}

const US_TV_PREFIXES = new Set(['NASDAQ','NYSE','NYSEARCA','AMEX','BATS','BATS_DLY','ARCA','CBOE'])
const HEATMAP_PROXY = {
  sp500:  { label: 'S&P 500', symbol: 'SPY' },
  nasdaq: { label: 'Nasdaq',  symbol: 'QQQ' },
  dow:    { label: 'Dow',     symbol: 'DIA' },
}
const CRYPTO_TV_PREFIXES = new Set(['BINANCE', 'BINANCEUS', 'COINBASE', 'BITSTAMP', 'KRAKEN', 'BYBIT', 'OKX', 'BITFINEX', 'GEMINI', 'KUCOIN', 'HUOBI', 'BITFLYER', 'CRYPTO', 'CRYPTOCAP'])
const FX_TV_PREFIXES = new Set(['FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'SAXO', 'FXCM', 'ICEUS', 'PEPPERSTONE'])

// Curated map: a known TradingView index ticker to its Yahoo Finance symbol. Applied only when
// the symbol carries a non-US exchange or quote prefix, so a US listed ETF that happens to share
// a ticker (read through a US prefix) is left as the equity, not turned into an index.
const INDEX_YAHOO = {
  SPX: '^GSPC', SP500: '^GSPC', US500: '^GSPC',
  NDX: '^NDX', US100: '^NDX', IXIC: '^IXIC',
  DJI: '^DJI', US30: '^DJI', DOWJONES: '^DJI',
  DAX: '^GDAXI', DE40: '^GDAXI', DEU40: '^GDAXI', GER40: '^GDAXI',
  UKX: '^FTSE', FTSE: '^FTSE', UK100: '^FTSE',
  CAC: '^FCHI', CAC40: '^FCHI', FR40: '^FCHI', FRA40: '^FCHI',
  NI225: '^N225', NIKKEI: '^N225', JP225: '^N225', NKY: '^N225',
  HSI: '^HSI', HK50: '^HSI',
  SX5E: '^STOXX50E', STOXX50E: '^STOXX50E',
  IBEX: '^IBEX', ES35: '^IBEX',
  AEX: '^AEX', SSMI: '^SSMI', SMI: '^SSMI',
  KOSPI: '^KS11', SENSEX: '^BSESN', NIFTY: '^NSEI', NIFTY50: '^NSEI',
  XJO: '^AXJO', AU200: '^AXJO', ASX200: '^AXJO',
  TSX: '^GSPTSE', VIX: '^VIX',
}

const FIAT_CCY = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'HKD', 'SGD', 'CNY', 'CNH', 'KRW', 'INR', 'BRL', 'MXN', 'ZAR', 'TRY', 'PLN', 'SEK', 'NOK', 'DKK', 'THB', 'TWD', 'ILS', 'HUF', 'CZK'])
const USD_STABLES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USDD', 'DAI', 'USD']

function isFiatPair(t) {
  return /^[A-Z]{6}$/.test(t) && FIAT_CCY.has(t.slice(0, 3)) && FIAT_CCY.has(t.slice(3))
}
function cryptoPairToYahoo(ticker) {
  // BTCUSDT to BTC-USD, ETHUSD to ETH-USD. Only when the quote leg is USD or a USD stablecoin.
  const t = String(ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  for (const q of USD_STABLES) {
    if (t.length > q.length && t.endsWith(q)) {
      const base = t.slice(0, t.length - q.length)
      if (/^[A-Z0-9]{2,6}$/.test(base)) return `${base}-USD`
    }
  }
  return null
}
function fxPairToYahoo(ticker) {
  const t = String(ticker || '').toUpperCase()
  return isFiatPair(t) ? `${t}=X` : null
}
function usSymbol(ticker) {
  const t = String(ticker || '').toUpperCase()
  if (isFiatPair(t)) return `${t}=X`           // a bare fiat pair stored without a venue prefix
  const c = cryptoPairToYahoo(t)                // a bare crypto pair, e.g. BTCUSD
  if (c) return c
  return /^[A-Z.\-]{1,8}$/.test(t) ? t : null   // a plain US ticker
}

// Map a stored TradingView symbol (what the prices and chart widgets hold) to a Yahoo Finance
// symbol (what the brief queries). Covers US equities, crypto, FX, and major global indices.
// Anything that cannot be mapped confidently returns null and is dropped from the brief, so the
// brief never shows a wrong or unverified quote.
function tvToYahoo(tvSymbol) {
  const s = String(tvSymbol || '').trim().toUpperCase()
  if (!s) return null
  let prefix = '', ticker = s
  const colon = s.indexOf(':')
  if (colon >= 0) { prefix = s.slice(0, colon); ticker = s.slice(colon + 1) }
  if (!ticker) return null
  if (prefix === '' || US_TV_PREFIXES.has(prefix)) return usSymbol(ticker)
  if (CRYPTO_TV_PREFIXES.has(prefix)) return cryptoPairToYahoo(ticker)
  if (FX_TV_PREFIXES.has(prefix)) return fxPairToYahoo(ticker)
  if (INDEX_YAHOO[ticker]) return INDEX_YAHOO[ticker]
  return null
}
export function gatherMarketSymbols(workspace) {
  const out = { symbols: [], heatmaps: [] }
  if (!workspace?.widgets?.length) return out
  const seen = new Set(); const seenHm = new Set()
  for (const w of workspace.widgets) {
    if (w.config?.includeInBrief === false) continue
    if (w.type === 'chart') {
      const t = tvToYahoo(w.config?.symbol)
      if (t && !seen.has(t)) { seen.add(t); out.symbols.push(t) }
    } else if (w.type === 'prices') {
      for (const s of (w.config?.symbols ?? [])) {
        const t = tvToYahoo(s?.tvSymbol)
        if (t && !seen.has(t)) { seen.add(t); out.symbols.push(t) }
      }
    } else if (w.type === 'heatmap') {
      const key = w.config?.market == null ? 'sp500' : w.config.market
      const proxy = HEATMAP_PROXY[key]
      if (proxy && !seenHm.has(proxy.symbol)) { seenHm.add(proxy.symbol); out.heatmaps.push(proxy) }
    }
  }
  return out
}

const TREND_WINDOW_LABELS = { 'now 7-d': '7 days', 'today 1-m': '30 days', 'today 12-m': '12 months', 'today 5-y': '5 years' }
export function gatherTrendsRequest(workspace) {
  if (!workspace?.widgets?.length) return null
  const w = workspace.widgets.find((x) => x.type === 'trends')
  if (!w || w.config?.includeInBrief === false) return null
  const cfg = w.config || {}
  let terms = (Array.isArray(cfg.keywords) && cfg.keywords.length) ? cfg.keywords : (cfg.keyword ? [cfg.keyword] : [])
  terms = terms.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 5)
  if (!terms.length) return null
  const window = cfg.time || 'today 12-m'
  return { terms, window, windowLabel: TREND_WINDOW_LABELS[window] || window }
}

// WMO weather code to a short label. Same thresholds the Weather widget uses (decodeWmo).
function wmoLabel(code) {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Fog'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Rain showers'
  if (code <= 86) return 'Snow showers'
  if (code <= 99) return 'Thunderstorm'
  return 'Unknown'
}

function roundOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

// Resolve a weather widget to a lat/lon. Prefers the persisted latLon, falls back to
// geocoding the configured city via nominatim (the same source the widget uses).
async function resolveWeatherLatLon(cfg) {
  const ll = cfg?.latLon
  if (ll && typeof ll.lat === 'number' && typeof ll.lon === 'number') {
    return { lat: ll.lat, lon: ll.lon, name: ll.name || cfg.locName || cfg.city || 'Weather' }
  }
  const city = cfg?.city
  if (!city) return null
  try {
    const json = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`,
      { signal: AbortSignal.timeout(8000) }
    ).then((r) => r.json())
    const loc = json?.[0]
    if (!loc) return null
    return { lat: parseFloat(loc.lat), lon: parseFloat(loc.lon), name: loc.display_name.split(',')[0].trim() }
  } catch { return null }
}

// Current conditions plus a two day forecast for each included weather widget.
// Client side fetch, returns already resolved data so the brief endpoint does no weather fetch.
export async function gatherWeather(workspace) {
  if (!workspace?.widgets?.length) return null
  const widgets = workspace.widgets.filter((w) => w.type === 'weather' && w.config?.includeInBrief !== false)
  if (!widgets.length) return null
  const locations = []
  for (const w of widgets) {
    const loc = await resolveWeatherLatLon(w.config || {})
    if (!loc) continue
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
        `&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code,relative_humidity_2m` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=2&timezone=auto`
      const wx = await fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => r.json())
      const c = wx?.current
      const d = wx?.daily
      if (!c) continue
      locations.push({
        name: loc.name,
        tempC: roundOrNull(c.temperature_2m),
        feelsC: roundOrNull(c.apparent_temperature),
        condition: wmoLabel(Number(c.weather_code)),
        windKph: roundOrNull(c.wind_speed_10m),
        humidity: roundOrNull(c.relative_humidity_2m),
        todayMaxC: roundOrNull(d?.temperature_2m_max?.[0]),
        todayMinC: roundOrNull(d?.temperature_2m_min?.[0]),
        tomorrowMaxC: roundOrNull(d?.temperature_2m_max?.[1]),
        tomorrowMinC: roundOrNull(d?.temperature_2m_min?.[1]),
        tomorrowCondition: wmoLabel(Number(d?.weather_code?.[1])),
      })
    } catch { /* skip this location, never fabricate */ }
  }
  return locations.length ? { locations } : null
}

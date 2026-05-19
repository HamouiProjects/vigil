import { useState, useEffect, useCallback, useRef } from 'react'
import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './App.css'

const SizedGridLayout = WidthProvider(GridLayout)

// ─── UTC Clock ────────────────────────────────────────────────────────────────
function UtcClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setTime([n.getUTCHours(), n.getUTCMinutes(), n.getUTCSeconds()]
        .map(v => String(v).padStart(2, '0')).join(':'))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="clock">
      <span className="clock-label">UTC</span>{time}
    </div>
  )
}

// ─── NavBar ───────────────────────────────────────────────────────────────────
function NavBar({ saved, workspaces, activeWs, onSwitchWs, onRenameWs }) {
  const [editingId, setEditingId] = useState(null)
  const [nameInput, setNameInput] = useState('')

  function startRename(ws, e) {
    e.stopPropagation()
    setEditingId(ws.id)
    setNameInput(ws.name)
  }

  function commitRename(ws) {
    const name = nameInput.trim()
    if (name && name !== ws.name) onRenameWs(ws.id, name)
    setEditingId(null)
  }

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="logo-icon">V</div>
        <span className="logo-text">Vigil</span>
        <span className="logo-tag">OPS</span>
      </div>
      <div className="navbar-center">
        <div className="ws-tabs">
          {workspaces.map(ws =>
            editingId === ws.id ? (
              <input
                key={ws.id}
                className="ws-name-input"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={() => commitRename(ws)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  commitRename(ws)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                autoFocus
              />
            ) : (
              <div
                key={ws.id}
                className={`ws-tab${ws.id === activeWs ? ' active' : ''}`}
                onClick={() => onSwitchWs(ws.id)}
                onDoubleClick={e => startRename(ws, e)}
                title="Double-click to rename"
              >
                {ws.name}
              </div>
            )
          )}
        </div>
      </div>
      <div className="navbar-right">
        <div className="status-dot">LIVE</div>
        <UtcClock />
        <div className={`save-indicator${saved ? ' visible' : ''}`}>SAVED</div>
      </div>
    </nav>
  )
}

// ─── Shared widget header ─────────────────────────────────────────────────────
function WHeader({ title, badge, badgeActive, onRefresh }) {
  return (
    <div className="widget-header">
      <div className="widget-title-group">
        <span className="widget-title">{title}</span>
      </div>
      <div className="widget-actions">
        {badge && (
          <span className={`widget-badge${badgeActive ? '' : ' inactive'}`}>{badge}</span>
        )}
        {onRefresh && (
          <button className="widget-btn" onClick={onRefresh} title="Refresh">↻</button>
        )}
      </div>
    </div>
  )
}

// ─── World Map (iframe embed switcher) ───────────────────────────────────────
const MAP_TABS = [
  {
    id: 'conflict', label: 'Conflict',
    src: 'https://liveuamap.com',
  },
  {
    id: 'flights', label: 'Flights',
    src: 'https://globe.adsbexchange.com/?lat=20&lon=0&zoom=3',
  },
  {
    id: 'weather', label: 'Weather',
    src: 'https://embed.windy.com/embed2.html?lat=20&lon=0&zoom=3&level=surface&overlay=wind&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=kt&metricTemp=%C2%B0C&radarRange=-1',
  },
  { id: 'cyber',     label: 'Cyber',     src: 'https://threatmap.checkpoint.com/' },
  { id: 'wildfires', label: 'Wildfires', src: 'https://firms.modaps.eosdis.nasa.gov/map/' },
  { id: 'marine',    label: 'Marine',    src: 'https://www.myshiptracking.com/' },
]

function MapWidget() {
  const [activeTab,   setActiveTab]   = useState('conflict')
  const [loadError,   setLoadError]   = useState(false)
  const [useFallback, setUseFallback] = useState(false)

  function switchTab(id) {
    setActiveTab(id)
    setLoadError(false)
    setUseFallback(false)
  }

  const tab = MAP_TABS.find(t => t.id === activeTab) ?? MAP_TABS[0]
  const iframeSrc = useFallback ? (tab.fallback ?? tab.src) : tab.src

  function handleError() {
    if (!useFallback && tab.fallback) {
      setUseFallback(true)
    } else {
      setLoadError(true)
    }
  }

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">World Map</span>
        <div
          className="map-tabs"
          onPointerDownCapture={e => e.stopPropagation()}
        >
          {MAP_TABS.map(t => (
            <button
              key={t.id}
              className={`map-tab-btn${activeTab === t.id ? ' active' : ''}`}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <iframe
          key={`${tab.id}-${useFallback}`}
          src={iframeSrc}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          title={tab.label}
          allowFullScreen
          onError={handleError}
          onLoad={() => setLoadError(false)}
        />
        {loadError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '10px',
            background: '#080f18',
          }}>
            <div style={{ fontSize: '11px', color: '#6e8098', textAlign: 'center', padding: '0 20px' }}>
              {tab.label} does not allow embedding.
            </div>
            <a
              href={tab.src}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '11px', fontWeight: 600, color: '#00c6ff',
                background: 'rgba(0,198,255,0.1)', border: '1px solid rgba(0,198,255,0.3)',
                borderRadius: '4px', padding: '5px 14px', textDecoration: 'none',
                letterSpacing: '0.05em',
              }}
            >
              Open in new tab →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── News Search (Google News RSS via corsproxy.io) ───────────────────────────
const DEFAULT_KEYWORDS = 'conflict'

function dotColor(title = '') {
  if (/war|attack|kill|bomb|shoot|explo|missil|airst/i.test(title)) return 'red'
  if (/crisis|sanction|tension|protest|riot|unrest/i.test(title))   return 'yellow'
  if (/deal|agree|peace|ceasefire|accord/i.test(title))             return 'green'
  return 'blue'
}

const GN_RSS2JSON = q =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
  )}`

async function fetchNewsSearch(q) {
  const res  = await fetch(GN_RSS2JSON(q), { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.status !== 'ok') throw new Error(json.message || 'Feed error')
  const items = json.items ?? []
  if (!items.length) throw new Error('No results')
  return items.map(item => ({
    title:   item.title   ?? '(no title)',
    link:    item.link    ?? '',
    pubDate: item.pubDate ?? '',
    source:  item.author  ?? '',
  }))
}

function KeywordFeed({ initialUrl = DEFAULT_KEYWORDS, onUrlChange }) {
  const [query,     setQuery]     = useState(initialUrl)
  const [input,     setInput]     = useState(initialUrl)
  const [articles,  setArticles]  = useState([])
  const [fetchedAt, setFetchedAt] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { setQuery(initialUrl); setInput(initialUrl) }, [initialUrl])

  const load = useCallback(async (q) => {
    setLoading(true); setError(null)
    try {
      const arts = await fetchNewsSearch(q)
      setArticles(arts)
      setFetchedAt(Date.now())
    } catch (e) {
      setError(e.message === 'No results'
        ? 'No results — try a different keyword'
        : 'News search unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(query)
    const id = setInterval(() => load(query), 120_000)
    return () => clearInterval(id)
  }, [query, load])

  const isLive = fetchedAt && (Date.now() - fetchedAt) < 5 * 60_000
  const badge  = loading ? 'LOADING…' : error ? 'ERROR' : isLive ? 'LIVE' : 'CACHED'

  return (
    <div className="widget">
      <WHeader
        title="News Search"
        badge={badge}
        badgeActive={!error && !loading}
        onRefresh={() => load(query)}
      />
      <div className="widget-body">
        <div className="rss-container">
          <form
            className="rss-url-bar"
            onSubmit={e => {
              e.preventDefault()
              const q = input.trim()
              if (q) { setQuery(q); onUrlChange?.(q) }
            }}
          >
            <input
              className="rss-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Keywords… (e.g. ukraine war)"
              spellCheck={false}
            />
            <button className="rss-go-btn" type="submit">GO</button>
          </form>
          {error   ? <div className="feed-error">{error}</div>
         : loading ? <div className="feed-loading">Searching news…</div>
         : (
            <div className="feed-list">
              {articles.map((art, i) => (
                <a
                  key={i}
                  className="feed-item feed-item-link"
                  href={art.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className={`feed-dot ${dotColor(art.title)}`} />
                  <span className="feed-text">
                    <span className="feed-source">{art.source || '—'}</span>
                    {art.title}
                  </span>
                  <span className="feed-time">{rssRelTime(art.pubDate)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── RSS Feed (BBC via rss2json) ──────────────────────────────────────────────
const DEFAULT_RSS = 'https://feeds.bbci.co.uk/news/world/rss.xml'
const rss2json    = url => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`

function rssRelTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1)    return 'now'
    if (diff < 60)   return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch { return '—' }
}

function RssFeed({ initialUrl = DEFAULT_RSS, onUrlChange }) {
  const [url,     setUrl]     = useState(initialUrl)
  const [input,   setInput]   = useState(initialUrl)
  const [feed,    setFeed]    = useState(null)
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => { setUrl(initialUrl); setInput(initialUrl) }, [initialUrl])

  const load = useCallback(async (targetUrl) => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch(rss2json(targetUrl))
      const json = await res.json()
      if (json.status !== 'ok') throw new Error(json.message || 'Bad response')
      setFeed(json.feed)
      setItems(json.items ?? [])
    } catch (e) {
      setError(e.message || 'Failed to fetch feed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(url) }, [url, load])

  const badge = loading ? 'LOADING…' : error ? 'ERROR' : feed ? feed.title?.slice(0, 18) : 'RSS'

  return (
    <div className="widget">
      <WHeader title="RSS Feed" badge={badge} badgeActive={!error && !loading} onRefresh={() => load(url)} />
      <div className="widget-body">
        <div className="rss-container">
          <form
            className="rss-url-bar"
            onSubmit={e => { e.preventDefault(); const t = input.trim(); if (t) { setUrl(t); onUrlChange?.(t) } }}
          >
            <input
              className="rss-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Paste RSS URL…"
              spellCheck={false}
            />
            <button className="rss-go-btn" type="submit">GO</button>
          </form>
          {error   ? <div className="feed-error">{error}</div>
         : loading ? <div className="feed-loading">Fetching feed…</div>
         : (
            <div className="feed-list">
              {items.map((item, i) => (
                <a
                  key={i}
                  className="feed-item feed-item-link"
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="feed-dot blue" />
                  <span className="feed-text">
                    <span className="feed-source">{item.author || feed?.title || ''}</span>
                    {item.title}
                  </span>
                  <span className="feed-time">{rssRelTime(item.pubDate)}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Price Tracker (CoinGecko BTC/ETH/XAU/SOL) ───────────────────────────────
const CG_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,pax-gold,solana' +
  '&vs_currencies=usd&include_24hr_change=true'

function fmtPrice(n, dec = 2) {
  return n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtChg(n) {
  return n == null
    ? { text: '—', dir: '' }
    : { text: `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`, dir: n >= 0 ? 'up' : 'down' }
}

function PriceTracker() {
  const [prices,  setPrices]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(CG_URL)
      const cg  = await res.json()
      setPrices([
        { ticker: 'BTC/USD', value: fmtPrice(cg.bitcoin?.usd, 0),     ...fmtChg(cg.bitcoin?.usd_24h_change) },
        { ticker: 'ETH/USD', value: fmtPrice(cg.ethereum?.usd, 2),    ...fmtChg(cg.ethereum?.usd_24h_change) },
        { ticker: 'XAU/USD', value: fmtPrice(cg['pax-gold']?.usd, 0), ...fmtChg(cg['pax-gold']?.usd_24h_change) },
        { ticker: 'SOL/USD', value: fmtPrice(cg.solana?.usd, 2),      ...fmtChg(cg.solana?.usd_24h_change) },
      ])
      setError(null)
    } catch {
      setError('Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="widget">
      <WHeader
        title="Price Tracker"
        badge={loading ? 'LOADING…' : error ? 'ERROR' : 'LIVE'}
        badgeActive={!error && !loading}
        onRefresh={load}
      />
      <div className="widget-body">
        {error   ? <div className="feed-error">{error}</div>
       : loading ? <div className="feed-loading">Fetching prices…</div>
       : (
          <div className="price-grid">
            {prices.map((p, i) => (
              <div key={i} className="price-cell">
                <span className="price-ticker">{p.ticker}</span>
                <span className="price-value">{p.value}</span>
                <span className={`price-change ${p.dir}`}>{p.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Livestream ───────────────────────────────────────────────────────────────
const AJ_EMBED = 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=0&mute=1'

function toEmbedUrl(raw) {
  const s = raw.trim()
  try {
    const u = new URL(s)
    if (u.hostname.includes('youtube') && u.pathname.startsWith('/embed/')) {
      u.searchParams.set('autoplay', '0')
      u.searchParams.set('mute', '1')
      return u.toString()
    }
    if (u.searchParams.has('v'))
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}?autoplay=0&mute=1`
    if (u.hostname === 'youtu.be')
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=0&mute=1`
    const parts = u.pathname.split('/').filter(Boolean)
    if (['live', 'v'].includes(parts[0]) && parts[1])
      return `https://www.youtube.com/embed/${parts[1]}?autoplay=0&mute=1`
    return s  // non-YouTube URL — use as-is
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(s))
      return `https://www.youtube.com/embed/${s}?autoplay=0&mute=1`
    return null
  }
}

function Livestream({ initialUrl = AJ_EMBED, onUrlChange }) {
  const [embedUrl, setEmbedUrl] = useState(initialUrl)
  const [input,    setInput]    = useState(initialUrl)
  const [error,    setError]    = useState(null)

  useEffect(() => { setEmbedUrl(initialUrl); setInput(initialUrl) }, [initialUrl])

  function handleSubmit(e) {
    e.preventDefault()
    const url = toEmbedUrl(input)
    if (url) { setEmbedUrl(url); setInput(url); setError(null); onUrlChange?.(url) }
    else setError('Invalid YouTube URL or video ID')
  }

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Livestream</span>
        <div className="widget-actions">
          <span className={`widget-badge${embedUrl ? '' : ' inactive'}`}>{embedUrl ? 'LIVE' : 'STANDBY'}</span>
        </div>
      </div>
      <form className="rss-url-bar" onSubmit={handleSubmit} style={{ flexShrink: 0 }}>
        <input
          className="rss-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Paste any YouTube URL or embed link…"
          spellCheck={false}
        />
        <button className="rss-go-btn" type="submit">GO</button>
      </form>
      {error && (
        <div className="feed-error" style={{ flexShrink: 0, height: 'auto', padding: '4px 12px' }}>
          {error}
        </div>
      )}
      <iframe
        key={embedUrl}
        src={embedUrl}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="Livestream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}

// ─── Weather (Open-Meteo, geocoded city) ─────────────────────────────────────
const GEO_URL = name =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&format=json`
const WX_URL  = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,relative_humidity_2m,surface_pressure` +
  `&wind_speed_unit=kmh`

function decodeWmo(code) {
  if (code === 0) return { label: 'Clear Sky',     icon: '☀️' }
  if (code <= 2)  return { label: 'Partly Cloudy', icon: '🌤' }
  if (code === 3) return { label: 'Overcast',      icon: '☁️' }
  if (code <= 48) return { label: 'Fog',           icon: '🌫' }
  if (code <= 55) return { label: 'Drizzle',       icon: '🌦' }
  if (code <= 65) return { label: 'Rain',          icon: '🌧' }
  if (code <= 77) return { label: 'Snow',          icon: '🌨' }
  if (code <= 82) return { label: 'Rain Showers',  icon: '🌧' }
  if (code <= 86) return { label: 'Snow Showers',  icon: '🌨' }
  if (code <= 99) return { label: 'Thunderstorm',  icon: '⛈' }
  return { label: 'Unknown', icon: '🌡' }
}

function windDir(deg) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]
}

function Weather({ initialCity = 'Berlin', onCityChange }) {
  const [city,      setCity]      = useState(initialCity)
  const [cityInput, setCityInput] = useState(initialCity)
  const [editing,   setEditing]   = useState(false)
  const [locName,   setLocName]   = useState(initialCity)
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { setCity(initialCity); setCityInput(initialCity) }, [initialCity])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true); setError(null)
      try {
        const geo = await fetch(GEO_URL(city)).then(r => r.json())
        const loc = geo.results?.[0]
        if (!loc) throw new Error(`"${city}" not found`)
        if (cancelled) return
        setLocName(loc.name)
        const wx = await fetch(WX_URL(loc.latitude, loc.longitude)).then(r => r.json())
        if (cancelled) return
        setData(wx.current)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Fetch failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    const id = setInterval(run, 10 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [city])

  function handleCitySubmit(e) {
    e.preventDefault()
    const c = cityInput.trim()
    if (c && c !== city) { setCity(c); onCityChange?.(c) }
    setEditing(false)
  }

  const wmo = data ? decodeWmo(data.weather_code) : null

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Weather · {locName}</span>
        <div className="widget-actions">
          <span className={`widget-badge${!error && !loading ? '' : ' inactive'}`}>
            {loading ? 'LOADING…' : error ? 'ERROR' : 'LIVE'}
          </span>
          <button className="widget-btn" onClick={() => setEditing(v => !v)} title="Change city">✎</button>
        </div>
      </div>
      {editing && (
        <form className="rss-url-bar" onSubmit={handleCitySubmit} style={{ flexShrink: 0 }}>
          <input
            className="rss-input"
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            placeholder="City name…"
            spellCheck={false}
            autoFocus
          />
          <button className="rss-go-btn" type="submit">GO</button>
        </form>
      )}
      <div className="widget-body">
        {error ? <div className="feed-error">{error}</div>
        : loading || !data ? <div className="feed-loading">Fetching weather…</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', gap: '6px', padding: '8px 12px' }}>
            <span style={{ fontSize: '22px' }}>{wmo.icon}</span>
            <span style={{ fontSize: '30px', fontWeight: 300, color: '#e6edf3', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{Math.round(data.temperature_2m)}°C</span>
            <span style={{ fontSize: '11px', color: '#6e8098', letterSpacing: '0.06em' }}>{wmo.label}</span>
            <div style={{ width: '100%', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                { label: 'Wind',     val: `${Math.round(data.wind_speed_10m)} km/h ${windDir(data.wind_direction_10m)}` },
                { label: 'Humidity', val: `${data.relative_humidity_2m}%` },
                { label: 'Pressure', val: `${Math.round(data.surface_pressure)} hPa` },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6e8098', padding: '2px 0', borderTop: '1px solid #1e2d3d' }}>
                  <span>{s.label}</span>
                  <span style={{ color: '#c9d1d9', fontWeight: 500 }}>{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Settings persistence ─────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  rssFeedUrl:     'https://feeds.bbci.co.uk/news/world/rss.xml',
  keywordFeedUrl: 'conflict',
  weatherCity:    'Berlin',
  livestreamUrl:  'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=0&mute=1',
}
const settingsKey = id => `vigil_ws${id.replace('ws-', '')}_settings`
function readSettings(wsId) {
  try {
    const raw = localStorage.getItem(settingsKey(wsId))
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  } catch { return { ...DEFAULT_SETTINGS } }
}

// ─── Default layout ───────────────────────────────────────────────────────────
const DEFAULT_LAYOUT = [
  { i: 'map',     x: 0, y: 0,  w: 8, h: 11 },
  { i: 'feed',    x: 8, y: 0,  w: 4, h: 11 },
  { i: 'rss',     x: 0, y: 11, w: 3, h: 8  },
  { i: 'prices',  x: 3, y: 11, w: 3, h: 8  },
  { i: 'stream',  x: 6, y: 11, w: 3, h: 8  },
  { i: 'weather', x: 9, y: 11, w: 3, h: 8  },
]

const wsKey = id => `vigil_workspace_${id.replace('ws-', '')}`

function readLayout(wsId) {
  try {
    const raw = localStorage.getItem(wsKey(wsId))
    return raw ? JSON.parse(raw) : DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [layout,     setLayout]     = useState(() => readLayout('ws-1'))
  const [settings,   setSettings]   = useState(() => readSettings('ws-1'))
  const [workspaces, setWorkspaces] = useState([
    { id: 'ws-1', name: 'Workspace 1' },
    { id: 'ws-2', name: 'Workspace 2' },
    { id: 'ws-3', name: 'Workspace 3' },
  ])
  const [activeWs, setActiveWs] = useState('ws-1')
  const [saved,    setSaved]    = useState(false)
  const saveTimer   = useRef(null)
  const activeWsRef = useRef('ws-1')
  const savedTimer  = useRef(null)

  function updateSetting(key, value) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(settingsKey(activeWsRef.current), JSON.stringify(next))
      return next
    })
  }

  // ── Layout save (debounced 1s) ─────────────────────────────────────────────
  function handleLayoutChange(newLayout) {
    setLayout(newLayout)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(newLayout))
      setSaved(true)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    }, 1000)
  }

  // ── Workspace switching ────────────────────────────────────────────────────
  function switchWorkspace(wsId) {
    if (wsId === activeWs) return
    // flush any pending save for the outgoing workspace immediately
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      localStorage.setItem(wsKey(activeWs), JSON.stringify(layout))
    }
    activeWsRef.current = wsId
    setActiveWs(wsId)
    setLayout(readLayout(wsId))
    setSettings(readSettings(wsId))
  }

  // ── Workspace rename (local only) ─────────────────────────────────────────
  function renameWorkspace(wsId, newName) {
    setWorkspaces(prev => prev.map(w => w.id === wsId ? { ...w, name: newName } : w))
  }

  return (
    <div className="app">
      <NavBar
        saved={saved}
        workspaces={workspaces}
        activeWs={activeWs}
        onSwitchWs={switchWorkspace}
        onRenameWs={renameWorkspace}
      />
      <div style={{ width: '100%', height: 'calc(100vh - 48px)', overflowY: 'auto' }}>
        <SizedGridLayout
          layout={layout}
          onLayoutChange={handleLayoutChange}
          cols={12}
          rowHeight={40}
          margin={[6, 6]}
          containerPadding={[0, 0]}
          draggableHandle=".widget-header"
          resizeHandles={['se', 's', 'e']}
          compactType="vertical"
          preventCollision={false}
          isResizable
          isDraggable
        >
          <div key="map"     style={{ height: '100%', overflow: 'hidden' }}><MapWidget /></div>
          <div key="feed"    style={{ height: '100%', overflow: 'hidden' }}><KeywordFeed initialUrl={settings.keywordFeedUrl} onUrlChange={url => updateSetting('keywordFeedUrl', url)} /></div>
          <div key="rss"     style={{ height: '100%', overflow: 'hidden' }}><RssFeed initialUrl={settings.rssFeedUrl} onUrlChange={url => updateSetting('rssFeedUrl', url)} /></div>
          <div key="prices"  style={{ height: '100%', overflow: 'hidden' }}><PriceTracker /></div>
          <div key="stream"  style={{ height: '100%', overflow: 'hidden' }}><Livestream initialUrl={settings.livestreamUrl} onUrlChange={url => updateSetting('livestreamUrl', url)} /></div>
          <div key="weather" style={{ height: '100%', overflow: 'hidden' }}><Weather initialCity={settings.weatherCity} onCityChange={city => updateSetting('weatherCity', city)} /></div>
        </SizedGridLayout>
      </div>
    </div>
  )
}

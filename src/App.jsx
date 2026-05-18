import { useState, useEffect, useCallback, useRef } from 'react'
import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
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
function NavBar() {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="logo-icon">V</div>
        <span className="logo-text">Vigil</span>
        <span className="logo-tag">OPS</span>
      </div>
      <div className="navbar-center">
        {['Dashboard', 'Feeds', 'Alerts', 'Config'].map(item => (
          <div key={item} className={`nav-item${item === 'Dashboard' ? ' active' : ''}`}>{item}</div>
        ))}
      </div>
      <div className="navbar-right">
        <div className="status-dot">LIVE</div>
        <UtcClock />
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

// ─── Map (MapLibre GL + MapTiler) ────────────────────────────────────────────
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? 'B0HrPBjlISKjRqSoCyc4'

const MAP_STYLES = {
  Terrain:   `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`,
  Dark:      `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
  Satellite: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
  Minimal:   `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_KEY}`,
}

const CONFLICT_MARKERS = [
  { coords: [31.0,  48.5], label: 'Ukraine', color: '#ff4d4f' },
  { coords: [34.46, 31.5], label: 'Gaza',    color: '#ff4d4f' },
  { coords: [32.5,  15.5], label: 'Sudan',   color: '#f5c518' },
  { coords: [96.15, 19.7], label: 'Myanmar', color: '#f5c518' },
  { coords: [44.2,  15.4], label: 'Yemen',   color: '#ff4d4f' },
]

function MapWidget() {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const markersRef   = useRef([])
  const [activeStyle, setActiveStyle] = useState('Terrain')

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLES.Terrain,
      center:    [15, 20],
      zoom:      2,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }),     'bottom-right')

    map.on('error', e => console.error('Map error:', e))

    map.on('load', () => {
      map.resize()
      markersRef.current = CONFLICT_MARKERS.map(({ coords, label, color }) => {
        const el = document.createElement('div')
        el.className = 'map-marker'
        el.style.setProperty('--mc', color)
        return new maplibregl.Marker({ element: el })
          .setLngLat(coords)
          .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false })
            .setHTML(`<span style="font-size:11px;font-weight:600;color:#e6edf3">${label}</span>`))
          .addTo(map)
      })
    })

    const resizeId = setTimeout(() => map.resize(), 500)

    mapRef.current = map
    return () => { clearTimeout(resizeId); map.remove(); mapRef.current = null }
  }, [])

  // Swap style without re-mounting
  useEffect(() => {
    if (mapRef.current) mapRef.current.setStyle(MAP_STYLES[activeStyle])
  }, [activeStyle])

  return (
    <div className="widget">
      <div className="widget-header">
        <span className="widget-title">Conflict Map</span>
        <div className="widget-actions">
          {Object.keys(MAP_STYLES).map(s => (
            <button
              key={s}
              className="widget-btn"
              style={{ color: s === activeStyle ? '#00c6ff' : undefined, fontSize: '10px', padding: '0 4px' }}
              onClick={() => setActiveStyle(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="widget-body">
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
          onMouseDown={e => e.stopPropagation()}
        />
      </div>
    </div>
  )
}

// ─── Keyword Feed (RSS via rss2json) ──────────────────────────────────────────
const DEFAULT_FEED_URL = 'https://feeds.bbci.co.uk/news/world/rss.xml'

function dotColor(title = '') {
  if (/war|attack|kill|bomb|shoot|explo|missil|airst/i.test(title)) return 'red'
  if (/crisis|sanction|tension|protest|riot|unrest/i.test(title))   return 'yellow'
  if (/deal|agree|peace|ceasefire|accord/i.test(title))             return 'green'
  return 'blue'
}

function feedRelTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1)    return 'now'
    if (diff < 60)   return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch { return '—' }
}

function KeywordFeed() {
  const [url,     setUrl]     = useState(DEFAULT_FEED_URL)
  const [input,   setInput]   = useState(DEFAULT_FEED_URL)
  const [feed,    setFeed]    = useState(null)
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async (targetUrl) => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(targetUrl)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.status !== 'ok') throw new Error(json.message || 'Feed error')
      setFeed(json.feed)
      setItems(json.items ?? [])
    } catch (e) {
      setError(e.message || 'Feed unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(url)
    const id = setInterval(() => load(url), 120_000)
    return () => clearInterval(id)
  }, [url, load])

  const badge = loading ? 'LOADING…' : error ? 'ERROR' : feed ? feed.title?.slice(0, 14) : 'RSS'

  return (
    <div className="widget">
      <WHeader title="Keyword Feed" badge={badge} badgeActive={!error && !loading} onRefresh={() => load(url)} />
      <div className="widget-body">
        <div className="rss-container">
          <form
            className="rss-url-bar"
            onSubmit={e => { e.preventDefault(); const t = input.trim(); if (t) setUrl(t) }}
          >
            <input
              className="rss-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="RSS URL…"
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
                  <div className={`feed-dot ${dotColor(item.title)}`} />
                  <span className="feed-text">
                    <span className="feed-source">{feed?.title || 'Reuters'}</span>
                    {item.title}
                  </span>
                  <span className="feed-time">{feedRelTime(item.pubDate)}</span>
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

function RssFeed() {
  const [url,     setUrl]     = useState(DEFAULT_RSS)
  const [input,   setInput]   = useState(DEFAULT_RSS)
  const [feed,    setFeed]    = useState(null)
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

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
            onSubmit={e => { e.preventDefault(); const t = input.trim(); if (t) setUrl(t) }}
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

// ─── Price Tracker (CoinGecko BTC/ETH/XAU + static oil) ──────────────────────
const CG_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,pax-gold' +
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
        { ticker: 'WTI/USD', value: '—', text: 'DELAYED', dir: '' },
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
    const id = setInterval(load, 30_000)
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

// ─── Livestream (Al Jazeera YouTube) ─────────────────────────────────────────
const AJ_VIDEO_ID = 'nGTNbhHjmUk'

function parseYouTubeId(raw) {
  try {
    const u = new URL(raw.trim())
    if (u.searchParams.has('v')) return u.searchParams.get('v')
    const parts = u.pathname.split('/').filter(Boolean)
    if (['live', 'embed', 'v'].includes(parts[0])) return parts[1]
    if (u.hostname === 'youtu.be') return parts[0]
  } catch { /* bare ID */ }
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw.trim())) return raw.trim()
  return null
}

function Livestream() {
  const [input,   setInput]   = useState(AJ_VIDEO_ID)
  const [videoId, setVideoId] = useState(AJ_VIDEO_ID)
  const [error,   setError]   = useState(null)

  function handleSubmit(e) {
    e.preventDefault()
    const id = parseYouTubeId(input)
    if (id) { setVideoId(id); setError(null) }
    else setError('Unrecognised YouTube URL or ID')
  }

  const src = `https://www.youtube.com/embed/${videoId}?autoplay=0`

  return (
    <div className="widget">
      <WHeader title="Livestream" badge={videoId ? 'LIVE' : 'STANDBY'} badgeActive={!!videoId} />
      <div className="widget-body">
        <div className="stream-container">
          <form className="stream-url-bar" onSubmit={handleSubmit}>
            <input
              className="rss-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="YouTube URL or video ID…"
              spellCheck={false}
            />
            <button className="rss-go-btn" type="submit">GO</button>
          </form>
          {error && (
            <div className="feed-error" style={{ height: 'auto', padding: '6px 12px' }}>{error}</div>
          )}
          <iframe
            className="stream-iframe"
            src={src}
            title="Livestream"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            frameBorder="0"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Weather (Open-Meteo Berlin) ──────────────────────────────────────────────
const OM_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=52.52&longitude=13.41' +
  '&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,relative_humidity_2m,surface_pressure' +
  '&wind_speed_unit=kmh'

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

function Weather() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch(OM_URL)
      const json = await res.json()
      setData(json.current)
      setError(null)
    } catch {
      setError('Open-Meteo unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10 * 60_000)
    return () => clearInterval(id)
  }, [load])

  const wmo = data ? decodeWmo(data.weather_code) : null

  return (
    <div className="widget">
      <WHeader
        title="Weather · Berlin"
        badge={loading ? 'LOADING…' : error ? 'ERROR' : 'LIVE'}
        badgeActive={!error && !loading}
        onRefresh={load}
      />
      <div className="widget-body">
        {error        ? <div className="feed-error">{error}</div>
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

// ─── Layout ───────────────────────────────────────────────────────────────────
const LAYOUT = [
  { i: 'map',     x: 0, y: 0,  w: 8, h: 11 },
  { i: 'feed',    x: 8, y: 0,  w: 4, h: 11 },
  { i: 'rss',     x: 0, y: 11, w: 3, h: 8  },
  { i: 'prices',  x: 3, y: 11, w: 3, h: 8  },
  { i: 'stream',  x: 6, y: 11, w: 3, h: 8  },
  { i: 'weather', x: 9, y: 11, w: 3, h: 8  },
]

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div className="app">
      <NavBar />
      <div style={{ width: '100%', height: 'calc(100vh - 48px)', overflowY: 'auto' }}>
        <SizedGridLayout
          layout={LAYOUT}
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
          <div key="feed"    style={{ height: '100%', overflow: 'hidden' }}><KeywordFeed /></div>
          <div key="rss"     style={{ height: '100%', overflow: 'hidden' }}><RssFeed /></div>
          <div key="prices"  style={{ height: '100%', overflow: 'hidden' }}><PriceTracker /></div>
          <div key="stream"  style={{ height: '100%', overflow: 'hidden' }}><Livestream /></div>
          <div key="weather" style={{ height: '100%', overflow: 'hidden' }}><Weather /></div>
        </SizedGridLayout>
      </div>
    </div>
  )
}

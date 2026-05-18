import { useState, useEffect, useCallback } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './App.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

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

// ─── Map (Windy iframe) ───────────────────────────────────────────────────────
const WINDY_URL =
  'https://embed.windy.com/embed2.html' +
  '?lat=30&lon=10&zoom=3&level=surface&overlay=wind' +
  '&menu=&message=&marker=&forecast=12&calendar=now' +
  '&pressure=&type=map&location=coordinates' +
  '&detail=&detailLat=30&detailLon=10' +
  '&metricWind=default&metricTemp=default&radarRange=-1'

function MapWidget() {
  return (
    <div className="widget">
      <WHeader title="Live Weather Map" badge="LIVE" badgeActive />
      <div className="widget-body">
        <iframe
          src={WINDY_URL}
          width="100%"
          height="100%"
          frameBorder="0"
          style={{ display: 'block', border: 'none' }}
          onMouseDown={e => e.stopPropagation()}
          title="Windy Map"
        />
      </div>
    </div>
  )
}

// ─── Keyword Feed (GDELT via allorigins) ──────────────────────────────────────
const DEFAULT_QUERY = 'conflict OR war OR crisis OR attack'

function gdeltUrl(q) {
  return (
    'https://api.gdeltproject.org/api/v2/doc/doc' +
    `?query=${encodeURIComponent(q + ' sourcelang:english')}` +
    '&mode=artlist&maxrecords=20&format=json'
  )
}

function dotColor(title = '') {
  if (/war|attack|kill|bomb|shoot|explo|missil|airst/i.test(title)) return 'red'
  if (/crisis|sanction|tension|protest|riot|unrest/i.test(title))   return 'yellow'
  if (/deal|agree|peace|ceasefire|accord/i.test(title))             return 'green'
  return 'blue'
}

function gdeltRelTime(seendate) {
  try {
    const s = seendate.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z'
    )
    const diff = Math.floor((Date.now() - new Date(s).getTime()) / 60_000)
    if (diff < 1)  return 'now'
    if (diff < 60) return `${diff}m`
    return `${Math.floor(diff / 60)}h`
  } catch { return '—' }
}

function KeywordFeed() {
  const [query,    setQuery]    = useState(DEFAULT_QUERY)
  const [input,    setInput]    = useState(DEFAULT_QUERY)
  const [articles, setArticles] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const load = useCallback(async (q) => {
    setLoading(true); setError(null)
    try {
      const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(gdeltUrl(q))}`
      const res   = await fetch(proxy)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { contents } = await res.json()
      const json = JSON.parse(contents)
      setArticles(json.articles ?? [])
    } catch {
      setError('GDELT unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(query)
    const id = setInterval(() => load(query), 60_000)
    return () => clearInterval(id)
  }, [query, load])

  const badge = loading ? 'LOADING…' : error ? 'ERROR' : `${articles.length} ENG`

  return (
    <div className="widget">
      <WHeader title="Keyword Feed" badge={badge} badgeActive={!error && !loading} onRefresh={() => load(query)} />
      <div className="widget-body">
        <div className="rss-container">
          <form
            className="rss-url-bar"
            onSubmit={e => { e.preventDefault(); const q = input.trim(); if (q) setQuery(q) }}
          >
            <input
              className="rss-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Search keywords…"
              spellCheck={false}
            />
            <button className="rss-go-btn" type="submit">GO</button>
          </form>
          {error   ? <div className="feed-error">{error}</div>
         : loading ? <div className="feed-loading">Fetching GDELT…</div>
         : (
            <div className="feed-list">
              {articles.map((a, i) => (
                <a
                  key={i}
                  className="feed-item feed-item-link"
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className={`feed-dot ${dotColor(a.title)}`} />
                  <span className="feed-text">
                    <span className="feed-source">{a.domain}</span>
                    {a.title}
                  </span>
                  <span className="feed-time">{gdeltRelTime(a.seendate)}</span>
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
const AJ_VIDEO_ID  = 'h3MuIUNCCLI'
const AJ_WATCH_URL = `https://www.youtube.com/watch?v=${AJ_VIDEO_ID}`

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
  const [input,   setInput]   = useState(AJ_WATCH_URL)
  const [videoId, setVideoId] = useState(AJ_VIDEO_ID)
  const [error,   setError]   = useState(null)

  function handleSubmit(e) {
    e.preventDefault()
    const id = parseYouTubeId(input)
    if (id) { setVideoId(id); setError(null) }
    else setError('Unrecognised YouTube URL or ID')
  }

  const src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1`

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
          <div className="weather-body">
            <div className="weather-main">
              <span className="weather-wmo-icon">{wmo.icon}</span>
              <span className="weather-temp">{Math.round(data.temperature_2m)}°C</span>
              <span className="weather-desc">{wmo.label}</span>
            </div>
            <div className="weather-stats">
              {[
                { label: 'Wind',     val: `${Math.round(data.wind_speed_10m)} km/h ${windDir(data.wind_direction_10m)}` },
                { label: 'Humidity', val: `${data.relative_humidity_2m}%` },
                { label: 'Pressure', val: `${Math.round(data.surface_pressure)} hPa` },
              ].map(s => (
                <div key={s.label} className="weather-stat">
                  <span>{s.label}</span>
                  <span className="weather-stat-val">{s.val}</span>
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
const LAYOUTS = {
  lg: [
    { i: 'map',     x: 0, y: 0,  w: 8, h: 13 },
    { i: 'feed',    x: 8, y: 0,  w: 4, h: 13 },
    { i: 'rss',     x: 0, y: 13, w: 3, h: 9  },
    { i: 'prices',  x: 3, y: 13, w: 3, h: 9  },
    { i: 'stream',  x: 6, y: 13, w: 3, h: 9  },
    { i: 'weather', x: 9, y: 13, w: 3, h: 9  },
  ],
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div className="app">
      <NavBar />
      <div className="grid-wrapper" style={{ height: 'calc(100vh - 48px)', overflowY: 'auto' }}>
        <ResponsiveGridLayout
          layouts={LAYOUTS}
          breakpoints={{ lg: 1200, md: 996, sm: 768 }}
          cols={{ lg: 12, md: 12, sm: 6 }}
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
          <div key="map"     style={{ height: '100%' }}><MapWidget /></div>
          <div key="feed"    style={{ height: '100%' }}><KeywordFeed /></div>
          <div key="rss"     style={{ height: '100%' }}><RssFeed /></div>
          <div key="prices"  style={{ height: '100%' }}><PriceTracker /></div>
          <div key="stream"  style={{ height: '100%' }}><Livestream /></div>
          <div key="weather" style={{ height: '100%' }}><Weather /></div>
        </ResponsiveGridLayout>
      </div>
    </div>
  )
}

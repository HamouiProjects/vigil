import { useState, useEffect, useCallback } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './App.css'

// ── UTC Clock ──
function UtcClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const hh = String(now.getUTCHours()).padStart(2, '0')
      const mm = String(now.getUTCMinutes()).padStart(2, '0')
      const ss = String(now.getUTCSeconds()).padStart(2, '0')
      setTime(`${hh}:${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="clock">
      <span className="clock-label">UTC</span>
      {time}
    </div>
  )
}

// ── NavBar ──
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
          <div key={item} className={`nav-item${item === 'Dashboard' ? ' active' : ''}`}>
            {item}
          </div>
        ))}
      </div>
      <div className="navbar-right">
        <div className="status-dot">LIVE</div>
        <UtcClock />
      </div>
    </nav>
  )
}

// ── Widget shell ──
function Widget({ title, icon, badge, badgeActive = true, children }) {
  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-title-group">
          <span className="widget-icon">{icon}</span>
          <span className="widget-title">{title}</span>
          {badge && (
            <span className={`widget-badge${badgeActive ? '' : ' inactive'}`}>
              {badge}
            </span>
          )}
        </div>
        <div className="widget-actions">
          <button className="widget-btn" title="Refresh">↻</button>
          <button className="widget-btn" title="Expand">⤢</button>
        </div>
      </div>
      <div className="widget-body">{children}</div>
    </div>
  )
}

// ── Map widget ──
const MAP_DOTS = [
  { top: '30%', left: '22%' },
  { top: '55%', left: '48%' },
  { top: '20%', left: '65%' },
  { top: '70%', left: '72%' },
  { top: '45%', left: '15%' },
]

function MapWidget() {
  return (
    <Widget title="Global Map" icon="🌐" badge="LIVE" badgeActive>
      <div className="map-grid">
        {MAP_DOTS.map((d, i) => (
          <div key={i} className="map-dot" style={{ top: d.top, left: d.left }} />
        ))}
      </div>
    </Widget>
  )
}

// ── Keyword Feed ──
const KEYWORDS = [
  { text: 'BREAKING: Market volatility spike detected across APAC indices', color: 'yellow', time: '00:12' },
  { text: 'Geopolitical tension flagged — Eastern European border activity', color: 'red', time: '00:09' },
  { text: 'Keyword "cyberattack" trending +340% in last 15 min', color: 'red', time: '00:07' },
  { text: 'Central bank governor statement pending — ECB', color: 'blue', time: '00:05' },
  { text: 'Supply chain disruption: Red Sea container rerouting', color: 'yellow', time: '00:03' },
  { text: 'Energy grid anomaly detected — Northern EU sector 7', color: 'blue', time: '00:01' },
  { text: 'Diplomatic summit concluded with no agreement', color: 'green', time: '23:58' },
]

function KeywordFeed() {
  return (
    <Widget title="Keyword Feed" icon="📡" badge="SCANNING">
      <div className="feed-list">
        {KEYWORDS.map((k, i) => (
          <div key={i} className="feed-item">
            <div className={`feed-dot ${k.color}`} />
            <span className="feed-text">{k.text}</span>
            <span className="feed-time">{k.time}</span>
          </div>
        ))}
      </div>
    </Widget>
  )
}

// ── RSS Feed ──
const RSS_ITEMS = [
  { text: 'Reuters: Inflation data surprises to the upside in Q2 report', time: '2m' },
  { text: 'AP News: UN Security Council emergency session called', time: '5m' },
  { text: 'Bloomberg: Fed signals possible rate adjustment in September', time: '11m' },
  { text: 'BBC: Major infrastructure outage affecting Eastern seaboard', time: '18m' },
  { text: 'FT: Tech sector leads decline amid regulatory concerns', time: '22m' },
  { text: 'Al Jazeera: Ceasefire negotiations enter critical phase', time: '31m' },
]

function RssFeed() {
  return (
    <Widget title="RSS Feed" icon="📰" badge="6 SOURCES" badgeActive={false}>
      <div className="feed-list">
        {RSS_ITEMS.map((r, i) => (
          <div key={i} className="feed-item">
            <div className="feed-dot blue" />
            <span className="feed-text">{r.text}</span>
            <span className="feed-time">{r.time} ago</span>
          </div>
        ))}
      </div>
    </Widget>
  )
}

// ── Price Tracker ──
const PRICES = [
  { ticker: 'BTC/USD', value: '67,420', change: '+1.24%', dir: 'up' },
  { ticker: 'EUR/USD', value: '1.0832', change: '-0.08%', dir: 'down' },
  { ticker: 'XAU/USD', value: '2,341', change: '+0.61%', dir: 'up' },
  { ticker: 'SPX',     value: '5,218', change: '-0.33%', dir: 'down' },
  { ticker: 'OIL/WTI', value: '79.14', change: '+0.92%', dir: 'up' },
  { ticker: 'DXY',     value: '104.6', change: '-0.14%', dir: 'down' },
]

function PriceTracker() {
  return (
    <Widget title="Price Tracker" icon="📈" badge="LIVE">
      <div className="price-grid">
        {PRICES.map((p, i) => (
          <div key={i} className="price-cell">
            <span className="price-ticker">{p.ticker}</span>
            <span className="price-value">{p.value}</span>
            <span className={`price-change ${p.dir}`}>
              {p.change}
            </span>
          </div>
        ))}
      </div>
    </Widget>
  )
}

// ── Livestream ──
function Livestream() {
  return (
    <Widget title="Livestream" icon="📹" badge="OFFLINE" badgeActive={false}>
      <div className="stream-body">
        <div className="stream-icon">📹</div>
        <div className="stream-label">No stream configured</div>
        <div className="stream-live-badge">STANDBY</div>
      </div>
    </Widget>
  )
}

// ── Weather ──
function Weather() {
  return (
    <Widget title="Weather" icon="🌦" badge="AUTO" badgeActive={false}>
      <div className="weather-body">
        <div className="weather-main">
          <span className="weather-temp">14°</span>
          <span className="weather-desc">Partly Cloudy</span>
        </div>
        <div className="weather-stats">
          {[
            { label: 'Wind', val: '18 km/h NW' },
            { label: 'Humidity', val: '62%' },
            { label: 'Pressure', val: '1013 hPa' },
            { label: 'Visibility', val: '12 km' },
          ].map(s => (
            <div key={s.label} className="weather-stat">
              <span>{s.label}</span>
              <span className="weather-stat-val">{s.val}</span>
            </div>
          ))}
        </div>
      </div>
    </Widget>
  )
}

// ── Layout config ──
const DEFAULT_LAYOUT = [
  { i: 'map',      x: 0, y: 0, w: 8, h: 10, minW: 4, minH: 6 },
  { i: 'keywords', x: 8, y: 0, w: 4, h: 10, minW: 3, minH: 5 },
  { i: 'rss',      x: 0, y: 10, w: 4, h: 9,  minW: 3, minH: 5 },
  { i: 'prices',   x: 4, y: 10, w: 4, h: 9,  minW: 3, minH: 5 },
  { i: 'stream',   x: 8, y: 10, w: 2, h: 9,  minW: 2, minH: 4 },
  { i: 'weather',  x: 10, y: 10, w: 2, h: 9, minW: 2, minH: 4 },
]

const WIDGETS = {
  map:      <MapWidget />,
  keywords: <KeywordFeed />,
  rss:      <RssFeed />,
  prices:   <PriceTracker />,
  stream:   <Livestream />,
  weather:  <Weather />,
}

// ── App ──
export default function App() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT)
  const [dims, setDims] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => setDims({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const gridWidth = dims.width - 24
  const rowH = Math.floor((dims.height - 48 - 24) / 20)

  return (
    <div className="app">
      <NavBar />
      <div className="grid-wrapper">
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={rowH}
          width={gridWidth}
          margin={[6, 6]}
          containerPadding={[0, 0]}
          onLayoutChange={setLayout}
          draggableHandle=".widget-header"
          resizeHandles={['s', 'e', 'se', 'n', 'w', 'nw', 'ne', 'sw']}
          compactType={null}
          preventCollision={false}
        >
          {layout.map(item => (
            <div key={item.i}>
              {WIDGETS[item.i]}
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  )
}

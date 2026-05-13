import { useState, useEffect } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import MapWidget    from './widgets/MapWidget'
import KeywordFeed  from './widgets/KeywordFeed'
import PriceTracker from './widgets/PriceTracker'
import Weather      from './widgets/Weather'
import RssFeed      from './widgets/RssFeed'
import Livestream   from './widgets/Livestream'
import './App.css'

// ── UTC Clock ──
function UtcClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const n  = new Date()
      const hh = String(n.getUTCHours()).padStart(2, '0')
      const mm = String(n.getUTCMinutes()).padStart(2, '0')
      const ss = String(n.getUTCSeconds()).padStart(2, '0')
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
        <div className="logo-icon" style={{ background: '#000000', color: '#fff' }}>V</div>
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

const DEFAULT_LAYOUT = [
  { i: 'map',      x: 0, y: 0,  w: 8, h: 14, minW: 4, minH: 4 },
  { i: 'keywords', x: 8, y: 0,  w: 4, h: 14, minW: 3, minH: 4 },
  { i: 'rss',      x: 0, y: 14, w: 3, h: 10, minW: 2, minH: 4 },
  { i: 'prices',   x: 3, y: 14, w: 3, h: 10, minW: 2, minH: 4 },
  { i: 'stream',   x: 6, y: 14, w: 3, h: 10, minW: 2, minH: 4 },
  { i: 'weather',  x: 9, y: 14, w: 3, h: 10, minW: 2, minH: 4 },
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
  const [width,  setWidth]  = useState(window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div className="app">
      <NavBar />
      <div className="grid-wrapper">
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={35}
          width={width - 24}
          margin={[6, 6]}
          containerPadding={[0, 0]}
          onLayoutChange={setLayout}
          draggableHandle=".widget-header"
          resizeHandles={['se', 's', 'e', 'sw', 'w', 'ne', 'n', 'nw']}
          compactType="vertical"
          preventCollision={false}
          isResizable
          isDraggable
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

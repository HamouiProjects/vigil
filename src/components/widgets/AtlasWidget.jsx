import { useState, useEffect, useRef } from 'react'
import WHeader from '../shared/WHeader'
import AtlasGlobe from './AtlasGlobe'
const LAYER_DEFS = [
  { key: 'conflict',    label: 'Conflict',    color: '#FF3333' },
  { key: 'wildfires',   label: 'Wildfires',   color: '#FFD700' },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF8C42' },
  { key: 'storms',      label: 'Storms',      color: '#38BDF8' },
  { key: 'piracy',      label: 'Piracy',      color: '#1E6BFF' },
]

const DEFAULT_GLOBE_LAYERS = { conflict: true, wildfires: false, earthquakes: false, storms: false, piracy: false }

const IFRAME_URLS = {
  conflict: 'https://liveuamap.com/',
  marine:   'https://www.shipfinder.com/?mmsi=&imo=',
  flights:  'https://globe.adsbexchange.com/?lat=20&lon=0&zoom=3',
  cyber:    'https://threatmap.checkpoint.com/',
}

function migrateMapMode(saved) {
  if (!saved) return 'conflict'
  if (saved.mapMode === 'iframe') {
    const src = saved.iframeSrc ?? ''
    if (src.includes('adsbexchange')) return 'flights'
    if (src.includes('checkpoint'))   return 'cyber'
    if (src.includes('liveuamap'))    return 'conflict'
    return 'leaflet'
  }
  const valid = ['leaflet', 'conflict', 'marine', 'flights', 'cyber']
  return valid.includes(saved.mapMode) ? saved.mapMode : 'leaflet'
}


const ATLAS_STATE_KEY = id => `vigil_atlas_state_${id}`

function readAtlasState(id) {
  try { return JSON.parse(localStorage.getItem(ATLAS_STATE_KEY(id)) || 'null') } catch { return null }
}

export default function AtlasWidget({ widgetId = 'atlas', onClose, onFullscreen: _onFullscreen, isFullscreen: _isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const saved = readAtlasState(widgetId)

  const initialMode = migrateMapMode(saved)

  const [showNatural,  setShowNatural]  = useState(saved?.showNatural ?? true)
  const [showPiracy,   setShowPiracy]   = useState(saved?.showPiracy  ?? true)
  const [mapMode,      setMapMode]      = useState(initialMode)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dataLoading,  setDataLoading]  = useState(false)
  const [isLive,       setIsLive]       = useState(true)
  const [barsCollapsed, setBarsCollapsed] = useState(false)
  const [layers, setLayers] = useState(() => {
    try {
      const ls = JSON.parse(localStorage.getItem('vigil_world_layers') || 'null')
      return ls || DEFAULT_GLOBE_LAYERS
    } catch { return DEFAULT_GLOBE_LAYERS }
  })

  const widgetRef  = useRef(null)
  const mapModeRef = useRef(mapMode)
  mapModeRef.current = mapMode

  const activeTab  = mapMode
  const isLeaflet  = mapMode === 'leaflet'
  const isIframe   = !isLeaflet

  const anyPaused = !isLive || workspacePaused
  const getSrc = (tabKey) => activeTab === tabKey && !anyPaused ? IFRAME_URLS[tabKey] : 'about:blank'

  function saveState(patch) {
    try {
      const cur = JSON.parse(localStorage.getItem(ATLAS_STATE_KEY(widgetId)) || '{}')
      localStorage.setItem(ATLAS_STATE_KEY(widgetId), JSON.stringify({ ...cur, ...patch }))
    } catch {}
  }

  useEffect(() => {
    saveState({ showNatural, showPiracy, mapMode })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNatural, showPiracy, mapMode])

  useEffect(() => {
    localStorage.setItem('vigil_world_layers', JSON.stringify(layers))
  }, [layers])

  useEffect(() => {
    if (!widgetRef.current) return
    let el = widgetRef.current.parentElement
    while (el && !el.classList.contains('react-grid-item')) {
      el = el.parentElement
    }
    if (!el) return
    if (isFullscreen) {
      el.classList.add('atlas-grid-fullscreen')
    } else {
      el.classList.remove('atlas-grid-fullscreen')
    }
    return () => el.classList.remove('atlas-grid-fullscreen')
  }, [isFullscreen])

  function switchTab(mode) {
    setMapMode(mode)
  }

  const layerBarStyle = { overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }

  return (
    <div className="widget" ref={widgetRef} data-collapsed={collapsed || undefined}>
      <WHeader title="ATLAS" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={() => setIsFullscreen(v => !v)} isFullscreen={isFullscreen} onClose={onClose} />

      {/* Primary layer / tab bar — hidden when bars collapsed */}
      {!barsCollapsed && (
        <div className="cmap-layer-bar" style={layerBarStyle} onPointerDownCapture={e => e.stopPropagation()}>
          <button className={`cmap-layer-btn${isLeaflet ? ' active' : ''}`}
            onClick={() => setMapMode('leaflet')}>
            WORLD<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Country alerts are curated from open-source conflict tracking. Red = ongoing conflicts. Amber = elevated tension zones. Cyan = countries you are watching in News Search. Updated regularly.</span></span>
          </button>
          <button className={`cmap-layer-btn${mapMode === 'conflict' ? ' active' : ''}`}
            onClick={() => switchTab('conflict')}>
            CONFLICT<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live conflict tracking · Source: Liveuamap</span></span>
          </button>
          <button className={`cmap-layer-btn${mapMode === 'marine' ? ' active' : ''}`}
            onClick={() => switchTab('marine')}>
            MARINE<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live vessel tracking · Source: ShipFinder</span></span>
          </button>
          <button className={`cmap-layer-btn${mapMode === 'flights' ? ' active' : ''}`}
            onClick={() => switchTab('flights')}>
            FLIGHTS<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live air traffic · Source: ADS-B Exchange</span></span>
          </button>
          <button className={`cmap-layer-btn${mapMode === 'cyber' ? ' active' : ''}`}
            onClick={() => switchTab('cyber')}>
            CYBER<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live cyber attacks · Source: Checkpoint</span></span>
          </button>
          <button
            onClick={() => setBarsCollapsed(true)}
            title="Collapse"
            style={{ marginLeft: 'auto', width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0 }}
          >▾</button>
        </div>
      )}

      {/* Globe layer chip bar — only on WORLD tab, only when not collapsed */}
      {mapMode === 'leaflet' && !barsCollapsed && (
        <div
          style={{ display: 'flex', gap: 6, padding: '6px 12px', alignItems: 'center', background: 'var(--widget-bg, #0d1117)', borderBottom: '1px solid var(--border, #1e2329)', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', flexShrink: 0 }}
          onPointerDownCapture={e => e.stopPropagation()}
        >
          {LAYER_DEFS.map(({ key, label, color }) => {
            const on = layers[key]
            return (
              <button
                key={key}
                onClick={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', border: `1px solid ${on ? color : 'rgba(255,255,255,0.15)'}`, borderRadius: 2, background: 'transparent', color: on ? color : 'var(--text-muted, #484f58)', fontFamily: 'var(--font-mono, JetBrains Mono)', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer', lineHeight: 1, letterSpacing: '0.5px', transition: 'color 0.15s, border-color 0.15s', flexShrink: 0 }}
              >
                <span style={{ fontSize: 9 }}>{on ? '●' : '○'}</span>
                {label}
              </button>
            )
          })}
        </div>
      )}

      {dataLoading && !barsCollapsed && (
        <div className="atlas-loading-bar">
          <span style={{ fontSize: '8px', color: '#2a3a4a', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>LOADING DATA LAYERS</span>
          <div className="skel-line" />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }}>

        {/* Floating expand button — only shown when bars are collapsed */}
        {barsCollapsed && (
          <button
            onClick={() => setBarsCollapsed(false)}
            title="Expand"
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0 }}
          >▴</button>
        )}

        <div style={{ display: activeTab === 'leaflet' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <AtlasGlobe workspacePaused={workspacePaused} layers={layers} />
        </div>

        <div style={{ display: activeTab === 'conflict' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <iframe
            src={getSrc('conflict')}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="CONFLICT — Liveuamap"
            allowFullScreen
          />
        </div>
        <div style={{ display: activeTab === 'marine' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <iframe
            src={getSrc('marine')}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="MARINE — MarineTraffic"
            allowFullScreen
          />
        </div>
        <div style={{ display: activeTab === 'flights' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <iframe
            src={getSrc('flights')}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="FLIGHTS — ADS-B Exchange"
            allowFullScreen
          />
        </div>
        <div style={{ display: activeTab === 'cyber' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <iframe
            src={getSrc('cyber')}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="CYBER — Checkpoint"
            allowFullScreen
          />
        </div>

        {anyPaused && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(10,12,16,0.93)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-mono)',
            pointerEvents: 'none',
          }}>
            <span style={{ color: 'var(--amber)', fontSize: 22 }}>⏸</span>
            <span style={{ color: 'var(--amber)', fontSize: 11, letterSpacing: '0.12em' }}>PAUSED</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>Live feed disabled</span>
          </div>
        )}
      </div>
    </div>
  )
}

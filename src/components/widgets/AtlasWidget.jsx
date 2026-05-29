import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import WHeader from '../shared/WHeader'
import AtlasGlobe from './AtlasGlobe'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CONFLICTS, WILDFIRES_STATIC, PIRACY_ZONES } from '../../constants/atlasData'
import {
  conflictIcon, wildfireIcon, stormIcon,
  mapPopupHtml, fireMarkerEvents,
  quakeSize, quakeTimeAgo,
  fetchNOAAStorms, fetchUSGS,
} from '../../utils/atlasHelpers'
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

const AtlasMap = forwardRef(function AtlasMap({ showConflicts, showNatural, showPiracy, onLoadingChange, initialCenter = [20, 0], initialZoom = 2, onMove }, ref) {
  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const onMoveRef     = useRef(onMove)
  onMoveRef.current   = onMove
  const initViewRef   = useRef({ center: initialCenter, zoom: initialZoom })
  const layerConflict = useRef(null)
  const layerQuake    = useRef(null)
  const layerStorm    = useRef(null)
  const layerWildfire = useRef(null)
  const layerPiracy   = useRef(null)
  const [loading,   setLoading]   = useState(false)
  const [quakeLive, setQuakeLive] = useState(false)

  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    const sync = (lr, show) => { if (lr.current) { if (show) lr.current.addTo(m); else lr.current.remove() } }
    sync(layerConflict, showConflicts)
    sync(layerQuake,    showNatural)
    sync(layerStorm,    showNatural)
    sync(layerWildfire, showNatural)
    sync(layerPiracy,   showPiracy)
  }, [showConflicts, showNatural, showPiracy])

  const refresh = useCallback(async () => {
    if (!mapRef.current) return
    setLoading(true); onLoadingChange?.(true)

    try {
      const quakes = await fetchUSGS()
      layerQuake.current?.clearLayers()
      quakes.forEach(q => {
        const cm = L.circleMarker([q.lat, q.lng], {
          radius: quakeSize(q.mag) / 2, fillColor: '#9b59b6', color: '#7d3c98',
          weight: 1, opacity: 0.9, fillOpacity: 0.75,
        })
        cm.bindPopup(mapPopupHtml(`M${q.mag.toFixed(1)} — ${q.place}`, quakeTimeAgo(q.time)),
          { className: 'cmap-popup-wrap', maxWidth: 240, minWidth: 180 })
        cm.on('click', () => fireMarkerEvents(q.place, q.place, '', q.lat, q.lng))
        layerQuake.current?.addLayer(cm)
      })
      setQuakeLive(true)
    } catch { setQuakeLive(false) }

    try {
      const storms = await fetchNOAAStorms()
      layerStorm.current?.clearLayers()
      storms.forEach(s => {
        const mk = L.marker([s.lat, s.lng], { icon: stormIcon(s.cls) })
        mk.bindPopup(mapPopupHtml(s.name, `${s.cls} · ${s.wind} kt`),
          { className: 'cmap-popup-wrap', maxWidth: 220, minWidth: 160 })
        mk.on('click', () => fireMarkerEvents(`${s.name} storm`, s.name, s.country, s.lat, s.lng))
        layerStorm.current?.addLayer(mk)
      })
    } catch { /* no active storms or CORS */ }

    setLoading(false); onLoadingChange?.(false)
  }, [onLoadingChange])

  useImperativeHandle(ref, () => ({
    refresh,
    invalidateSize: () => { mapRef.current?.invalidateSize() },
    setView: (center, zoom) => { mapRef.current?.setView(center, zoom) },
  }), [refresh])

  const showRef = useRef({ showConflicts, showNatural, showPiracy })
  showRef.current = { showConflicts, showNatural, showPiracy }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: initViewRef.current.center, zoom: initViewRef.current.zoom, zoomControl: true })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map)

    const sv = showRef.current
    const mkLayer = (show) => show ? L.layerGroup().addTo(map) : L.layerGroup()
    layerConflict.current  = mkLayer(sv.showConflicts)
    layerQuake.current     = mkLayer(sv.showNatural)
    layerStorm.current     = mkLayer(sv.showNatural)
    layerWildfire.current  = mkLayer(sv.showNatural)
    layerPiracy.current    = mkLayer(sv.showPiracy)
    mapRef.current = map

    CONFLICTS.forEach(evt => {
      const mk = L.marker([evt.lat, evt.lng], { icon: conflictIcon(evt.category) })
      mk.bindPopup(mapPopupHtml(
        evt.name,
        `${evt.typeStr} · <span class="cmap-status-${evt.status}">${evt.status}</span>`
      ), { className: 'cmap-popup-wrap', maxWidth: 220, minWidth: 170 })
      mk.on('click', () => fireMarkerEvents(
        `${evt.name} ${evt.country}`.trim(), evt.name, evt.country, evt.lat, evt.lng
      ))
      layerConflict.current.addLayer(mk)
    })

    WILDFIRES_STATIC.forEach(wf => {
      const mk = L.marker([wf.lat, wf.lng], { icon: wildfireIcon() })
      mk.bindPopup(mapPopupHtml(
        wf.name,
        'Fire risk zone <span style="color:#6e8098;font-size:9px">(reference)</span>'
      ), { className: 'cmap-popup-wrap', maxWidth: 220, minWidth: 170 })
      mk.on('click', () => fireMarkerEvents(
        `${wf.name} wildfire`, wf.name, wf.country, wf.lat, wf.lng
      ))
      layerWildfire.current.addLayer(mk)
    })

    PIRACY_ZONES.forEach(zone => {
      const rect = L.rectangle(zone.bounds, {
        color: '#e8294a', weight: 1, fillColor: '#e8294a', fillOpacity: 0.1, dashArray: '4 3',
      })
      rect.bindTooltip(zone.name, { className: 'cmap-tooltip', sticky: false })
      rect.on('click', () => {
        window.dispatchEvent(new CustomEvent('vigil:search',   { detail: { keyword: `${zone.name} piracy` } }))
        window.dispatchEvent(new CustomEvent('vigil:location', { detail: { name: zone.name, lat: 0, lon: 0, country: zone.name } }))
        window.dispatchEvent(new CustomEvent('vigil:region',   { detail: { country: zone.name } }))
      })
      layerPiracy.current.addLayer(rect)
    })

    map.on('moveend', () => {
      const c = map.getCenter()
      onMoveRef.current?.({ center: [c.lat, c.lng], zoom: map.getZoom() })
    })

    refresh()
    return () => { map.remove(); mapRef.current = null }
  }, [refresh])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0e1a' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {loading && <div className="cmap-overlay">Fetching live data…</div>}
      {!loading && quakeLive && <div className="cmap-badge cmap-badge-live">● USGS LIVE</div>}
    </div>
  )
})


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

  const atlasMapRef    = useRef(null)
  const widgetRef      = useRef(null)
  const currentViewRef = useRef({ center: saved?.center ?? [20, 0], zoom: saved?.zoom ?? 2 })
  const mapModeRef     = useRef(mapMode)
  mapModeRef.current   = mapMode

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

  useEffect(() => {
    const t = setTimeout(() => {
      atlasMapRef.current?.invalidateSize()
      window.dispatchEvent(new Event('resize'))
    }, 200)
    return () => clearTimeout(t)
  }, [isFullscreen])

  useEffect(() => {
    const t = setTimeout(() => {
      if (mapModeRef.current === 'leaflet') atlasMapRef.current?.invalidateSize()
    }, 200)
    return () => clearTimeout(t)
  }, [mapMode])

  function switchTab(mode) {
    setMapMode(mode)
  }

  const layerBarStyle = { overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }

  return (
    <div className="widget" ref={widgetRef} data-collapsed={collapsed || undefined}>
      <WHeader title="ATLAS" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={() => setIsFullscreen(v => !v)} isFullscreen={isFullscreen} onClose={onClose}>
        <button className="widget-btn" onClick={() => atlasMapRef.current?.refresh()} title="Refresh">↻</button>
      </WHeader>

      {/* Primary layer / tab bar */}
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
      </div>

      {dataLoading && (
        <div className="atlas-loading-bar">
          <span style={{ fontSize: '8px', color: '#2a3a4a', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>LOADING DATA LAYERS</span>
          <div className="skel-line" />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: activeTab === 'leaflet' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <AtlasGlobe workspacePaused={workspacePaused} />
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

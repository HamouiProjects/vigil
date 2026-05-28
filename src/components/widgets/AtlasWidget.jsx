import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import WHeader from '../shared/WHeader'
import AtlasGlobe from './AtlasGlobe'
import Globe from 'globe.gl'
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
  const valid = ['leaflet', 'globe', 'conflict', 'marine', 'flights', 'cyber']
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

const CONFLICT_TO_GEO = { 'DRC': 'Dem. Rep. Congo' }

function countryFlag(name) {
  const f = {
    'Ukraine':'🇺🇦','Palestine':'🇵🇸','Israel':'🇮🇱','Sudan':'🇸🇩','Syria':'🇸🇾',
    'Iraq':'🇮🇶','Yemen':'🇾🇪','Afghanistan':'🇦🇫','Myanmar':'🇲🇲','Ethiopia':'🇪🇹',
    'Mali':'🇲🇱','Niger':'🇳🇪','Somalia':'🇸🇴','Dem. Rep. Congo':'🇨🇩','Lebanon':'🇱🇧',
    'Iran':'🇮🇷','Pakistan':'🇵🇰','Nigeria':'🇳🇬','Mozambique':'🇲🇿',
    'India':'🇮🇳','Azerbaijan':'🇦🇿','Philippines':'🇵🇭',
  }
  return f[name] || '🌍'
}

const GlobeView = forwardRef(function GlobeView({ showConflicts, showNatural, showPiracy, gdeltEvents = [] }, ref) {
  const containerRef      = useRef(null)
  const globeInstanceRef  = useRef(null)
  const [countryPanel,    setCountryPanel] = useState(null)
  const setCountryPanelRef = useRef(setCountryPanel)
  setCountryPanelRef.current = setCountryPanel

  const hotGeoNamesRef = useRef(new Set())
  hotGeoNamesRef.current = new Set(gdeltEvents.map(e => CONFLICT_TO_GEO[e.country] ?? e.country))

  useImperativeHandle(ref, () => ({
    refresh:        () => {},
    invalidateSize: () => {
      if (globeInstanceRef.current && containerRef.current) {
        globeInstanceRef.current
          .width(containerRef.current.offsetWidth)
          .height(containerRef.current.offsetHeight)
      }
    },
    setView: () => {},
  }))

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    if (globeInstanceRef.current) {
      el.innerHTML = ''
      globeInstanceRef.current = null
    }

    let ro = null

    const timer = setTimeout(() => {
      if (!containerRef.current) return

      const globe = Globe({ animateIn: false })(containerRef.current)
      globeInstanceRef.current = globe

      globe
        .width(containerRef.current.offsetWidth || 800)
        .height(containerRef.current.offsetHeight || 450)
        .backgroundColor('#0A0C10')
        .showAtmosphere(false)
        .showGraticules(true)
        .globeImageUrl(null)
        .bumpImageUrl(null)

      globe.onGlobeReady(() => {
        globe.scene().traverse(obj => {
          if (obj.isMesh) {
            if (obj.material && obj.material.color) {
              obj.material.color.setHex(0x0d1f35)
              obj.material.needsUpdate = true
            }
          }
        })

        globe.controls().autoRotate      = true
        globe.controls().autoRotateSpeed = 0.4
        globe.controls().addEventListener('start', () => {
          if (globeInstanceRef.current) globeInstanceRef.current.controls().autoRotate = false
        })

        fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
          .then(r => r.json())
          .then(geoData => {
            if (!globeInstanceRef.current) return
            globeInstanceRef.current
              .polygonsData(geoData.features)
              .polygonAltitude(f => hotGeoNamesRef.current.has(f.properties.name) ? 0.01 : 0.003)
              .polygonCapColor(f => hotGeoNamesRef.current.has(f.properties.name) ? 'rgba(248,81,73,0.45)' : 'rgba(13,31,53,0.6)')
              .polygonSideColor(f => hotGeoNamesRef.current.has(f.properties.name) ? 'rgba(248,81,73,0.7)'  : 'rgba(20,40,70,0.3)')
              .polygonStrokeColor(() => '#1E2329')
              .polygonLabel(f => hotGeoNamesRef.current.has(f.properties.name)
                ? `<div style="background:#0D1117;border:1px solid #F85149;padding:4px 8px;font-family:JetBrains Mono,monospace;font-size:11px;color:#F85149;border-radius:2px">${f.properties.name}</div>`
                : null)
              .onPolygonClick(polygon => {
                const name = polygon.properties.name
                if (hotGeoNamesRef.current.has(name)) setCountryPanelRef.current(name)
              })
          })
          .catch(() => {})
      })

      ro = new ResizeObserver(() => {
        if (containerRef.current && globeInstanceRef.current) {
          globeInstanceRef.current
            .width(containerRef.current.offsetWidth)
            .height(containerRef.current.offsetHeight)
        }
      })
      ro.observe(containerRef.current)
    }, 100)

    return () => {
      clearTimeout(timer)
      ro?.disconnect()
      if (containerRef.current) containerRef.current.innerHTML = ''
      globeInstanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!globeInstanceRef.current) return
    const pts = []
    if (showConflicts) gdeltEvents.forEach(c => pts.push({
      lat: c.lat, lng: c.lng, name: c.name,
      label: [c.typeStr, c.status].filter(Boolean).join(' · '),
      color: c.category === 'conflict' ? '#F85149'
           : c.category === 'flood' || c.category === 'earthquake' || c.category === 'drought' ? '#D29922'
           : '#00D4FF',
    }))
    if (showNatural) WILDFIRES_STATIC.forEach(w => pts.push({
      lat: w.lat, lng: w.lng, name: w.name, label: 'Fire risk zone', color: '#FF6B35',
    }))
    if (showPiracy) PIRACY_ZONES.forEach(z => {
      const lat = (z.bounds[0][0] + z.bounds[1][0]) / 2
      const lng = (z.bounds[0][1] + z.bounds[1][1]) / 2
      pts.push({ lat, lng, name: z.name, label: 'Piracy zone', color: '#e8294a' })
    })
    globeInstanceRef.current
      .pointsData(pts)
      .pointLat(d => d.lat)
      .pointLng(d => d.lng)
      .pointColor(d => d.color)
      .pointAltitude(0.02)
      .pointRadius(0.3)
      .pointLabel(d => `<div style="font:10px 'JetBrains Mono',monospace;color:#E6EDF3;padding:4px 8px;background:rgba(13,17,23,0.9);border:1px solid #1E2329;border-radius:3px">${d.name}<br/><span style="color:#8B949E;font-size:9px">${d.label}</span></div>`)
  }, [gdeltEvents, showConflicts, showNatural, showPiracy])

  const panelEvents = countryPanel
    ? gdeltEvents.filter(e => (CONFLICT_TO_GEO[e.country] ?? e.country) === countryPanel)
    : []

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0A0C10' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {countryPanel && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: '420px', maxHeight: '480px', overflowY: 'auto',
          background: '#0D1117',
          borderLeft: '3px solid #F85149', borderTop: '1px solid #1E2329',
          borderRight: '1px solid #1E2329', borderBottom: '1px solid #1E2329',
          borderRadius: '3px', zIndex: 100, fontFamily: 'JetBrains Mono,monospace',
        }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #1E2329', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: '#E6EDF3', fontSize: '15px', fontWeight: 'bold', marginBottom: '6px' }}>
                {countryFlag(countryPanel)} {countryPanel}
              </div>
              {panelEvents.length > 0 && (
                <span style={{ color: '#F85149', fontSize: '9px', border: '1px solid #F85149', padding: '2px 7px', borderRadius: '2px', letterSpacing: '0.1em' }}>
                  ACTIVE CONFLICT
                </span>
              )}
            </div>
            <button onClick={() => setCountryPanel(null)}
              style={{ background: 'none', border: 'none', color: '#484F58', cursor: 'pointer', fontSize: '18px', lineHeight: 1, paddingTop: '2px' }}>×</button>
          </div>
          <div style={{ padding: '8px 0' }}>
            {panelEvents.length === 0
              ? <div style={{ color: '#484F58', fontSize: '10px', textAlign: 'center', padding: '24px 0' }}>No signals found</div>
              : panelEvents.slice(0, 6).map((evt, i) => (
                  <div key={i} style={{ padding: '10px 20px', borderBottom: i < panelEvents.length - 1 ? '1px solid rgba(30,35,41,0.5)' : 'none' }}>
                    <div style={{ color: '#E6EDF3', fontSize: '11px', lineHeight: '1.45', marginBottom: '5px' }}>{evt.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#484F58', fontSize: '9px', letterSpacing: '0.06em' }}>{evt.typeStr}</span>
                      <span style={{ color: '#30363D', fontSize: '9px' }}>·</span>
                      <span style={{
                        fontSize: '8px', padding: '1px 5px', borderRadius: '2px', letterSpacing: '0.06em',
                        background: evt.status === 'ongoing' ? 'rgba(248,81,73,0.15)' : 'rgba(72,79,88,0.2)',
                        color:      evt.status === 'ongoing' ? '#F85149'              : '#484F58',
                        border:     `1px solid ${evt.status === 'ongoing' ? 'rgba(248,81,73,0.3)' : 'rgba(72,79,88,0.3)'}`,
                      }}>{evt.status.toUpperCase()}</span>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      )}
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
  const globeRef       = useRef(null)
  const widgetRef      = useRef(null)
  const currentViewRef = useRef({ center: saved?.center ?? [20, 0], zoom: saved?.zoom ?? 2 })
  const mapModeRef     = useRef(mapMode)
  mapModeRef.current   = mapMode

  const activeTab  = mapMode
  const isLeaflet  = mapMode === 'leaflet'
  const isGlobe    = mapMode === 'globe'
  const isIframe   = !isLeaflet && !isGlobe

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
      globeRef.current?.invalidateSize()
      window.dispatchEvent(new Event('resize'))
    }, 200)
    return () => clearTimeout(t)
  }, [isFullscreen])

  useEffect(() => {
    const t = setTimeout(() => {
      if (mapModeRef.current === 'leaflet') atlasMapRef.current?.invalidateSize()
      if (mapModeRef.current === 'globe')   globeRef.current?.invalidateSize()
    }, 200)
    return () => clearTimeout(t)
  }, [mapMode])

  function switchTab(mode) {
    setMapMode(mode)
  }

  const layerBarStyle = { overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }

  return (
    <div className="widget" ref={widgetRef} data-collapsed={collapsed || undefined}>
      <WHeader title="ATLAS" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={() => setIsFullscreen(v => !v)} isFullscreen={isFullscreen} onClose={onClose} />

      {/* Primary layer / tab bar */}
      <div className="cmap-layer-bar" style={layerBarStyle} onPointerDownCapture={e => e.stopPropagation()}>
        <button className={`cmap-layer-btn${isLeaflet ? ' active' : ''}`}
          onClick={() => setMapMode('leaflet')}>
          WORLD<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">2D world map · Conflict pins, earthquakes, piracy zones</span></span>
        </button>
        <button className={`cmap-layer-btn${mapMode === 'conflict' ? ' active' : ''}`}
          onClick={() => switchTab('conflict')}>
          CONFLICT<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live conflict tracking · Source: Liveuamap</span></span>
        </button>
        <button className={`cmap-layer-btn${(isLeaflet || isGlobe) && showNatural ? ' active' : ''}`}
          onClick={() => { if (isIframe) setMapMode('leaflet'); setShowNatural(v => !v) }}>
          NATURAL<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Earthquakes · Wildfires · Storms · Sources: USGS, NOAA</span></span>
        </button>
        <button className={`cmap-layer-btn${(isLeaflet || isGlobe) && showPiracy ? ' active' : ''}`}
          onClick={() => { if (isIframe) setMapMode('leaflet'); setShowPiracy(v => !v) }}>
          PIRACY<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Maritime piracy high-risk zones · Source: IMB</span></span>
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
        <button className={`cmap-layer-btn${isGlobe ? ' active' : ''}`}
          onClick={() => setMapMode(isGlobe ? 'leaflet' : 'globe')}
          title="Toggle 3D globe view">
          GLOBE
        </button>
        <button className="cmap-update-btn" onClick={() => atlasMapRef.current?.refresh()} title="Re-fetch live data">⟳ Update</button>
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

        <div style={{ display: activeTab === 'globe' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <GlobeView
            ref={globeRef}
            showConflicts={true}
            showNatural={showNatural}
            showPiracy={showPiracy}
            gdeltEvents={CONFLICTS}
          />
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

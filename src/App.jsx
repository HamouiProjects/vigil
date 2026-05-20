import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets'
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
  return <div className="clock"><span className="clock-label">UTC</span>{time}</div>
}

// ─── NavBar ───────────────────────────────────────────────────────────────────
// ─── Single workspace tab — owns its own DOM ref for native event listeners ────
function WsTab({ ws, isActive, isEditing, nameInput, onSwitchWs, onStartRename, onCtxMenu }) {
  const divRef = useRef(null)

  // Native listeners bypass React's synthetic event delegation entirely.
  // This fires even if something higher up called stopPropagation on the
  // bubbling path before React's root listener got a chance to handle it.
  useEffect(() => {
    const el = divRef.current
    if (!el) return

    function onCtx(e) {
      e.preventDefault()
      e.stopPropagation()
      console.log('[Vigil] contextmenu fired on tab:', ws.name)
      onCtxMenu(e.clientX, e.clientY)
    }
    function onDbl(e) {
      e.preventDefault()
      e.stopPropagation()
      console.log('[Vigil] dblclick fired on tab:', ws.name)
      onStartRename()
    }

    el.addEventListener('contextmenu', onCtx)
    el.addEventListener('dblclick',    onDbl)
    return () => {
      el.removeEventListener('contextmenu', onCtx)
      el.removeEventListener('dblclick',    onDbl)
    }
  // Stable callbacks — only re-attach when ws changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.id])

  return (
    <div
      ref={divRef}
      className={`ws-tab${isActive ? ' active' : ''}`}
      onClick={() => onSwitchWs(ws.id)}
      title={ws.name}
    >
      {ws.name}
    </div>
  )
}

function NavBar({ saved, workspaces, activeWs, onSwitchWs, onRenameWs, onAddWs, onDeleteWs, onDuplicateWs, onShowAddModal }) {
  const [editingId,  setEditingId]  = useState(null)
  const [nameInput,  setNameInput]  = useState('')
  const [ctxMenu,    setCtxMenu]    = useState(null)   // { x, y, ws }
  const ctxMenuRef   = useRef(null)
  const editInputRef = useRef(null)

  // Focus + select-all as soon as the rename input mounts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // Dismiss context menu on outside click (capture) or Escape
  useEffect(() => {
    if (!ctxMenu) return
    function onDown(e) {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target)) setCtxMenu(null)
    }
    function onKey(e) { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown',   onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown',   onKey)
    }
  }, [ctxMenu])

  function openCtxMenu(clientX, clientY, ws) {
    const menuW = 148, menuH = workspaces.length > 1 ? 110 : 82
    const x = Math.min(clientX, window.innerWidth  - menuW - 6)
    const y = Math.min(clientY, window.innerHeight - menuH - 6)
    setCtxMenu({ x, y, ws })
  }

  function startRename(ws)  { setEditingId(ws.id); setNameInput(ws.name); setCtxMenu(null) }
  function cancelRename()   { setEditingId(null) }
  function commitRename(ws) {
    const name = nameInput.trim()
    if (name && name !== ws.name) onRenameWs(ws.id, name)
    setEditingId(null)
  }

  const canDelete = workspaces.length > 1

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
                ref={editInputRef}
                className="ws-name-input"
                value={nameInput}
                size={Math.max(nameInput.length + 1, 6)}
                onChange={e => setNameInput(e.target.value)}
                onBlur={() => commitRename(ws)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); commitRename(ws) }
                  if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                }}
              />
            ) : (
              <WsTab
                key={ws.id}
                ws={ws}
                isActive={ws.id === activeWs}
                onSwitchWs={onSwitchWs}
                onStartRename={() => startRename(ws)}
                onCtxMenu={(x, y) => openCtxMenu(x, y, ws)}
              />
            )
          )}
          {workspaces.length < 6 && (
            <button className="ws-add-btn" onClick={onAddWs} title="New workspace">+</button>
          )}
        </div>
      </div>
      <div className="navbar-right">
        <button className="nav-add-btn" onClick={onShowAddModal}>+ Add Widget</button>
        <div className="status-dot">LIVE</div>
        <UtcClock />
        <div className={`save-indicator${saved ? ' visible' : ''}`}>SAVED</div>
      </div>

      {ctxMenu && createPortal(
        <div
          ref={ctxMenuRef}
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onMouseDown={() => startRename(ctxMenu.ws)}>✏ Rename</div>
          <div className="ctx-item" onMouseDown={() => { onDuplicateWs(ctxMenu.ws.id); setCtxMenu(null) }}>⧉ Duplicate</div>
          <div
            className={`ctx-item ${canDelete ? 'ctx-item-danger' : 'ctx-item-disabled'}`}
            onMouseDown={canDelete ? () => { onDeleteWs(ctxMenu.ws.id); setCtxMenu(null) } : undefined}
          >🗑 Delete</div>
        </div>,
        document.body
      )}
    </nav>
  )
}

// ─── Shared widget header ─────────────────────────────────────────────────────
function WHeader({ title, badge, badgeActive, onRefresh, onCollapse, collapsed, onClose, onFullscreen, isFullscreen }) {
  return (
    <div className="widget-header">
      <div className="widget-title-group">
        <span className="widget-title">{title}</span>
      </div>
      <div className="widget-actions">
        {badge && <span className={`widget-badge${badgeActive ? '' : ' inactive'}`}>{badge}</span>}
        {onRefresh    && <button className="widget-btn" onClick={onRefresh} title="Refresh">↻</button>}
        {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
        {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
        {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
      </div>
    </div>
  )
}

// ─── FEEDS widget tab list ────────────────────────────────────────────────────
const FEEDS_TABS = [
  { id: 'flights',   label: 'Flights',   src: 'https://globe.adsbexchange.com/?lat=20&lon=0&zoom=3' },
  { id: 'weather',   label: 'Weather',   src: 'https://embed.windy.com/embed2.html?lat=20&lon=0&zoom=3&level=surface&overlay=wind&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=kt&metricTemp=%C2%B0C&radarRange=-1' },
  { id: 'cyber',     label: 'Cyber',     src: 'https://threatmap.checkpoint.com/' },
  { id: 'wildfires', label: 'Wildfires', src: 'https://firms.modaps.eosdis.nasa.gov/map/' },
  { id: 'marine',    label: 'Marine',    src: 'https://www.myshiptracking.com/' },
]

// ─── ATLAS static data layers ─────────────────────────────────────────────────
const CONFLICTS = [
  { name: 'Gaza',               lat:  31.35, lng:  34.30, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Palestine'   },
  { name: 'Kyiv Oblast',        lat:  50.45, lng:  30.52, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Ukraine'     },
  { name: 'Khartoum',           lat:  15.55, lng:  32.53, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Sudan'       },
  { name: 'Donbas',             lat:  48.01, lng:  37.80, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Ukraine'     },
  { name: 'West Bank',          lat:  31.95, lng:  35.30, category: 'conflict',   status: 'alert',   typeStr: 'Conflict',   country: 'Palestine'   },
  { name: 'Cabo Delgado',       lat: -12.33, lng:  40.51, category: 'earthquake', status: 'ongoing', typeStr: 'Violence',   country: 'Mozambique'  },
  { name: 'Sahel/Mali',         lat:  17.57, lng:  -4.00, category: 'drought',    status: 'ongoing', typeStr: 'Insecurity', country: 'Mali'        },
  { name: 'Rakhine/Myanmar',    lat:  20.14, lng:  92.90, category: 'conflict',   status: 'ongoing', typeStr: 'Conflict',   country: 'Myanmar'     },
  { name: 'South Kivu',         lat:  -2.99, lng:  28.85, category: 'earthquake', status: 'ongoing', typeStr: 'Violence',   country: 'DRC'         },
  { name: 'Idlib',              lat:  35.93, lng:  36.63, category: 'earthquake', status: 'ongoing', typeStr: 'Conflict',   country: 'Syria'       },
  { name: 'Hajjah/Yemen',       lat:  15.69, lng:  43.60, category: 'drought',    status: 'ongoing', typeStr: 'Insecurity', country: 'Yemen'       },
  { name: 'Tigray',             lat:  14.03, lng:  38.31, category: 'drought',    status: 'ongoing', typeStr: 'Insecurity', country: 'Ethiopia'    },
  { name: 'Borno/Nigeria',      lat:  11.85, lng:  13.15, category: 'other',      status: 'ongoing', typeStr: 'Insecurity', country: 'Nigeria'     },
  { name: 'Oromia',             lat:   8.00, lng:  38.00, category: 'other',      status: 'ongoing', typeStr: 'Insecurity', country: 'Ethiopia'    },
  { name: 'Kunduz',             lat:  36.72, lng:  68.87, category: 'other',      status: 'past',    typeStr: 'Conflict',   country: 'Afghanistan' },
  { name: 'Balochistan',        lat:  28.49, lng:  65.09, category: 'other',      status: 'ongoing', typeStr: 'Conflict',   country: 'Pakistan'    },
  { name: 'Manipur',            lat:  24.66, lng:  93.90, category: 'other',      status: 'ongoing', typeStr: 'Conflict',   country: 'India'       },
  { name: 'Abyei',              lat:   9.60, lng:  28.43, category: 'other',      status: 'ongoing', typeStr: 'Conflict',   country: 'Sudan'       },
  { name: 'Nakhchivan',         lat:  39.20, lng:  45.41, category: 'other',      status: 'past',    typeStr: 'Conflict',   country: 'Azerbaijan'  },
  { name: 'Marawi/Philippines', lat:   7.99, lng: 124.29, category: 'other',      status: 'past',    typeStr: 'Conflict',   country: 'Philippines' },
]

const WILDFIRES_STATIC = [
  { name: 'Canadian Boreal Zone',  lat:  56.0, lng: -105.0, country: 'Canada'    },
  { name: 'Amazon Basin',          lat:  -8.0, lng:  -63.0, country: 'Brazil'    },
  { name: 'Siberia/Yakutia',       lat:  62.0, lng:  130.0, country: 'Russia'    },
  { name: 'SE Australia',          lat: -33.0, lng:  149.0, country: 'Australia' },
  { name: 'Greece/Mediterranean',  lat:  37.5, lng:   22.0, country: 'Greece'    },
  { name: 'California Corridor',   lat:  37.0, lng: -119.0, country: 'USA'       },
  { name: 'Central Africa',        lat:  -5.0, lng:   25.0, country: 'DRC'       },
  { name: 'SE Asia Peatlands',     lat:   0.0, lng:  112.0, country: 'Indonesia' },
]

const PIRACY_ZONES = [
  { name: 'Gulf of Guinea',    bounds: [[ 0, -3], [ 5, 10]] },
  { name: 'Strait of Malacca', bounds: [[ 1,100], [ 6,105]] },
  { name: 'Gulf of Aden',      bounds: [[11, 42], [16, 52]] },
  { name: 'Red Sea',           bounds: [[12, 32], [28, 44]] },
]

const CMAP_STYLE = {
  conflict:   { size: 14, color: '#e8294a', pulse: true  },
  flood:      { size: 10, color: '#4a9eff', pulse: false },
  earthquake: { size: 10, color: '#f07c2a', pulse: false },
  drought:    { size: 8,  color: '#f5c842', pulse: false },
  other:      { size: 8,  color: '#6e8098', pulse: false },
}

function conflictIcon(category) {
  const s = CMAP_STYLE[category] ?? CMAP_STYLE.other
  return L.divIcon({
    html:       `<div class="cmap-dot${s.pulse ? ' cmap-pulse' : ''}" style="width:${s.size}px;height:${s.size}px;background:${s.color}"></div>`,
    className:  '',
    iconSize:   [s.size, s.size],
    iconAnchor: [s.size / 2, s.size / 2],
  })
}

function wildfireIcon() {
  return L.divIcon({
    html: '<div class="cmap-dot" style="width:8px;height:8px;background:#ff6b35"></div>',
    className: '', iconSize: [8,8], iconAnchor: [4,4],
  })
}

function stormIcon(cls) {
  const size = /HU|TY/.test(cls) ? 14 : 10
  return L.divIcon({
    html: `<div class="cmap-dot" style="width:${size}px;height:${size}px;background:#1abc9c;border:2px solid rgba(255,255,255,0.25)"></div>`,
    className: '', iconSize: [size,size], iconAnchor: [size/2,size/2],
  })
}

function parseNOAACoord(str) {
  const v = parseFloat(str)
  return typeof str === 'string' && (str.endsWith('S') || str.endsWith('W')) ? -v : v
}

async function fetchNOAAStorms() {
  const res  = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json.activeStorms ?? []).map(s => ({
    name: s.name || s.id || 'Storm',
    lat:  parseNOAACoord(s.latitude),
    lng:  parseNOAACoord(s.longitude),
    cls:  s.classification || '?',
    wind: s.intensity || '?',
    country: '',
  })).filter(s => !isNaN(s.lat) && !isNaN(s.lng))
}

function mapPopupHtml(name, row2, lat, lng, country) {
  const safe  = name.replace(/"/g, '&quot;')
  const safeC = (country || '').replace(/"/g, '&quot;')
  return `<div class="cmap-popup">
    <div class="cmap-popup-name">${name}</div>
    <div class="cmap-popup-row">${row2}</div>
    <a class="cmap-popup-link" href="#" data-kw="${safe}" data-lat="${lat}" data-lon="${lng}" data-country="${safeC}">Search news →</a>
  </div>`
}

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson'

function quakeSize(mag) {
  if (mag >= 6) return 14
  if (mag >= 5) return 10
  return 6
}

function quakeTimeAgo(ms) {
  const diff = Math.floor((Date.now() - ms) / 60000)
  if (diff < 1)    return 'just now'
  if (diff < 60)   return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  return `${Math.floor(diff / 1440)}d ago`
}

async function fetchUSGS() {
  const res  = await fetch(USGS_URL, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const quakes = (json.features ?? []).map(f => {
    const [lon, lat] = f.geometry?.coordinates ?? []
    const { mag, place, time } = f.properties ?? {}
    return { lat, lng: lon, mag: mag ?? 0, place: place || 'Unknown location', time: time ?? 0 }
  }).filter(q => typeof q.lat === 'number' && typeof q.lng === 'number')
  if (!quakes.length) throw new Error('empty')
  return quakes
}

const AtlasMap = forwardRef(function AtlasMap({ showConflicts, showNatural, showPiracy }, ref) {
  const containerRef  = useRef(null)
  const mapRef        = useRef(null)
  const layerConflict = useRef(null)
  const layerQuake    = useRef(null)
  const layerStorm    = useRef(null)
  const layerWildfire = useRef(null)
  const layerPiracy   = useRef(null)
  const [loading,   setLoading]   = useState(false)
  const [quakeLive, setQuakeLive] = useState(false)

  // Single effect owns all layer visibility — fires whenever any show* prop changes.
  // Skips silently if map/layers aren't ready yet (map init effect runs after this on mount).
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
    setLoading(true)

    // Earthquakes (USGS)
    try {
      const quakes = await fetchUSGS()
      layerQuake.current?.clearLayers()
      quakes.forEach(q => {
        const cm = L.circleMarker([q.lat, q.lng], {
          radius: quakeSize(q.mag) / 2, fillColor: '#9b59b6', color: '#7d3c98',
          weight: 1, opacity: 0.9, fillOpacity: 0.75,
        })
        cm.bindPopup(mapPopupHtml(`M${q.mag.toFixed(1)} — ${q.place}`, quakeTimeAgo(q.time), q.lat, q.lng, ''),
          { className: 'cmap-popup-wrap', maxWidth: 240, minWidth: 180 })
        layerQuake.current?.addLayer(cm)
      })
      setQuakeLive(true)
    } catch { setQuakeLive(false) }

    // Storms (NOAA)
    try {
      const storms = await fetchNOAAStorms()
      layerStorm.current?.clearLayers()
      storms.forEach(s => {
        const mk = L.marker([s.lat, s.lng], { icon: stormIcon(s.cls) })
        mk.bindPopup(mapPopupHtml(s.name, `${s.cls} · ${s.wind} kt`, s.lat, s.lng, s.country),
          { className: 'cmap-popup-wrap', maxWidth: 220, minWidth: 160 })
        layerStorm.current?.addLayer(mk)
      })
    } catch { /* no active storms or CORS */ }

    setLoading(false)
  }, [])

  useImperativeHandle(ref, () => ({
    refresh,
    invalidateSize: () => { mapRef.current?.invalidateSize() },
  }), [refresh])

  // Capture show* in a ref so the map-init effect can read their current values
  // without being a dependency (map should only init once).
  const showRef = useRef({ showConflicts, showNatural, showPiracy })
  showRef.current = { showConflicts, showNatural, showPiracy }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [20, 0], zoom: 2, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org" target="_blank">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)

    // Create layer groups but add them based on current show* values so that
    // a remount (e.g. entering fullscreen) respects whatever was toggled off.
    const sv = showRef.current
    const mkLayer = (show) => show ? L.layerGroup().addTo(map) : L.layerGroup()
    layerConflict.current  = mkLayer(sv.showConflicts)
    layerQuake.current     = mkLayer(sv.showNatural)
    layerStorm.current     = mkLayer(sv.showNatural)
    layerWildfire.current  = mkLayer(sv.showNatural)
    layerPiracy.current    = mkLayer(sv.showPiracy)
    mapRef.current = map

    // Static: conflicts
    CONFLICTS.forEach(evt => {
      const mk = L.marker([evt.lat, evt.lng], { icon: conflictIcon(evt.category) })
      mk.bindPopup(mapPopupHtml(
        evt.name,
        `${evt.typeStr} · <span class="cmap-status-${evt.status}">${evt.status}</span>`,
        evt.lat, evt.lng, evt.country
      ), { className: 'cmap-popup-wrap', maxWidth: 220, minWidth: 170 })
      layerConflict.current.addLayer(mk)
    })

    // Static: wildfires
    WILDFIRES_STATIC.forEach(wf => {
      const mk = L.marker([wf.lat, wf.lng], { icon: wildfireIcon() })
      mk.bindPopup(mapPopupHtml(
        wf.name,
        'Fire risk zone <span style="color:#6e8098;font-size:9px">(reference)</span>',
        wf.lat, wf.lng, wf.country
      ), { className: 'cmap-popup-wrap', maxWidth: 220, minWidth: 170 })
      layerWildfire.current.addLayer(mk)
    })

    // Static: piracy zones (rectangles)
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

    // Unified popup link handler — fires all three cross-widget events
    map.on('popupopen', e => {
      const link = e.popup.getElement()?.querySelector('.cmap-popup-link')
      if (!link) return
      link.addEventListener('click', ev => {
        ev.preventDefault()
        const { kw, lat, lon, country } = link.dataset
        window.dispatchEvent(new CustomEvent('vigil:search',   { detail: { keyword: kw } }))
        window.dispatchEvent(new CustomEvent('vigil:location', { detail: { name: kw, lat: parseFloat(lat), lon: parseFloat(lon), country: country || '' } }))
        window.dispatchEvent(new CustomEvent('vigil:region',   { detail: { country: country || kw } }))
        map.closePopup()
      })
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

function AtlasWidget({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [showConflicts, setShowConflicts] = useState(true)
  const [showNatural,   setShowNatural]   = useState(true)
  const [showPiracy,    setShowPiracy]    = useState(true)
  const [mapMode,   setMapMode]   = useState('leaflet')  // 'leaflet' | 'iframe'
  const [iframeSrc, setIframeSrc] = useState('')
  const atlasRef = useRef(null)

  // Invalidate Leaflet tiles on fullscreen toggle
  useEffect(() => {
    const t = setTimeout(() => {
      atlasRef.current?.invalidateSize()
      window.dispatchEvent(new Event('resize'))
    }, 200)
    return () => clearTimeout(t)
  }, [isFullscreen])

  // Invalidate Leaflet tiles when returning from iframe mode
  useEffect(() => {
    if (mapMode !== 'leaflet') return
    const t = setTimeout(() => atlasRef.current?.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [mapMode])

  function switchToIframe(src) { setMapMode('iframe'); setIframeSrc(src) }

  const isLeaflet = mapMode === 'leaflet'

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">ATLAS</span>
        <div className="widget-actions">
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>
      <div className="cmap-layer-bar" onPointerDownCapture={e => e.stopPropagation()}>
        <button
          className={`cmap-layer-btn${isLeaflet && showConflicts ? ' active' : ''}`}
          onClick={() => { setMapMode('leaflet'); setShowConflicts(v => !v) }}
        >
          🔴 CONFLICTS<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Armed conflict zones · Source: ReliefWeb</span></span>
        </button>
        <button
          className={`cmap-layer-btn${isLeaflet && showNatural ? ' active' : ''}`}
          onClick={() => { setMapMode('leaflet'); setShowNatural(v => !v) }}
        >
          🟢 NATURAL<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Earthquakes · Wildfires · Storms · Sources: USGS, NOAA</span></span>
        </button>
        <button
          className={`cmap-layer-btn${isLeaflet && showPiracy ? ' active' : ''}`}
          onClick={() => { setMapMode('leaflet'); setShowPiracy(v => !v) }}
        >
          🚢 PIRACY<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Maritime piracy high-risk zones · Source: IMB</span></span>
        </button>
        <button
          className={`cmap-layer-btn${!isLeaflet && iframeSrc.includes('adsbexchange') ? ' active' : ''}`}
          onClick={() => switchToIframe('https://globe.adsbexchange.com/?lat=20&lon=0&zoom=3')}
        >
          ✈️ FLIGHTS<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live air traffic · Source: ADS-B Exchange</span></span>
        </button>
        <button
          className={`cmap-layer-btn${!isLeaflet && iframeSrc.includes('myshiptracking') ? ' active' : ''}`}
          onClick={() => switchToIframe('https://www.myshiptracking.com/')}
        >
          ⚓ MARINE<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live vessel tracking · Source: MyShipTracking</span></span>
        </button>
        <button
          className={`cmap-layer-btn${!isLeaflet && iframeSrc.includes('checkpoint') ? ' active' : ''}`}
          onClick={() => switchToIframe('https://threatmap.checkpoint.com/')}
        >
          🛡 CYBER<span className="layer-tip"><span className="layer-tip-icon">?</span><span className="layer-tip-text">Live cyber attacks · Source: Checkpoint</span></span>
        </button>
        {isLeaflet && (
          <button className="cmap-update-btn" onClick={() => atlasRef.current?.refresh()} title="Re-fetch live data">⟳ Update</button>
        )}
      </div>
      <div style={{ height: 'calc(100% - 36px - 32px)', width: '100%', position: 'relative', overflow: 'hidden' }}>
        {isLeaflet ? (
          <AtlasMap
            ref={atlasRef}
            showConflicts={showConflicts}
            showNatural={showNatural}
            showPiracy={showPiracy}
          />
        ) : (
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            title="ATLAS feed"
            allowFullScreen
          />
        )}
      </div>
    </div>
  )
}

// ─── Feeds (iframe tab-switcher: Flights / Weather / Cyber / Wildfires / Marine)
function FeedsWidget({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [activeTab, setActiveTab] = useState(FEEDS_TABS[0].id)
  const [loadError, setLoadError] = useState(false)

  const tab = FEEDS_TABS.find(t => t.id === activeTab) ?? FEEDS_TABS[0]

  function switchTab(id) { setActiveTab(id); setLoadError(false) }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">Feeds</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div className="map-tabs" onPointerDownCapture={e => e.stopPropagation()}>
            {FEEDS_TABS.map(t => (
              <button key={t.id} className={`map-tab-btn${activeTab === t.id ? ' active' : ''}`} onClick={() => switchTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>
      <div style={{ height: 'calc(100% - 36px)', width: '100%', position: 'relative', overflow: 'hidden' }}>
        <iframe
          key={tab.id}
          src={tab.src}
          style={{ width: '100%', height: '100%', border: 'none', outline: 'none', display: 'block' }}
          title={tab.label}
          allowFullScreen
          onError={() => setLoadError(true)}
          onLoad={() => setLoadError(false)}
        />
        {loadError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#080f18' }}>
            <div style={{ fontSize: '11px', color: '#6e8098', textAlign: 'center', padding: '0 20px' }}>{tab.label} does not allow embedding.</div>
            <a href={tab.src} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', fontWeight: 600, color: '#00c6ff', background: 'rgba(0,198,255,0.1)', border: '1px solid rgba(0,198,255,0.3)', borderRadius: '4px', padding: '5px 14px', textDecoration: 'none', letterSpacing: '0.05em' }}>
              Open in new tab →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CONFLICT region tabs ─────────────────────────────────────────────────────
const CONFLICT_REGIONS = [
  { id: 'ukraine',    label: '🇺🇦 UKRAINE',    src: 'https://liveuamap.com/en?q=ukraine'     },
  { id: 'middleeast', label: '🌙 MIDDLE EAST',  src: 'https://liveuamap.com/en?q=middle+east' },
  { id: 'africa',     label: '🌍 AFRICA',       src: 'https://liveuamap.com/en?q=africa'      },
  { id: 'sudan',      label: '🇸🇩 SUDAN',       src: 'https://liveuamap.com/en?q=sudan'       },
  { id: 'syria',      label: '🇸🇾 SYRIA',       src: 'https://liveuamap.com/en?q=syria'       },
  { id: 'yemen',      label: '🇾🇪 YEMEN',       src: 'https://liveuamap.com/en?q=yemen'       },
  { id: 'gaza',       label: '🇵🇸 GAZA',        src: 'https://liveuamap.com/en?q=gaza'        },
  { id: 'asia',       label: '🌏 ASIA',         src: 'https://liveuamap.com/en?q=asia'        },
]

const REGION_SLUG_MAP = {
  ukraine: 'ukraine', kyiv: 'ukraine',
  sudan: 'sudan', khartoum: 'sudan',
  syria: 'syria', idlib: 'syria',
  yemen: 'yemen',
  israel: 'gaza', palestine: 'gaza', gaza: 'gaza',
  myanmar: 'asia', pakistan: 'asia', india: 'asia', afghanistan: 'asia', philippines: 'asia',
  drc: 'africa', nigeria: 'africa', ethiopia: 'africa', mozambique: 'africa', mali: 'africa',
}

// ─── CONFLICT (LiveUAMap with region tabs) ────────────────────────────────────
function ConflictFeed({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [region, setRegion] = useState('ukraine')
  const src = CONFLICT_REGIONS.find(r => r.id === region)?.src ?? CONFLICT_REGIONS[0].src

  useEffect(() => {
    function onRegion(e) {
      const raw = (e.detail?.country ?? '').trim().toLowerCase()
      if (!raw) return
      const slug = REGION_SLUG_MAP[raw]
        ?? CONFLICT_REGIONS.find(r => raw.includes(r.id) || r.id.includes(raw))?.id
      if (slug) setRegion(slug)
    }
    window.addEventListener('vigil:region', onRegion)
    return () => window.removeEventListener('vigil:region', onRegion)
  }, [])

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="CONFLICT" badge="LIVE" badgeActive={true} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <div className="cmap-layer-bar" style={{ overflowX: 'auto', scrollbarWidth: 'none' }} onPointerDownCapture={e => e.stopPropagation()}>
        {CONFLICT_REGIONS.map(r => (
          <button
            key={r.id}
            className={`conf-tab-btn${region === r.id ? ' active' : ''}`}
            onClick={() => setRegion(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div style={{ height: 'calc(100% - 36px - 32px)', width: '100%', position: 'relative', overflow: 'hidden', background: '#0a0e1a' }}>
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
          <iframe
            key={src}
            src={src}
            style={{ width: '100%', height: 'calc(100% + 80px)', border: 'none', position: 'absolute', top: 0, left: 0 }}
            title="CONFLICT"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}

// ─── News Search (Google News RSS via rss2json) ───────────────────────────────
const DEFAULT_KEYWORDS = 'conflict'
const LUA_RSS_URL = 'https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fliveuamap.com%2Fen%2Frss'

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

function KeywordFeed({ initialUrl = DEFAULT_KEYWORDS, onUrlChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [query,     setQuery]     = useState(initialUrl)
  const [input,     setInput]     = useState(initialUrl)
  const [articles,  setArticles]  = useState([])
  const [fetchedAt, setFetchedAt] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { setQuery(initialUrl); setInput(initialUrl) }, [initialUrl])

  useEffect(() => {
    function onSearch(e) {
      const kw = e.detail?.keyword?.trim()
      if (!kw) return
      setInput(kw); setQuery(kw); onUrlChange?.(kw)
    }
    window.addEventListener('vigil:search', onSearch)
    return () => window.removeEventListener('vigil:search', onSearch)
  }, [onUrlChange])

  const load = useCallback(async (q) => {
    setLoading(true); setError(null)
    try {
      const [gnResult, luaResult] = await Promise.allSettled([
        fetchNewsSearch(q),
        fetch(LUA_RSS_URL, { signal: AbortSignal.timeout(10000) })
          .then(r => r.json())
          .then(json => {
            if (json.status !== 'ok' || !json.items?.length) return []
            return json.items.map(item => ({
              title:   item.title   ?? '(no title)',
              link:    item.link    ?? '',
              pubDate: item.pubDate ?? '',
              source:  'LiveUAMap',
              isLua:   true,
            }))
          }),
      ])
      const gnArts  = gnResult.status  === 'fulfilled' ? gnResult.value  : []
      const luaArts = luaResult.status === 'fulfilled' ? luaResult.value : []
      const gnTitles = new Set(gnArts.map(a => a.title))
      const merged = [...gnArts, ...luaArts.filter(a => !gnTitles.has(a.title))]
      if (!merged.length) throw new Error('No results')
      setArticles(merged)
      setFetchedAt(Date.now())
    } catch (e) {
      setError(e.message === 'No results' ? 'No results — try a different keyword' : 'News search unavailable')
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
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="News Search" badge={badge} badgeActive={!error && !loading} onRefresh={() => load(query)} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <div className="widget-body">
        <div className="rss-container">
          <form className="rss-url-bar" onSubmit={e => { e.preventDefault(); const q = input.trim(); if (q) { setQuery(q); onUrlChange?.(q) } }}>
            <input className="rss-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Keywords… (e.g. ukraine war)" spellCheck={false} />
            <button className="rss-go-btn" type="submit">GO</button>
          </form>
          {error   ? <div className="feed-error">{error}</div>
         : loading ? <div className="feed-loading">Searching news…</div>
         : (
            <div className="feed-list">
              {articles.map((art, i) => (
                <a key={i} className="feed-item feed-item-link" href={art.link} target="_blank" rel="noopener noreferrer">
                  <div className={`feed-dot ${dotColor(art.title)}`} />
                  <span className="feed-text">
                    <span className="feed-source">
                      {art.isLua && <span style={{ color: '#ff8c00', fontSize: '9px', fontWeight: 700, marginRight: '3px' }}>LUA</span>}
                      {art.source || '—'}
                    </span>
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

function RssFeed({ initialUrl = DEFAULT_RSS, onUrlChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
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
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="RSS Feed" badge={badge} badgeActive={!error && !loading} onRefresh={() => load(url)} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <div className="widget-body">
        <div className="rss-container">
          <form className="rss-url-bar" onSubmit={e => { e.preventDefault(); const t = input.trim(); if (t) { setUrl(t); onUrlChange?.(t) } }}>
            <input className="rss-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Paste RSS URL…" spellCheck={false} />
            <button className="rss-go-btn" type="submit">GO</button>
          </form>
          {error   ? <div className="feed-error">{error}</div>
         : loading ? <div className="feed-loading">Fetching feed…</div>
         : (
            <div className="feed-list">
              {items.map((item, i) => (
                <a key={i} className="feed-item feed-item-link" href={item.link} target="_blank" rel="noopener noreferrer">
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

function PriceTracker({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
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
    } catch { setError('Fetch failed') }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id) }, [load])

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="Price Tracker" badge={loading ? 'LOADING…' : error ? 'ERROR' : 'LIVE'} badgeActive={!error && !loading} onRefresh={load} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
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
      u.searchParams.set('autoplay', '0'); u.searchParams.set('mute', '1')
      return u.toString()
    }
    if (u.searchParams.has('v'))
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}?autoplay=0&mute=1`
    if (u.hostname === 'youtu.be')
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=0&mute=1`
    const parts = u.pathname.split('/').filter(Boolean)
    if (['live', 'v'].includes(parts[0]) && parts[1])
      return `https://www.youtube.com/embed/${parts[1]}?autoplay=0&mute=1`
    return s
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(s))
      return `https://www.youtube.com/embed/${s}?autoplay=0&mute=1`
    return null
  }
}

function Livestream({ initialUrl = AJ_EMBED, onUrlChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
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
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">Livestream</span>
        <div className="widget-actions">
          <span className={`widget-badge${embedUrl ? '' : ' inactive'}`}>{embedUrl ? 'LIVE' : 'STANDBY'}</span>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>
      <form className="rss-url-bar" onSubmit={handleSubmit} style={{ flexShrink: 0 }}>
        <input className="rss-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Paste any YouTube URL or embed link…" spellCheck={false} />
        <button className="rss-go-btn" type="submit">GO</button>
      </form>
      {error && <div className="feed-error" style={{ flexShrink: 0, height: 'auto', padding: '4px 12px' }}>{error}</div>}
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

function Weather({ initialCity = 'Berlin', onCityChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [city,      setCity]      = useState(initialCity)
  const [cityInput, setCityInput] = useState(initialCity)
  const [editing,   setEditing]   = useState(false)
  const [locName,   setLocName]   = useState(initialCity)
  const [latLon,    setLatLon]    = useState(null)   // {lat, lon, name} set by vigil:location
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => { setCity(initialCity); setCityInput(initialCity) }, [initialCity])

  useEffect(() => {
    function onLocation(e) {
      const { name, lat, lon } = e.detail ?? {}
      if (typeof lat !== 'number' || typeof lon !== 'number') return
      setLatLon({ lat, lon, name: name || '' })
    }
    window.addEventListener('vigil:location', onLocation)
    return () => window.removeEventListener('vigil:location', onLocation)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true); setError(null)
      try {
        let lat, lon, name
        if (latLon) {
          lat = latLon.lat; lon = latLon.lon; name = latLon.name
        } else {
          const geo = await fetch(GEO_URL(city)).then(r => r.json())
          const loc = geo.results?.[0]
          if (!loc) throw new Error(`"${city}" not found`)
          lat = loc.latitude; lon = loc.longitude; name = loc.name
        }
        if (cancelled) return
        setLocName(name)
        const wx = await fetch(WX_URL(lat, lon)).then(r => r.json())
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
  }, [city, latLon])

  function handleCitySubmit(e) {
    e.preventDefault()
    const c = cityInput.trim()
    if (c) { setCity(c); setLatLon(null); onCityChange?.(c) }
    setEditing(false)
  }

  const wmo = data ? decodeWmo(data.weather_code) : null

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">Weather · {locName}</span>
        <div className="widget-actions">
          <span className={`widget-badge${!error && !loading ? '' : ' inactive'}`}>{loading ? 'LOADING…' : error ? 'ERROR' : 'LIVE'}</span>
          <button className="widget-btn" onClick={() => setEditing(v => !v)} title="Change city">✎</button>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>
      {editing && (
        <form className="rss-url-bar" onSubmit={handleCitySubmit} style={{ flexShrink: 0 }}>
          <input className="rss-input" value={cityInput} onChange={e => setCityInput(e.target.value)} placeholder="City name…" spellCheck={false} autoFocus />
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
  livestreamUrl:  AJ_EMBED,
}
const settingsKey = id => `vigil_ws${id.replace('ws-', '')}_settings`
function readSettings(wsId) {
  try {
    const raw = localStorage.getItem(settingsKey(wsId))
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  } catch { return { ...DEFAULT_SETTINGS } }
}

// ─── Workspace + widget persistence ──────────────────────────────────────────
const WS_META_KEY        = 'vigil_workspaces'
const widgetsKey         = id => `vigil_ws${id.replace('ws-', '')}_widgets`
const DEFAULT_WORKSPACES = [{ id: 'ws-1', name: 'Workspace 1' }]
const DEFAULT_WIDGETS    = [
  { id: 'atlas',   type: 'map'     },
  { id: 'feed',    type: 'feed'    },
  { id: 'rss',     type: 'rss'     },
  { id: 'prices',  type: 'prices'  },
  { id: 'stream',  type: 'stream'  },
  { id: 'weather', type: 'weather' },
]

function readWorkspacesMeta() {
  try {
    const raw = localStorage.getItem(WS_META_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_WORKSPACES
  } catch { return DEFAULT_WORKSPACES }
}

function readWidgets(wsId) {
  try {
    const raw = localStorage.getItem(widgetsKey(wsId))
    return raw ? JSON.parse(raw) : DEFAULT_WIDGETS
  } catch { return DEFAULT_WIDGETS }
}

// ─── TV Chart (TradingView AdvancedRealTimeChart) ────────────────────────────
function ChartWidget({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="TV Chart" onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <div style={{ height: 'calc(100% - 36px)', width: '100%', overflow: 'hidden' }}>
        <AdvancedRealTimeChart
          symbol="BTCUSD"
          theme="dark"
          autosize
          allow_symbol_change
        />
      </div>
    </div>
  )
}

// ─── Widget catalog + renderer ────────────────────────────────────────────────
const WIDGET_CATALOG = [
  { type: 'map',      label: 'ATLAS',        icon: '🗺' },
  { type: 'feeds',    label: 'Feeds',        icon: '🌐' },
  { type: 'feed',     label: 'News Search',  icon: '📡' },
  { type: 'rss',      label: 'RSS Feed',     icon: '📰' },
  { type: 'prices',   label: 'Price Tracker',icon: '📈' },
  { type: 'stream',   label: 'Livestream',   icon: '📺' },
  { type: 'weather',  label: 'Weather',      icon: '🌤' },
  { type: 'conflict', label: 'CONFLICT',     icon: '⚔️' },
  { type: 'chart',    label: 'TV Chart',     icon: '📊' },
]

// Default dimensions when adding via picker
const WIDGET_DEFAULTS = {
  map:      { w: 8, h: 11 },
  feeds:    { w: 8, h: 11 },
  feed:     { w: 4, h: 11 },
  rss:      { w: 3, h: 8  },
  prices:   { w: 3, h: 8  },
  stream:   { w: 3, h: 8  },
  weather:  { w: 3, h: 8  },
  conflict: { w: 6, h: 11 },
  chart:    { w: 6, h: 11 },
}

function renderWidgetComponent(widget, { onClose, onFullscreen, isFullscreen, onCollapse, collapsed, settings, updateSetting }) {
  const p = { onClose, onFullscreen, isFullscreen, onCollapse, collapsed }
  switch (widget.type) {
    case 'map':      return <AtlasWidget  {...p} />
    case 'feeds':    return <FeedsWidget  {...p} />
    case 'feed':     return <KeywordFeed  {...p} initialUrl={settings.keywordFeedUrl} onUrlChange={url  => updateSetting('keywordFeedUrl', url)} />
    case 'rss':      return <RssFeed      {...p} initialUrl={settings.rssFeedUrl}     onUrlChange={url  => updateSetting('rssFeedUrl', url)} />
    case 'prices':   return <PriceTracker {...p} />
    case 'stream':   return <Livestream   {...p} initialUrl={settings.livestreamUrl}  onUrlChange={url  => updateSetting('livestreamUrl', url)} />
    case 'weather':  return <Weather      {...p} initialCity={settings.weatherCity}   onCityChange={city => updateSetting('weatherCity', city)} />
    case 'conflict': return <ConflictFeed {...p} />
    case 'chart':    return <ChartWidget  {...p} />
    default:         return null
  }
}

function AddWidgetModal({ onAdd, onClose }) {
  return (
    <div className="modal-overlay" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Add Widget</span>
          <button className="widget-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-grid">
          {WIDGET_CATALOG.map(w => (
            <button key={w.type} className="modal-card" onClick={() => onAdd(w.type)}>
              <span className="modal-card-icon">{w.icon}</span>
              <span className="modal-card-label">{w.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Default layout ───────────────────────────────────────────────────────────
const DEFAULT_LAYOUT = [
  { i: 'atlas',   x: 0, y: 0,  w: 8, h: 14 },
  { i: 'feed',    x: 8, y: 0,  w: 4, h: 14 },
  { i: 'rss',     x: 0, y: 14, w: 3, h: 10 },
  { i: 'prices',  x: 3, y: 14, w: 3, h: 10 },
  { i: 'stream',  x: 6, y: 14, w: 3, h: 10 },
  { i: 'weather', x: 9, y: 14, w: 3, h: 10 },
]

const wsKey = id => `vigil_workspace_${id.replace('ws-', '')}`

// ─── Layout version — bump to force-reset all saved layouts on next load ─────
const LAYOUT_VERSION     = 3
const LAYOUT_VERSION_KEY = 'vigil_layout_version'
;(function initLayoutVersion() {
  try {
    const stored = parseInt(localStorage.getItem(LAYOUT_VERSION_KEY) ?? '0', 10)
    if (stored < LAYOUT_VERSION) {
      const toRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('vigil_workspace_') || /vigil_ws\d+_widgets/.test(k))) toRemove.push(k)
      }
      toRemove.forEach(k => localStorage.removeItem(k))
      localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION))
    }
  } catch {}
})()

function readLayout(wsId) {
  try {
    const raw = localStorage.getItem(wsKey(wsId))
    return raw ? JSON.parse(raw) : DEFAULT_LAYOUT
  } catch { return DEFAULT_LAYOUT }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [workspaces,   setWorkspaces]   = useState(readWorkspacesMeta)
  const [activeWs,     setActiveWs]     = useState(() => readWorkspacesMeta()[0]?.id ?? 'ws-1')
  const [layout,       setLayout]       = useState(() => readLayout(readWorkspacesMeta()[0]?.id ?? 'ws-1'))
  const [settings,     setSettings]     = useState(() => readSettings(readWorkspacesMeta()[0]?.id ?? 'ws-1'))
  const [widgets,      setWidgets]      = useState(() => readWidgets(readWorkspacesMeta()[0]?.id ?? 'ws-1'))
  const [fullscreenId, setFullscreenId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [collapseMap,  setCollapseMap]  = useState({})  // { [widgetId]: savedH }
  const [saved,        setSaved]        = useState(false)

  const saveTimer         = useRef(null)
  const savedTimer        = useRef(null)
  const activeWsRef       = useRef(null)
  const layoutSnapshotRef = useRef(null)
  activeWsRef.current = activeWs

  function enterFullscreen(widgetId) {
    layoutSnapshotRef.current = layout.map(item => ({ ...item }))
    setFullscreenId(widgetId)
  }

  function exitFullscreen() {
    setFullscreenId(null)
    if (layoutSnapshotRef.current) {
      handleLayoutChange(layoutSnapshotRef.current)
      layoutSnapshotRef.current = null
    }
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100)
  }

  // ESC exits fullscreen
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && fullscreenId) exitFullscreen() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenId])

  function updateSetting(key, value) {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(settingsKey(activeWsRef.current), JSON.stringify(next))
      return next
    })
  }

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

  function switchWorkspace(wsId) {
    if (wsId === activeWsRef.current) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(layout))
    }
    setActiveWs(wsId)
    setLayout(readLayout(wsId))
    setSettings(readSettings(wsId))
    setWidgets(readWidgets(wsId))
    setFullscreenId(null)
    layoutSnapshotRef.current = null
    setCollapseMap({})
  }

  function renameWorkspace(wsId, newName) {
    const next = workspaces.map(w => w.id === wsId ? { ...w, name: newName } : w)
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY, JSON.stringify(next))
  }

  function addWorkspace() {
    if (workspaces.length >= 6) return
    const id   = `ws-${Date.now()}`
    // Name uses next integer, skipping any gaps from deletions
    const maxN = workspaces.reduce((m, w) => {
      const n = parseInt(w.name.replace('Workspace ', ''), 10)
      return isNaN(n) ? m : Math.max(m, n)
    }, workspaces.length)
    const name = `Workspace ${maxN + 1}`
    const next = [...workspaces, { id, name }]
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY, JSON.stringify(next))
    // Pre-save empty state so new workspace starts blank (not DEFAULT_WIDGETS)
    localStorage.setItem(widgetsKey(id), JSON.stringify([]))
    localStorage.setItem(wsKey(id),      JSON.stringify([]))
    switchWorkspace(id)
  }

  function deleteWorkspace(wsId) {
    if (workspaces.length <= 1) return
    const next = workspaces.filter(w => w.id !== wsId)
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY, JSON.stringify(next))
    localStorage.removeItem(wsKey(wsId))
    localStorage.removeItem(settingsKey(wsId))
    localStorage.removeItem(widgetsKey(wsId))
    if (wsId === activeWsRef.current) {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
      const fallback = next[0].id
      setActiveWs(fallback)
      setLayout(readLayout(fallback))
      setSettings(readSettings(fallback))
      setWidgets(readWidgets(fallback))
      setFullscreenId(null)
      layoutSnapshotRef.current = null
      setCollapseMap({})
    }
  }

  function duplicateWorkspace(wsId) {
    if (workspaces.length >= 6) return
    const src  = workspaces.find(w => w.id === wsId)
    const id   = `ws-${Date.now()}`
    const next = [...workspaces, { id, name: `${src.name} (copy)` }]
    setWorkspaces(next)
    localStorage.setItem(WS_META_KEY, JSON.stringify(next))
    localStorage.setItem(wsKey(id),       JSON.stringify(readLayout(wsId)))
    localStorage.setItem(settingsKey(id), JSON.stringify(readSettings(wsId)))
    localStorage.setItem(widgetsKey(id),  JSON.stringify(readWidgets(wsId)))
    switchWorkspace(id)
  }

  function addWidget(type) {
    const id          = `${type}-${Date.now()}`
    const nextWidgets = [...widgets, { id, type }]
    setWidgets(nextWidgets)
    localStorage.setItem(widgetsKey(activeWsRef.current), JSON.stringify(nextWidgets))
    const maxY       = layout.reduce((m, item) => Math.max(m, item.y + item.h), 0)
    const dims       = WIDGET_DEFAULTS[type] ?? { w: 4, h: 8 }
    const nextLayout = [...layout, { i: id, x: 0, y: maxY, ...dims }]
    setLayout(nextLayout)
    localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(nextLayout))
    setShowAddModal(false)
  }

  function removeWidget(widgetId) {
    const nextWidgets = widgets.filter(w => w.id !== widgetId)
    setWidgets(nextWidgets)
    localStorage.setItem(widgetsKey(activeWsRef.current), JSON.stringify(nextWidgets))
    const nextLayout = layout.filter(item => item.i !== widgetId)
    setLayout(nextLayout)
    localStorage.setItem(wsKey(activeWsRef.current), JSON.stringify(nextLayout))
    if (fullscreenId === widgetId) { setFullscreenId(null); layoutSnapshotRef.current = null }
    setCollapseMap(prev => { const next = { ...prev }; delete next[widgetId]; return next })
  }

  function toggleCollapse(widgetId) {
    const isCollapsed = !!collapseMap[widgetId]
    if (isCollapsed) {
      const savedH = collapseMap[widgetId]
      setLayout(prev => prev.map(item => item.i === widgetId ? { ...item, h: savedH } : item))
      setCollapseMap(prev => { const next = { ...prev }; delete next[widgetId]; return next })
    } else {
      const item = layout.find(i => i.i === widgetId)
      const savedH = item?.h ?? 8
      setLayout(prev => prev.map(i => i.i === widgetId ? { ...i, h: 1 } : i))
      setCollapseMap(prev => ({ ...prev, [widgetId]: savedH }))
    }
  }

  const fsWidget = fullscreenId ? widgets.find(w => w.id === fullscreenId) ?? null : null
  const fsCatalog = fsWidget ? WIDGET_CATALOG.find(c => c.type === fsWidget.type) : null

  return (
    <div className="app">
      <NavBar
        saved={saved}
        workspaces={workspaces}
        activeWs={activeWs}
        onSwitchWs={switchWorkspace}
        onRenameWs={renameWorkspace}
        onAddWs={addWorkspace}
        onDeleteWs={deleteWorkspace}
        onDuplicateWs={duplicateWorkspace}
        onShowAddModal={() => setShowAddModal(true)}
      />
      <div style={{ width: '100%', height: 'calc(100vh - 48px)', overflowY: 'auto', position: 'relative' }}>
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
          {widgets.map(widget => (
            <div key={widget.id} style={{ height: '100%', overflow: 'hidden' }}>
              {renderWidgetComponent(widget, {
                onClose:      () => removeWidget(widget.id),
                onFullscreen: () => enterFullscreen(widget.id),
                isFullscreen: false,
                onCollapse:   () => toggleCollapse(widget.id),
                collapsed:    !!collapseMap[widget.id],
                settings,
                updateSetting,
              })}
            </div>
          ))}
        </SizedGridLayout>

        <button className="fab-add" onClick={() => setShowAddModal(true)} title="Add widget">+</button>
      </div>

      {showAddModal && <AddWidgetModal onAdd={addWidget} onClose={() => setShowAddModal(false)} />}

      {fsWidget && createPortal(
        <div className="fullscreen-overlay">
          <div className="fs-bar">
            <span className="fs-bar-title">{fsCatalog?.icon} {fsCatalog?.label ?? 'Widget'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: '#3a4a5c', letterSpacing: '0.1em' }}>ESC to exit</span>
              <button className="fs-exit-btn" onClick={exitFullscreen}>⤡ Exit Fullscreen</button>
            </div>
          </div>
          <div className="fs-content">
            {renderWidgetComponent(fsWidget, {
              onClose:      () => { removeWidget(fullscreenId) },
              onFullscreen: exitFullscreen,
              isFullscreen: true,
              onCollapse:   undefined,
              collapsed:    false,
              settings,
              updateSetting,
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

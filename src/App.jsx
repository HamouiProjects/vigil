import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, memo } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ReactGridLayout as GridLayout, WidthProvider } from 'react-grid-layout/legacy'
import { TickerTape } from 'react-ts-tradingview-widgets'
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
        {badge && (
          <span className={`widget-badge${badgeActive ? '' : ' inactive'}`}>
            {badgeActive && <span className="badge-dot" />}
            {badge}
          </span>
        )}
        {onRefresh    && <button className="widget-btn" onClick={onRefresh} title="Refresh">↻</button>}
        {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
        {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
        {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
      </div>
    </div>
  )
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const SkeletonLine = memo(function SkeletonLine({ w = '100%', h = 11 }) {
  return <div className="skel-line" style={{ width: w, height: h }} />
})

// ─── Page visibility hook ─────────────────────────────────────────────────────
function usePageVisibility() {
  const [visible, setVisible] = useState(!document.hidden)
  useEffect(() => {
    const handler = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])
  return visible
}

function SkeletonFeedItems({ count = 6 }) {
  return (
    <div style={{ width: '100%' }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel-item">
          <SkeletonLine w={`${58 + (i % 3) * 12}%`} h={10} />
          <SkeletonLine w="28%" h={8} />
        </div>
      ))}
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

function mapPopupHtml(name, row2) {
  return `<div class="cmap-popup">
    <div class="cmap-popup-name">${name}</div>
    <div class="cmap-popup-row">${row2}</div>
  </div>`
}

function fireMarkerEvents(keyword, name, country, lat, lon) {
  window.dispatchEvent(new CustomEvent('vigil:search',   { detail: { keyword } }))
  window.dispatchEvent(new CustomEvent('vigil:location', { detail: { name, country: country || '', lat, lon } }))
  window.dispatchEvent(new CustomEvent('vigil:region',   { detail: { country: country || name } }))
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
    setLoading(true); onLoadingChange?.(true)

    // Earthquakes (USGS)
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

    // Storms (NOAA)
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

  // Capture show* in a ref so the map-init effect can read their current values
  // without being a dependency (map should only init once).
  const showRef = useRef({ showConflicts, showNatural, showPiracy })
  showRef.current = { showConflicts, showNatural, showPiracy }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: initViewRef.current.center, zoom: initViewRef.current.zoom, zoomControl: true })
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
        `${evt.typeStr} · <span class="cmap-status-${evt.status}">${evt.status}</span>`
      ), { className: 'cmap-popup-wrap', maxWidth: 220, minWidth: 170 })
      mk.on('click', () => fireMarkerEvents(
        `${evt.name} ${evt.country}`.trim(), evt.name, evt.country, evt.lat, evt.lng
      ))
      layerConflict.current.addLayer(mk)
    })

    // Static: wildfires
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

const ATLAS_STATE_KEY   = id => `vigil_atlas_state_${id}`
const ATLAS_TOOLBAR_KEY = id => `vigil_atlas_toolbar_collapsed_${id}`

function readAtlasState(id) {
  try { return JSON.parse(localStorage.getItem(ATLAS_STATE_KEY(id)) || 'null') } catch { return null }
}

function AtlasWidget({ widgetId = 'atlas', onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const saved = readAtlasState(widgetId)

  const [showConflicts, setShowConflicts] = useState(saved?.showConflicts ?? true)
  const [showNatural,   setShowNatural]   = useState(saved?.showNatural   ?? true)
  const [showPiracy,    setShowPiracy]    = useState(saved?.showPiracy    ?? true)
  const [mapMode,       setMapMode]       = useState(saved?.mapMode       ?? 'leaflet')
  const [iframeSrc,     setIframeSrc]     = useState(saved?.iframeSrc     ?? '')
  const [dataLoading,   setDataLoading]   = useState(false)
  const [toolbarOpen,   setToolbarOpen]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(ATLAS_TOOLBAR_KEY(widgetId)) ?? 'false') } catch { return false }
  })
  const atlasRef      = useRef(null)
  const currentViewRef = useRef({ center: saved?.center ?? [20, 0], zoom: saved?.zoom ?? 2 })

  function saveState(patch) {
    try {
      const cur = JSON.parse(localStorage.getItem(ATLAS_STATE_KEY(widgetId)) || '{}')
      localStorage.setItem(ATLAS_STATE_KEY(widgetId), JSON.stringify({ ...cur, ...patch }))
    } catch {}
  }

  // Persist layer/mode toggles whenever they change
  useEffect(() => {
    saveState({ showConflicts, showNatural, showPiracy, mapMode, iframeSrc })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showConflicts, showNatural, showPiracy, mapMode, iframeSrc])

  useEffect(() => {
    try { localStorage.setItem(ATLAS_TOOLBAR_KEY(widgetId), JSON.stringify(toolbarOpen)) } catch {}
  }, [toolbarOpen, widgetId])

  // Portal (fullscreen) instance: broadcast latest view on unmount so grid instance can sync
  useEffect(() => {
    if (!isFullscreen) return
    return () => {
      window.dispatchEvent(new CustomEvent('vigil:atlas-exit-fs', {
        detail: { widgetId, center: currentViewRef.current.center, zoom: currentViewRef.current.zoom },
      }))
    }
  }, [isFullscreen, widgetId])

  // Grid instance: on fullscreen exit event, restore the view the user left at
  useEffect(() => {
    if (isFullscreen) return
    function onExitFs(e) {
      if (e.detail?.widgetId !== widgetId) return
      const { center, zoom } = e.detail
      currentViewRef.current = { center, zoom }
      saveState({ center, zoom })
      setTimeout(() => atlasRef.current?.setView(center, zoom), 250) // after invalidateSize
    }
    window.addEventListener('vigil:atlas-exit-fs', onExitFs)
    return () => window.removeEventListener('vigil:atlas-exit-fs', onExitFs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, widgetId])

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
          <span className={`widget-badge${dataLoading ? ' inactive' : ''}`}>
            {!dataLoading && <span className="badge-dot" />}
            LIVE
          </span>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>

      {/* Slim indicator bar — always visible, click to expand/collapse toolbar */}
      <div className="atlas-slim-bar" onPointerDownCapture={e => e.stopPropagation()} onClick={() => setToolbarOpen(v => !v)}>
        <div className="atlas-dot-row">
          {isLeaflet ? (
            <>
              <span className="atlas-dot" style={{ background: showConflicts ? '#e53935' : '#1e2d3d' }} />
              <span className="atlas-dot" style={{ background: showNatural   ? '#43a047' : '#1e2d3d' }} />
              <span className="atlas-dot" style={{ background: showPiracy    ? '#00acc1' : '#1e2d3d' }} />
              <span className="atlas-mode-label">ATLAS</span>
            </>
          ) : (
            <>
              <span className="atlas-dot" style={{ background: iframeSrc.includes('adsbexchange')   ? '#42a5f5' : '#1e2d3d' }} />
              <span className="atlas-dot" style={{ background: iframeSrc.includes('myshiptracking') ? '#26c6da' : '#1e2d3d' }} />
              <span className="atlas-dot" style={{ background: iframeSrc.includes('checkpoint')     ? '#ab47bc' : '#1e2d3d' }} />
              <span className="atlas-mode-label">
                {iframeSrc.includes('adsbexchange') ? 'FLIGHTS' : iframeSrc.includes('myshiptracking') ? 'MARINE' : iframeSrc.includes('checkpoint') ? 'CYBER' : 'LIVE FEED'}
              </span>
            </>
          )}
        </div>
        <span className="atlas-chevron">{toolbarOpen ? '▲' : '▼'}</span>
      </div>

      {/* Collapsible toolbar rows */}
      <div className={`atlas-toolbar-wrap${toolbarOpen ? ' open' : ''}`} onPointerDownCapture={e => e.stopPropagation()}>
        {/* Row 1: data overlay layers */}
        <div className="cmap-layer-bar">
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
          {isLeaflet && (
            <button className="cmap-update-btn" onClick={() => atlasRef.current?.refresh()} title="Re-fetch live data">⟳ Update</button>
          )}
          {!isLeaflet && (
            <button className="cmap-update-btn" onClick={() => setMapMode('leaflet')} title="Back to ATLAS map">← ATLAS</button>
          )}
        </div>

        {/* Row 2: live iframe feeds */}
        <div className="cmap-feeds-bar">
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
        </div>
      </div>

      {dataLoading && (
        <div className="atlas-loading-bar">
          <span style={{ fontSize: '8px', color: '#2a3a4a', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>LOADING DATA LAYERS</span>
          <div className="skel-line" />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }}>
        {isLeaflet ? (
          <AtlasMap
            ref={atlasRef}
            showConflicts={showConflicts}
            showNatural={showNatural}
            showPiracy={showPiracy}
            onLoadingChange={setDataLoading}
            initialCenter={currentViewRef.current.center}
            initialZoom={currentViewRef.current.zoom}
            onMove={({ center, zoom }) => {
              currentViewRef.current = { center, zoom }
              saveState({ center, zoom })
            }}
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
  { id: 'worldwide',    label: '🌍 WORLDWIDE',     src: 'https://liveuamap.com'                    },
  { id: 'ukraine',      label: '🇺🇦 UKRAINE',      src: 'https://liveuamap.com/en/ukraine'         },
  { id: 'middleeast',   label: '🌙 MIDDLE EAST',   src: 'https://liveuamap.com/en/middleeast'      },
  { id: 'israel',       label: '🇮🇱 ISRAEL/GAZA',  src: 'https://liveuamap.com/en/israel'          },
  { id: 'syria',        label: '🇸🇾 SYRIA',        src: 'https://liveuamap.com/en/syria'           },
  { id: 'yemen',        label: '🇾🇪 YEMEN',        src: 'https://liveuamap.com/en/yemen'           },
  { id: 'sudan',        label: '🇸🇩 SUDAN',        src: 'https://liveuamap.com/en/sudan'           },
  { id: 'africa',       label: '🌍 AFRICA',        src: 'https://liveuamap.com/en/africa'          },
  { id: 'libya',        label: '🇱🇾 LIBYA',        src: 'https://liveuamap.com/en/libya'           },
  { id: 'iraq',         label: '🇮🇶 IRAQ',         src: 'https://liveuamap.com/en/iraq'            },
  { id: 'afghanistan',  label: '🇦🇫 AFGHANISTAN',  src: 'https://liveuamap.com/en/afghanistan'     },
  { id: 'asia',         label: '🌏 ASIA',          src: 'https://liveuamap.com/en/asia'            },
  { id: 'myanmar',      label: '🇲🇲 MYANMAR',      src: 'https://liveuamap.com/en/myanmar'         },
  { id: 'latinamerica', label: '🌎 LATIN AMERICA', src: 'https://liveuamap.com/en/latinamerica'    },
  { id: 'usa',          label: '🇺🇸 USA',          src: 'https://liveuamap.com/en/usa'             },
  { id: 'russia',       label: '🇷🇺 RUSSIA',       src: 'https://liveuamap.com/en/russia'          },
]

const REGION_SLUG_MAP = {
  ukraine: 'ukraine', kyiv: 'ukraine',
  sudan: 'sudan', khartoum: 'sudan',
  syria: 'syria', idlib: 'syria',
  yemen: 'yemen',
  israel: 'israel', palestine: 'israel', gaza: 'israel',
  iraq: 'iraq', baghdad: 'iraq',
  libya: 'libya', tripoli: 'libya',
  afghanistan: 'afghanistan', kabul: 'afghanistan',
  myanmar: 'myanmar', rangoon: 'myanmar',
  russia: 'russia', moscow: 'russia',
  usa: 'usa',
  myanmar2: 'myanmar', pakistan: 'asia', india: 'asia', philippines: 'asia',
  drc: 'africa', nigeria: 'africa', ethiopia: 'africa', mozambique: 'africa', mali: 'africa',
}

// ─── CONFLICT (LiveUAMap) ─────────────────────────────────────────────────────
function ConflictFeed({ onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="CONFLICT" badge="LIVE" badgeActive={true} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <iframe
        src="https://liveuamap.com"
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="CONFLICT"
        allowFullScreen
      />
    </div>
  )
}


// ─── Shared tooltip ───────────────────────────────────────────────────────────
function InfoTooltip({ text, wide }) {
  return (
    <span className="info-tip-wrap">
      <span className="info-tip-btn">?</span>
      <span className={`info-tip-box${wide ? ' info-tip-box-wide' : ''}`}>{text}</span>
    </span>
  )
}

// ─── News Search (Google News RSS via rss2json) ───────────────────────────────
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
    title:       item.title       ?? '(no title)',
    link:        item.link        ?? '',
    pubDate:     item.pubDate     ?? '',
    source:      item.author      ?? '',
    description: (item.description ?? '').replace(/<[^>]*>/g, ''),
  }))
}

function nsExtractSource(title) {
  const parts = (title ?? '').split(' - ')
  return parts.length > 1 ? parts[parts.length - 1].trim() : ''
}
function nsCleanTitle(title) {
  const parts = (title ?? '').split(' - ')
  return parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : (title ?? '')
}

const KF_DEFAULT_TABS = [
  { id: 'world',     keyword: 'World'     },
  { id: 'conflicts', keyword: 'Conflicts' },
  { id: 'economy',   keyword: 'Economy'   },
]
const KF_TABS_KEY = 'vigil_newssearch_tabs'

function KeywordFeed({ widgetId = 'newssearch', onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [tabs, setTabs] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KF_TABS_KEY) || 'null')
      return Array.isArray(s) && s.length ? s : KF_DEFAULT_TABS
    } catch { return KF_DEFAULT_TABS }
  })
  const [activeId,    setActiveId]    = useState(() => tabs[0]?.id ?? 'world')
  const [cache,       setCache]       = useState({})
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [adding,      setAdding]      = useState(false)
  const [newKw,       setNewKw]       = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(`vigil_newssearch_sidebar_collapsed_${widgetId}`)
      return stored === null ? true : !JSON.parse(stored)
    } catch { return true }
  })

  const tabsRef  = useRef(tabs);  tabsRef.current  = tabs
  const cacheRef = useRef(cache); cacheRef.current = cache

  useEffect(() => {
    try { localStorage.setItem(`vigil_newssearch_sidebar_collapsed_${widgetId}`, JSON.stringify(!sidebarOpen)) } catch {}
  }, [sidebarOpen, widgetId])

  function saveTabs(next) {
    setTabs(next)
    try { localStorage.setItem(KF_TABS_KEY, JSON.stringify(next)) } catch {}
  }

  const load = useCallback(async (tabId, keyword) => {
    setLoading(true); setError(null)
    try {
      const items = await fetchNewsSearch(keyword)
      setCache(prev => ({ ...prev, [tabId]: { items: items.slice(0, 50), fetchedAt: Date.now() } }))
    } catch (e) {
      setError(e.message === 'No results' ? 'No results' : 'Search unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const tab = tabsRef.current.find(t => t.id === activeId)
    if (!tab) return
    const entry = cacheRef.current[activeId]
    if (entry && Date.now() - entry.fetchedAt < 5 * 60_000) return
    load(activeId, tab.keyword)
  }, [activeId, load])

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return
      const tab = tabsRef.current.find(t => t.id === activeId)
      if (tab) load(activeId, tab.keyword)
    }, 120_000)
    return () => clearInterval(id)
  }, [activeId, load])

  const isVisible = usePageVisibility()
  useEffect(() => {
    if (!isVisible) return
    const tab   = tabsRef.current.find(t => t.id === activeId)
    const entry = cacheRef.current[activeId]
    if (tab && (!entry || Date.now() - entry.fetchedAt > 5 * 60_000)) load(activeId, tab.keyword)
  }, [isVisible, activeId, load])

  useEffect(() => {
    function onSearch(e) {
      const kw = e.detail?.keyword?.trim()
      if (!kw) return
      const existing = tabsRef.current.find(t => t.keyword.toLowerCase() === kw.toLowerCase())
      if (existing) { setActiveId(existing.id); return }
      const id   = `tab-${Date.now()}`
      const next = [...tabsRef.current, { id, keyword: kw }]
      saveTabs(next)
      setActiveId(id)
    }
    window.addEventListener('vigil:search', onSearch)
    return () => window.removeEventListener('vigil:search', onSearch)
  }, [])

  function addTab() {
    const kw = newKw.trim()
    if (!kw) { setAdding(false); return }
    const id = `tab-${Date.now()}`
    saveTabs([...tabs, { id, keyword: kw }])
    setActiveId(id)
    setNewKw(''); setAdding(false)
  }

  function removeTab(id) {
    const next = tabs.filter(t => t.id !== id)
    if (!next.length) return
    saveTabs(next)
    if (activeId === id) setActiveId(next[0].id)
  }

  function handleRefresh() {
    const tab = tabs.find(t => t.id === activeId)
    if (!tab || loading) return
    setCache(prev => { const next = { ...prev }; delete next[activeId]; return next })
    load(activeId, tab.keyword)
  }

  const activeTab      = tabs.find(t => t.id === activeId)
  const keyword        = activeTab?.keyword?.toLowerCase() ?? ''
  const rawArticles    = cache[activeId]?.items ?? []
  const filtered       = rawArticles.filter(art =>
    art.title?.toLowerCase().includes(keyword) ||
    art.description?.toLowerCase().includes(keyword)
  )
  const showFallback    = filtered.length === 0 && rawArticles.length > 0
  const displayArticles = filtered.length > 0 ? filtered : rawArticles

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">NEWS SEARCH</span>
        <InfoTooltip wide text={
          <span>
            <strong className="ns-tip-head">News Search</strong>
            Searches Google News worldwide for your saved keywords. Results are sorted by recency and filtered to match your keyword in the headline.
            <br /><br />
            📌 <strong>Best for:</strong> broad topic monitoring across all sources worldwide (e.g. "Iran nuclear deal", "Federal Reserve").
            <br /><br />
            📰 <strong>Want specific outlets?</strong> Use the RSS Feed widget — add BBC, Reuters, Al Jazeera, or any source you trust, then filter by keyword there.
            <br /><br />
            💡 <strong>Tip:</strong> More specific keywords (e.g. "Strait of Hormuz blockade") return better results than single words (e.g. "Qatar").
          </span>
        } />
        <div className="widget-actions">
          <span className={`widget-badge${loading || error ? ' inactive' : ''}`}>{loading ? 'LOADING' : error ? 'ERROR' : 'LIVE'}</span>
          <button className="widget-btn" onClick={handleRefresh} title="Refresh">
            <span style={loading ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>↻</span>
          </button>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>

      <div className="ns-body" onPointerDownCapture={e => e.stopPropagation()}>
        {sidebarOpen ? (
          <div className="ns-sidebar">
            <div className="ns-sidebar-header">
              <span className="ns-sidebar-title">KEYWORDS</span>
              <button className="ns-sidebar-toggle" onClick={() => setSidebarOpen(false)} title="Collapse">‹</button>
            </div>
            <div className="ns-keyword-list">
              {tabs.map(t => (
                <div
                  key={t.id}
                  className={`ns-kw-item${activeId === t.id ? ' active' : ''}`}
                  onClick={() => setActiveId(t.id)}
                >
                  <span className="ns-kw-text">{t.keyword}</span>
                  {tabs.length > 1 && (
                    <button className="ns-kw-del" onClick={e => { e.stopPropagation(); removeTab(t.id) }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <div className="ns-sidebar-footer">
              {adding ? (
                <form className="ns-add-form" onSubmit={e => { e.preventDefault(); addTab() }}>
                  <input
                    autoFocus
                    className="ns-add-input"
                    value={newKw}
                    onChange={e => setNewKw(e.target.value)}
                    placeholder="keyword…"
                    onBlur={() => { if (!newKw.trim()) setAdding(false) }}
                  />
                </form>
              ) : (
                <button className="ns-add-btn" onClick={() => setAdding(true)}>+ Add</button>
              )}
            </div>
          </div>
        ) : (
          <div className="ns-slim-strip" onClick={() => setSidebarOpen(true)} title="Expand keywords">
            <span className="ns-slim-chevron">›</span>
          </div>
        )}

        <div className="ns-results">
          {tabs.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📡</span>
              Add a keyword above to start monitoring
            </div>
          ) : loading && rawArticles.length === 0 ? (
            <SkeletonFeedItems count={8} />
          ) : error && rawArticles.length === 0 ? (
            <div className="widget-error">
              <span className="widget-error-icon">⚠</span>
              Google News unavailable
              <button className="widget-error-retry" onClick={() => { setError(null); handleRefresh() }}>Retry ↺</button>
            </div>
          ) : (
            <div className="feed-list">
              {showFallback && (
                <div className="ns-fallback-msg">
                  No headlines matched "{activeTab?.keyword}" exactly — showing related results
                </div>
              )}
              {displayArticles.map((art, i) => {
                const src   = nsExtractSource(art.title) || art.source
                const title = nsCleanTitle(art.title)
                return (
                  <a
                    key={i}
                    className={`ns-result-item${showFallback ? ' ns-dim' : ''}`}
                    href={art.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ns-result-title">{title}</div>
                    <div className="ns-result-meta">
                      {src && <span className="ns-result-source">{src}</span>}
                      <span className="ns-result-time">{rssRelTime(art.pubDate)}</span>
                    </div>
                  </a>
                )
              })}
              {displayArticles.length > 0 && <div className="attr-line">via Google News · rss2json</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── RSS Feed (multi-feed with keyword filter) ────────────────────────────────
const RSS_DEFAULT_FEEDS = [
  { id: 'bbc',       name: 'BBC News',      url: 'https://feeds.bbci.co.uk/news/rss.xml',            enabled: true, color: '#e63946' },
  { id: 'aljazeera', name: 'Al Jazeera',    url: 'https://www.aljazeera.com/xml/rss/all.xml',         enabled: true, color: '#00b894' },
  { id: 'france24',  name: 'France 24',     url: 'https://www.france24.com/en/rss',                   enabled: true, color: '#0984e3' },
  { id: 'guardian',  name: 'The Guardian',  url: 'https://www.theguardian.com/world/rss',             enabled: true, color: '#a29bfe' },
  { id: 'dw',        name: 'DW News',       url: 'https://rss.dw.com/rdf/rss-en-all',                enabled: true, color: '#fdcb6e' },
  { id: 'mee',       name: 'Mid East Eye',  url: 'https://www.middleeasteye.net/rss',                 enabled: true, color: '#00b894' },
  { id: 'rt',        name: 'RT News',       url: 'https://www.rt.com/rss/',                          enabled: true, color: '#fd79a8' },
]
const RSS_EXTRA_COLORS = ['#fd79a8', '#fdcb6e', '#e17055', '#74b9ff', '#55efc4', '#636e72']
const RSS_BROKEN_DOMAINS = ['feeds.reuters.com', 'feeds.apnews.com', 'foxnews.com', 'haaretz.com', 'arabnews.com']
const RSS_SUGGESTIONS = [
  { name: 'BBC News',        url: 'https://feeds.bbci.co.uk/news/rss.xml',                       color: '#bb1919' },
  { name: 'BBC World',       url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                  color: '#bb1919' },
  { name: 'Al Jazeera',      url: 'https://www.aljazeera.com/xml/rss/all.xml',                    color: '#009966' },
  { name: 'France 24',       url: 'https://www.france24.com/en/rss',                              color: '#003f8a' },
  { name: 'The Guardian',    url: 'https://www.theguardian.com/world/rss',                        color: '#005689' },
  { name: 'Guardian US',     url: 'https://www.theguardian.com/us-news/rss',                      color: '#005689' },
  { name: 'DW News',         url: 'https://rss.dw.com/rdf/rss-en-all',                           color: '#c8102e' },
  { name: 'Fox News',        url: 'https://moxie.foxnews.com/google-publisher/latest.xml',        color: '#003366' },
  { name: 'NPR News',        url: 'https://feeds.npr.org/1001/rss.xml',                          color: '#4a235a' },
  { name: 'CNN',             url: 'http://rss.cnn.com/rss/edition.rss',                          color: '#cc0000' },
  { name: 'NBC News',        url: 'https://feeds.nbcnews.com/nbcnews/public/news',               color: '#0a356d' },
  { name: 'The Hindu',       url: 'https://www.thehindu.com/news/international/?service=rss',    color: '#8b0000' },
  { name: 'Times of India',  url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms',  color: '#d32f2f' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss',                           color: '#1a6b3c' },
  { name: 'Haaretz',         url: 'https://www.haaretz.com/cmlink/1.628752',                     color: '#00356b' },
  { name: 'Arab News',       url: 'https://www.arabnews.com/rss.xml',                            color: '#006400' },
  { name: 'RT News',         url: 'https://www.rt.com/rss/',                                     color: '#7a0000' },
  { name: 'CGTN',            url: 'https://www.cgtn.com/subscribe/rss/section/world.xml',        color: '#c8102e' },
  { name: 'Politico',        url: 'https://rss.politico.com/politics-news.xml',                  color: '#1a1a2e' },
  { name: 'Foreign Policy',  url: 'https://foreignpolicy.com/feed/',                             color: '#2c3e50' },
  { name: 'The Economist',   url: 'https://www.economist.com/the-world-this-week/rss.xml',       color: '#e2001a' },
]

function rssRelTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1)    return 'now'
    if (diff < 60)   return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch { return '—' }
}

function ensureFeedColor(feed, idx) {
  return feed.color ? feed : { ...feed, color: RSS_EXTRA_COLORS[idx % RSS_EXTRA_COLORS.length] }
}

function RssFeed({ widgetId = 'rss', onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const storageKey = `vigil_rss_feeds_${widgetId}`

  const [feeds, setFeeds] = useState(() => {
    try {
      // Migrate from old single default-id key
      const OLD_KEY = 'vigil_rss_feeds_rss'
      if (!localStorage.getItem(storageKey) && localStorage.getItem(OLD_KEY)) {
        const m = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null')
        localStorage.removeItem(OLD_KEY)
        if (Array.isArray(m) && m.length) {
          const cleaned = m.filter(f => !RSS_BROKEN_DOMAINS.some(d => (f.url ?? '').includes(d))).map(ensureFeedColor)
          const result  = cleaned.length ? cleaned : RSS_DEFAULT_FEEDS
          localStorage.setItem(storageKey, JSON.stringify(result))
          return result
        }
      }
      // Legacy v1: single url string
      const oldUrl = localStorage.getItem(`vigil_rss_url_${widgetId}`)
      if (oldUrl) {
        localStorage.removeItem(`vigil_rss_url_${widgetId}`)
        const migrated = [...RSS_DEFAULT_FEEDS, { id: 'my-feed', name: 'My Feed', url: oldUrl, enabled: true, color: RSS_EXTRA_COLORS[0] }]
        localStorage.setItem(storageKey, JSON.stringify(migrated))
        return migrated
      }
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (Array.isArray(saved) && saved.length) {
        // Strip broken URLs
        const cleaned = saved.filter(f => !RSS_BROKEN_DOMAINS.some(d => (f.url ?? '').includes(d))).map(ensureFeedColor)
        if (!cleaned.length) { localStorage.setItem(storageKey, JSON.stringify(RSS_DEFAULT_FEEDS)); return RSS_DEFAULT_FEEDS }
        if (cleaned.length < saved.length) localStorage.setItem(storageKey, JSON.stringify(cleaned))
        return cleaned
      }
      return RSS_DEFAULT_FEEDS
    } catch { return RSS_DEFAULT_FEEDS }
  })

  const [itemsByFeed,  setItemsByFeed]  = useState({})
  const [errorByFeed,  setErrorByFeed]  = useState({})
  const [loading,      setLoading]      = useState(true)
  const [lastRefresh,  setLastRefresh]  = useState(null)
  const [timeAgo,      setTimeAgo]      = useState('')
  const [filterInput,  setFilterInput]  = useState(() => {
    try { return localStorage.getItem(`vigil_rss_keyword_${widgetId}`) ?? '' } catch { return '' }
  })
  const [filter,       setFilter]       = useState(() => {
    try { return localStorage.getItem(`vigil_rss_keyword_${widgetId}`) ?? '' } catch { return '' }
  })
  const [activeSource, setActiveSource] = useState(() => {
    try { return localStorage.getItem(`vigil_rss_active_source_${widgetId}`) ?? 'all' } catch { return 'all' }
  })
  const [density,      setDensity]      = useState(() => {
    try { return localStorage.getItem(`vigil_rss_density_${widgetId}`) ?? 'compact' } catch { return 'compact' }
  })
  const [addingSource, setAddingSource] = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newUrl,       setNewUrl]       = useState('')
  const [addError,     setAddError]     = useState('')
  const [showSugs,     setShowSugs]     = useState(false)
  const [savedFilters, setSavedFilters] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`vigil_rss_filters_${widgetId}`) || 'null')
      return Array.isArray(s) ? s : ['Iran', 'Gaza', 'Ukraine', 'Strait of Hormuz']
    } catch { return ['Iran', 'Gaza', 'Ukraine', 'Strait of Hormuz'] }
  })
  const [addingFilter, setAddingFilter] = useState(false)
  const [newFilter,    setNewFilter]    = useState('')

  const seenRef        = useRef(new Set())
  const [seenVersion,  setSeenVersion]  = useState(0)
  const filterTimerRef = useRef(null)
  const feedsRef       = useRef(feeds); feedsRef.current = feeds
  const isVisibleRss   = usePageVisibility()

  // Reset to 'all' on mount if saved value is not 'all' or a valid current feed id
  useEffect(() => {
    const saved = localStorage.getItem(`vigil_rss_active_source_${widgetId}`)
    if (saved && saved !== 'all' && !feeds.some(f => f.id === saved)) {
      setActiveSource('all')
      try { localStorage.setItem(`vigil_rss_active_source_${widgetId}`, 'all') } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveFeeds(next) {
    setFeeds(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  function feedColor(feedId) {
    return feedsRef.current.find(f => f.id === feedId)?.color ?? '#4a6a8a'
  }

  function markSeen(link) {
    if (!link || seenRef.current.has(link)) return
    seenRef.current.add(link)
    setSeenVersion(v => v + 1)
  }

  const fetchAll = useCallback(async () => {
    const enabled = feedsRef.current.filter(f => f.enabled)
    if (!enabled.length) { setLoading(false); return }
    setLoading(true)
    const results = await Promise.allSettled(
      enabled.map(f =>
        fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}`,
          { signal: AbortSignal.timeout(15000) }).then(r => r.json())
      )
    )
    const newErrors = {}
    setItemsByFeed(prev => {
      const next = { ...prev }
      enabled.forEach((f, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value?.status === 'ok') {
          next[f.id] = (r.value.items ?? []).map(item => ({
            title:       item.title       ?? '',
            link:        item.link        ?? '',
            pubDate:     item.pubDate     ?? '',
            description: (item.description ?? '').replace(/<[^>]+>/g, '').trim(),
            _feedId:     f.id,
            _feedName:   f.name,
            _category:   (item.categories?.[0] ?? '').trim(),
          }))
        } else {
          newErrors[f.id] = true
        }
      })
      return next
    })
    setErrorByFeed(prev => {
      const next = { ...prev }
      enabled.forEach(f => { if (!newErrors[f.id]) delete next[f.id] })
      return { ...next, ...newErrors }
    })
    setLastRefresh(Date.now())
    setLoading(false)
  }, [])

  async function retrySingleFeed(feed) {
    try {
      const res  = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`,
        { signal: AbortSignal.timeout(15000) })
      const json = await res.json()
      if (json?.status === 'ok') {
        setItemsByFeed(prev => ({
          ...prev,
          [feed.id]: (json.items ?? []).map(item => ({
            title:       item.title    ?? '',
            link:        item.link     ?? '',
            pubDate:     item.pubDate  ?? '',
            description: (item.description ?? '').replace(/<[^>]+>/g, '').trim(),
            _feedId:     feed.id,
            _feedName:   feed.name,
            _category:   (item.categories?.[0] ?? '').trim(),
          }))
        }))
        setErrorByFeed(prev => { const next = { ...prev }; delete next[feed.id]; return next })
      }
    } catch {}
  }

  function handleRefresh() {
    if (loading) return
    setItemsByFeed({})
    fetchAll()
  }

  useEffect(() => {
    fetchAll()
    const id = setInterval(() => { if (!document.hidden) fetchAll() }, 5 * 60_000)
    return () => clearInterval(id)
  }, [fetchAll, feeds])

  useEffect(() => { if (isVisibleRss) fetchAll() }, [isVisibleRss])

  useEffect(() => {
    const tick = () => {
      if (!lastRefresh) return
      const s = Math.floor((Date.now() - lastRefresh) / 1000)
      setTimeAgo(s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`)
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [lastRefresh])

  useEffect(() => {
    try { localStorage.setItem(`vigil_rss_active_source_${widgetId}`, activeSource) } catch {}
  }, [activeSource, widgetId])

  // Unread counts
  // eslint-disable-next-line no-unused-expressions
  seenVersion
  const unreadBySource = {}
  Object.entries(itemsByFeed).forEach(([feedId, items]) => {
    unreadBySource[feedId] = items.filter(item => !seenRef.current.has(item.link)).length
  })
  const totalUnread = Object.values(unreadBySource).reduce((s, n) => s + n, 0)

  const allItems = (() => {
    const seen = new Set()
    return Object.values(itemsByFeed)
      .flat()
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .filter(item => { if (seen.has(item.title)) return false; seen.add(item.title); return true })
  })()

  const sourceFilteredItems = activeSource === 'all'
    ? allItems
    : (itemsByFeed[activeSource] ?? []).slice().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))

  const displayItems = filter.trim()
    ? sourceFilteredItems.filter(item =>
        (item.title + ' ' + item.description).toLowerCase().includes(filter.toLowerCase())
      )
    : sourceFilteredItems

  const isFirstLoad      = loading && Object.keys(itemsByFeed).length === 0
  const activeSourceName = activeSource === 'all' ? 'all sources' : (feeds.find(f => f.id === activeSource)?.name ?? activeSource)

  const filteredSugs = newName.length > 0
    ? RSS_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(newName.toLowerCase()) && !feeds.some(f => f.url === s.url))
    : []

  function selectSuggestion(sug) {
    const newFeed = { id: `feed-${Date.now()}`, name: sug.name, url: sug.url, enabled: true, color: sug.color ?? RSS_EXTRA_COLORS[feeds.length % RSS_EXTRA_COLORS.length] }
    saveFeeds([...feeds, newFeed])
    setNewName(''); setNewUrl(''); setAddError(''); setAddingSource(false); setShowSugs(false)
  }

  function addFeed() {
    const name = newName.trim(), url = newUrl.trim()
    if (!name || !url) { setAddError('Name and URL required'); return }
    if (feeds.some(f => f.url === url)) { setAddError('Already added'); return }
    const newFeed = { id: `feed-${Date.now()}`, name, url, enabled: true, color: RSS_EXTRA_COLORS[feeds.length % RSS_EXTRA_COLORS.length] }
    saveFeeds([...feeds, newFeed])
    setNewName(''); setNewUrl(''); setAddError(''); setAddingSource(false); setShowSugs(false)
  }

  function removeFeed(id) {
    saveFeeds(feeds.filter(f => f.id !== id))
    setErrorByFeed(prev => { const next = { ...prev }; delete next[id]; return next })
    if (activeSource === id) setActiveSource('all')
  }

  function toggleFeed(id) {
    saveFeeds(feeds.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f))
  }

  function closeAddForm() {
    setAddingSource(false); setNewName(''); setNewUrl(''); setAddError(''); setShowSugs(false)
  }

  function saveSavedFilters(next) {
    setSavedFilters(next)
    try { localStorage.setItem(`vigil_rss_filters_${widgetId}`, JSON.stringify(next)) } catch {}
  }
  function applyFilter(kw) {
    clearTimeout(filterTimerRef.current)
    setFilterInput(kw); setFilter(kw)
    try { localStorage.setItem(`vigil_rss_keyword_${widgetId}`, kw) } catch {}
  }
  function removeFilter(kw) {
    saveSavedFilters(savedFilters.filter(x => x !== kw))
    if (filter === kw) {
      setFilterInput(''); setFilter('')
      try { localStorage.removeItem(`vigil_rss_keyword_${widgetId}`) } catch {}
    }
  }
  function addSavedFilter() {
    const kw = newFilter.trim()
    if (!kw || savedFilters.includes(kw)) { setNewFilter(''); setAddingFilter(false); return }
    saveSavedFilters([...savedFilters, kw])
    setNewFilter(''); setAddingFilter(false)
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">RSS FEED</span>
        <InfoTooltip wide text={
          <span>
            <strong className="ns-tip-head">RSS Feed</strong>
            Monitor specific outlets you trust. Add any RSS feed URL and filter by keyword to track topics across your chosen sources only.
            <br /><br />
            📡 <strong>Best for:</strong> following specific outlets (BBC, Al Jazeera, The Guardian) with keyword filtering.
            <br /><br />
            🔍 <strong>Want results from ALL sources worldwide?</strong> Use the News Search widget — it searches Google News globally.
            <br /><br />
            💡 <strong>Tip:</strong> Add niche sources — think-tanks, regional outlets, wire services. Any RSS URL works.
          </span>
        } />
        <div className="widget-actions">
          <span className={`widget-badge${loading ? ' inactive' : ''}`}>{loading ? 'LOADING' : 'LIVE'}</span>
          <button
            className="widget-btn"
            onClick={() => {
              const next = density === 'compact' ? 'comfortable' : 'compact'
              setDensity(next)
              try { localStorage.setItem(`vigil_rss_density_${widgetId}`, next) } catch {}
            }}
            title={density === 'compact' ? 'Comfortable view' : 'Compact view'}
          >{density === 'compact' ? '☰' : '≡'}</button>
          <button className="widget-btn" onClick={handleRefresh} title="Refresh">
            <span style={loading ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>↻</span>
          </button>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>

      <div className="rss-body">
        {/* LEFT SIDEBAR — always visible */}
        <div className="rss-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div className="rss-sidebar-label">SOURCES</div>
          <div className="rss-source-list">
            {/* All row */}
            <div
              className={`rss-source-item${activeSource === 'all' ? ' active' : ''}`}
              onClick={() => setActiveSource('all')}
            >
              <span className="rss-source-dot" style={{ background: '#00c6ff' }} />
              <span className="rss-source-name">All</span>
              {totalUnread > 0 && <span className="rss-source-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
            </div>
            {/* Per-source rows */}
            {feeds.map(f => {
              const unread = unreadBySource[f.id] ?? 0
              const hasErr = !!errorByFeed[f.id]
              return (
                <div
                  key={f.id}
                  className={`rss-source-item${activeSource === f.id ? ' active' : ''}${!f.enabled ? ' rss-source-off' : ''}`}
                  onClick={() => setActiveSource(f.id)}
                >
                  <span className="rss-source-dot" style={{ background: f.enabled ? f.color : '#2a3a4a' }} />
                  <span className="rss-source-name">{f.name}</span>
                  {unread > 0 && !hasErr && <span className="rss-source-badge">{unread > 99 ? '99+' : unread}</span>}
                  {hasErr && (
                    <span className="rss-source-err" title="Failed — click to retry"
                      onClick={e => { e.stopPropagation(); retrySingleFeed(f) }}>⚠</span>
                  )}
                  <button
                    className={`rss-source-toggle${f.enabled ? ' on' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleFeed(f.id) }}
                    title={f.enabled ? 'Disable' : 'Enable'}
                  />
                  <button
                    className="rss-source-del"
                    onClick={e => { e.stopPropagation(); removeFeed(f.id) }}
                    title="Remove"
                  >×</button>
                </div>
              )
            })}

            {/* Inline add-source form */}
            {addingSource && (
              <div className="rss-add-source-form" onPointerDownCapture={e => e.stopPropagation()}
                style={{ padding: '6px 8px', borderTop: '1px solid #1a2535' }}>
                <div className="rss-add-name-wrap">
                  <input
                    autoFocus
                    className="rss-add-source-input"
                    value={newName}
                    onChange={e => { setNewName(e.target.value); setNewUrl(''); setAddError(''); setShowSugs(true) }}
                    onFocus={() => setShowSugs(true)}
                    onBlur={() => setTimeout(() => setShowSugs(false), 160)}
                    placeholder="Source name…"
                  />
                  {showSugs && filteredSugs.length > 0 && (
                    <div className="rss-sug-dropdown">
                      {filteredSugs.slice(0, 5).map((s, i) => (
                        <div key={i} className="rss-sug-item" onMouseDown={() => selectSuggestion(s)}>
                          <span className="rss-sug-name">{s.name}</span>
                          <span className="rss-sug-url">{s.url}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  className="rss-add-source-input"
                  value={newUrl}
                  onChange={e => { setNewUrl(e.target.value); setAddError('') }}
                  placeholder="RSS URL…"
                  spellCheck={false}
                />
                {addError && <span style={{ fontSize: '8px', color: '#ff4d4f' }}>{addError}</span>}
                <div className="rss-add-source-actions">
                  <button className="rss-add-source-add" onClick={addFeed}>ADD</button>
                  <button className="rss-add-source-cancel" onClick={closeAddForm}>Cancel</button>
                </div>
              </div>
            )}
            <button className="rss-add-source-btn" style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
              onClick={() => setAddingSource(v => !v)}>
              ＋ Add Source
            </button>

            {/* FILTERS section */}
            <div className="rss-filters-divider">FILTERS</div>
            {savedFilters.map(kw => (
              <div
                key={kw}
                className={`rss-filter-item${filter === kw ? ' active' : ''}`}
                onClick={() => applyFilter(kw)}
              >
                <span className="rss-filter-label">{kw}</span>
                <button className="rss-source-del" onClick={e => { e.stopPropagation(); removeFilter(kw) }}>×</button>
              </div>
            ))}
            {addingFilter ? (
              <div style={{ padding: '4px 8px' }}>
                <input
                  autoFocus
                  className="rss-add-source-input"
                  value={newFilter}
                  onChange={e => setNewFilter(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addSavedFilter(); if (e.key === 'Escape') { setAddingFilter(false); setNewFilter('') } }}
                  placeholder="Keyword…"
                  style={{ width: '100%' }}
                />
              </div>
            ) : (
              <button className="rss-filter-add-btn" onClick={() => setAddingFilter(true)}>＋ Add filter</button>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="rss-filter-bar" onPointerDownCapture={e => e.stopPropagation()}>
            <input
              className="rss-input rss-filter-input"
              value={filterInput}
              onChange={e => {
                const v = e.target.value
                setFilterInput(v)
                clearTimeout(filterTimerRef.current)
                filterTimerRef.current = setTimeout(() => {
                  setFilter(v)
                  try { v ? localStorage.setItem(`vigil_rss_keyword_${widgetId}`, v) : localStorage.removeItem(`vigil_rss_keyword_${widgetId}`) } catch {}
                }, 150)
              }}
              placeholder="Filter headlines…"
            />
            {filterInput && (
              <button className="rss-filter-clear" onClick={() => {
                setFilterInput(''); setFilter('')
                try { localStorage.removeItem(`vigil_rss_keyword_${widgetId}`) } catch {}
              }} title="Clear filter">×</button>
            )}
            {filter && (
              <div className="rss-result-count">
                {displayItems.length} article{displayItems.length !== 1 ? 's' : ''} · filtered by "{filter}"
              </div>
            )}
          </div>

          {/* Article list */}
          <div className="rss-articles" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {isFirstLoad ? (
              <SkeletonFeedItems count={6} />
            ) : displayItems.length === 0 ? (
              filter ? (
                <div className="empty-state">
                  <span className="empty-state-icon">🔍</span>
                  No headlines matching "{filter}" in {activeSourceName}
                  <button className="widget-error-retry" style={{ marginTop: 6 }} onClick={() => { setFilterInput(''); setFilter('') }}>Clear filter</button>
                </div>
              ) : Object.keys(itemsByFeed).length === 0 && !loading ? (
                <div className="empty-state">
                  <span className="empty-state-icon">📰</span>
                  No articles available
                </div>
              ) : null
            ) : (
              <>
                {displayItems.map((item, i) => {
                  const color  = feedColor(item._feedId)
                  const isSeen = seenRef.current.has(item.link)
                  const desc   = item.description?.slice(0, 150)
                  return (
                    <a
                      key={i}
                      className={`rss-article${density === 'comfortable' ? ' rss-comfortable' : ''}${isSeen ? ' rss-seen' : ''}`}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markSeen(item.link)}
                    >
                      <div className="rss-art-body">
                        <div className="rss-art-meta">
                          <span className="rss-art-source" style={{ color }}>{item._feedName}</span>
                          {item._category && <span className="rss-art-section">· {item._category}</span>}
                          <span className="rss-art-time">· {rssRelTime(item.pubDate)}</span>
                        </div>
                        <div className="rss-art-title">{item.title}</div>
                        {density === 'comfortable' && desc && (
                          <div className="rss-art-desc">{desc}</div>
                        )}
                      </div>
                      <span className="rss-art-ext">→</span>
                    </a>
                  )
                })}
                <div className="rss-footer">
                  {lastRefresh && <span className="rss-updated-inline">Updated {timeAgo}</span>}
                  <div className="attr-line" style={{ borderTop: 'none', padding: '1px 0' }}>
                    via rss2json · {feeds.filter(f => f.enabled).map(f => f.name).join(', ')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Price Tracker ────────────────────────────────────────────────────────────
const COINGECKO_TO_TV = {
  'bitcoin':     'BINANCE:BTCUSDT',
  'ethereum':    'BINANCE:ETHUSDT',
  'solana':      'BINANCE:SOLUSDT',
  'cardano':     'BINANCE:ADAUSDT',
  'pax-gold':    'OANDA:XAUUSD',
  'tether-gold': 'OANDA:XAUUSD',
}
const PT_ASSET_COLORS = {
  'bitcoin':  '#f7931a',
  'ethereum': '#627eea',
  'solana':   '#9945ff',
  'pax-gold': '#d4af37',
}

const PT_DEFAULT_ASSETS = [
  { id: 'bitcoin',  ticker: 'BTC' },
  { id: 'ethereum', ticker: 'ETH' },
  { id: 'solana',   ticker: 'SOL' },
  { id: 'pax-gold', ticker: 'XAU' },
]

const PT_TAPE_SYMBOLS = [
  { proName: 'COINBASE:BTCUSD',    title: 'BTC/USD' },
  { proName: 'COINBASE:ETHUSD',    title: 'ETH/USD' },
  { proName: 'COINBASE:SOLUSD',    title: 'SOL/USD' },
  { proName: 'TVC:GOLD',           title: 'Gold' },
  { proName: 'FX_IDC:EURUSD',      title: 'EUR/USD' },
  { proName: 'FOREXCOM:SPXUSD',    title: 'S&P 500' },
  { proName: 'NASDAQ:AAPL',        title: 'AAPL' },
  { proName: 'TVC:USOIL',          title: 'Oil' },
]

const PT_TV_ASSETS = [
  { id: 'gold',    ticker: 'XAU',    label: 'Gold',    proName: 'TVC:GOLD'         },
  { id: 'oil',     ticker: 'OIL',    label: 'Oil',     proName: 'TVC:USOIL'        },
  { id: 'sp500',   ticker: 'SPX',    label: 'S&P 500', proName: 'FOREXCOM:SPXUSD'  },
  { id: 'eurusd',  ticker: 'EUR/USD',label: 'EUR/USD', proName: 'FX_IDC:EURUSD'    },
  { id: 'aapl',    ticker: 'AAPL',   label: 'Apple',   proName: 'NASDAQ:AAPL'      },
  { id: 'btc',     ticker: 'BTC',    label: 'Bitcoin', proName: 'COINBASE:BTCUSD'  },
  { id: 'eth',     ticker: 'ETH',    label: 'Ethereum',proName: 'COINBASE:ETHUSD'  },
]

function ptFmtPrice(v) {
  if (v == null) return '—'
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 100)   return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v >= 1)     return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function Sparkline({ points, isUp }) {
  if (!points?.length) return <div style={{ height: '40px' }} />
  const vals = points.map(p => p[1])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const W = 100, H = 40, pad = 2
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2)
    const y = pad + (1 - (v - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = isUp ? '#00ff88' : '#ff4444'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: '40px', display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function AssetSearch({ existingIds, onAdd }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const timerRef = useRef(null)
  const wrapRef  = useRef(null)
  const inputRef = useRef(null)

  function search(q) {
    clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
          { signal: AbortSignal.timeout(6000) }
        )
        const j = await r.json()
        setResults((j.coins ?? []).slice(0, 8).map(c => ({
          id:     c.id,
          ticker: c.symbol?.toUpperCase() ?? c.id.slice(0, 6).toUpperCase(),
          label:  c.name,
        })))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  function pick(item) {
    if (existingIds.includes(item.id)) return
    onAdd(item)
    setQuery('')
    setResults([])
    setOpen(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  return (
    <div className="pt-asset-search" ref={wrapRef} onPointerDownCapture={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="rss-input pt-search-input"
        value={query}
        onChange={e => { setQuery(e.target.value); search(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search to add asset…"
        spellCheck={false}
      />
      {open && query.trim() && (
        <div className="pt-search-dropdown">
          {loading && results.length === 0 && (
            <div className="pt-search-item pt-search-loading">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="pt-search-item pt-search-empty">No results</div>
          )}
          {results.map(item => {
            const already = existingIds.includes(item.id)
            return (
              <button key={item.id}
                className={`pt-search-item${already ? ' pt-search-added' : ''}`}
                onClick={() => pick(item)}
                disabled={already}>
                <span className="pt-search-ticker">{item.ticker}</span>
                <span className="pt-search-label">{item.label} ({item.ticker})</span>
                {already && <span className="pt-search-badge">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AssetCard({ asset, priceData, onRemove, onChartClick }) {
  const isNonCg = asset.source === 'tv' || asset.source === 'metals'
  const sym     = asset.symbol ?? asset.ticker ?? asset.id.slice(0, 6).toUpperCase()
  const d       = priceData[asset.id]
  const loading = !isNonCg && !d
  const price   = d?.price ?? null
  const chg     = d?.change24h ?? null
  const isUp    = (chg ?? 0) >= 0
  const stale   = d?.stale ?? false
  const accent  = PT_ASSET_COLORS[asset.id] ?? '#ffffff'
  const [flash, setFlash] = useState(null)
  const prevRef = useRef(null)

  useEffect(() => {
    if (price == null) return
    if (prevRef.current != null && prevRef.current !== price) {
      const dir = price > prevRef.current ? 'up' : 'down'
      setFlash(dir)
      const t = setTimeout(() => setFlash(null), 700)
      prevRef.current = price
      return () => clearTimeout(t)
    }
    prevRef.current = price
  }, [price])

  return (
    <div
      className={`asset-card${stale && !isNonCg ? ' asset-stale' : ''}${flash ? ` asset-flash-${flash}` : ''}${loading ? ' asset-loading' : ''}`}
      onClick={() => onChartClick?.(asset)}
    >
      <button className="asset-remove-btn" onClick={e => { e.stopPropagation(); onRemove(asset.id) }} title="Remove">×</button>
      <div className="asset-symbol" style={{ color: accent }}>{sym}</div>
      {isNonCg ? (
        <>
          <div className="asset-price">—</div>
          <div className="asset-change" style={{ color: '#2a3a4a' }}>—</div>
          <div style={{ minHeight: '40px' }} />
        </>
      ) : loading ? (
        <>
          <div className="asset-price asset-skel">&nbsp;</div>
          <div className="asset-change asset-skel" style={{ width: '60%' }}>&nbsp;</div>
          <div style={{ height: '40px' }} />
        </>
      ) : (
        <>
          <div className="asset-price">{price == null ? '—' : `$${ptFmtPrice(price)}`}</div>
          <div className={`asset-change ${isUp ? 'up' : 'down'}`}>
            {chg == null ? '—' : `${isUp ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%`}
          </div>
          {stale && <div className="asset-stale-label">stale</div>}
          <Sparkline points={d?.sparkline ?? null} isUp={isUp} />
        </>
      )}
    </div>
  )
}

function PriceTracker({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const assetsKey = `vigil_prices_assets_${widgetId ?? 'default'}`
  const isVisiblePt = usePageVisibility()

  const [assets,      setAssets]      = useState(() => {
    const PT_ID_BLOCKLIST = ['sp500', 'gold', 'spx', 'pxspx']
    try {
      const saved = JSON.parse(localStorage.getItem(assetsKey) || 'null')
      if (!Array.isArray(saved) || !saved.length) return PT_DEFAULT_ASSETS
      const seenTickers = new Set()
      const valid = saved
        .filter(a => typeof a.id === 'string' && a.id && !a.source && !PT_ID_BLOCKLIST.includes(a.id))
        .map(a => ({ id: a.id, ticker: a.ticker ?? a.symbol ?? a.id.slice(0, 6).toUpperCase() }))
        .filter(a => { if (seenTickers.has(a.ticker)) return false; seenTickers.add(a.ticker); return true })
      return valid.length > 0 ? valid : PT_DEFAULT_ASSETS
    } catch { return PT_DEFAULT_ASSETS }
  })
  const [mode,        setMode]        = useState('grid')
  const [priceData,   setPriceData]   = useState({})
  const [loading,     setLoading]     = useState(true)
  const [fetchError,  setFetchError]  = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [timeAgo,     setTimeAgo]     = useState('')
  const [toast,       setToast]       = useState(null)
  const toastKeyRef = useRef(0)
  const bodyRef     = useRef(null)
  const assetsRef   = useRef(assets)
  assetsRef.current = assets

  useEffect(() => {
    try { localStorage.setItem(assetsKey, JSON.stringify(assets)) } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tick = () => {
      if (!lastRefresh) return
      const s = Math.floor((Date.now() - lastRefresh) / 1000)
      setTimeAgo(s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`)
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [lastRefresh])

  async function fetchSparkline(id) {
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1&interval=hourly`,
        { signal: AbortSignal.timeout(10000) }
      )
      const j = await r.json()
      return j.prices ?? null
    } catch { return null }
  }

  const fetchAll = useCallback(async (withSpark = false) => {
    const list   = assetsRef.current
    const cgList = list.filter(a => a.source !== 'tv' && a.source !== 'metals')
    if (!cgList.length) { setLoading(false); return }
    const ids = cgList.map(a => a.id).join(',')
    let cg = null
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`,
        { signal: AbortSignal.timeout(10000) }
      )
      cg = await r.json()
    } catch {
      setFetchError('CoinGecko unavailable')
      setPriceData(prev => {
        const next = { ...prev }
        cgList.forEach(a => { if (next[a.id]) next[a.id] = { ...next[a.id], stale: true } })
        return next
      })
      setLoading(false)
      return
    }
    setFetchError(null)

    const updates = {}
    for (const a of cgList) {
      const d = cg[a.id]
      updates[a.id] = {
        price:       d?.usd ?? null,
        change24h:   d?.usd_24h_change ?? null,
        sparkline:   withSpark ? null : null,
        stale:       !d,
        lastUpdated: Date.now(),
      }
    }

    if (withSpark) {
      const sparks = await Promise.allSettled(cgList.map(a => fetchSparkline(a.id)))
      cgList.forEach((a, i) => {
        if (sparks[i].status === 'fulfilled') updates[a.id].sparkline = sparks[i].value
      })
    } else {
      setPriceData(prev => {
        cgList.forEach(a => { updates[a.id].sparkline = prev[a.id]?.sparkline ?? null })
        return { ...prev, ...updates }
      })
      setLastRefresh(Date.now())
      setLoading(false)
      return
    }

    setPriceData(prev => ({ ...prev, ...updates }))
    setLastRefresh(Date.now())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll(true)
    const p = setInterval(() => { if (!document.hidden) fetchAll(false) }, 60_000)
    const s = setInterval(() => { if (!document.hidden) fetchAll(true)  }, 5 * 60_000)
    return () => { clearInterval(p); clearInterval(s) }
  }, [fetchAll, assets])

  useEffect(() => {
    if (isVisiblePt) fetchAll(false)
  }, [isVisiblePt]) // fetchAll is stable

  function saveAssets(list) {
    const clean = list.map(a => ({ id: a.id, ticker: a.ticker ?? a.symbol ?? a.id.slice(0, 6).toUpperCase() }))
    setAssets(clean)
    try { localStorage.setItem(assetsKey, JSON.stringify(clean)) } catch {}
  }

  function showToast(msg) {
    const key = ++toastKeyRef.current
    setToast({ msg, key })
    setTimeout(() => setToast(t => t?.key === key ? null : t), 1800)
  }

  function handleAdd(item) {
    if (assets.find(a => a.id === item.id)) return
    saveAssets([...assets, { id: item.id, ticker: item.ticker ?? item.symbol ?? item.id.slice(0, 6).toUpperCase() }])
    showToast(`+ Added: ${item.ticker ?? item.id}`)
    fetchAll(false)
  }

  function handleRemove(id) {
    saveAssets(assets.filter(a => a.id !== id))
    showToast('Removed')
  }

  function handleChartClick(asset) {
    const tvSym = COINGECKO_TO_TV[asset.id] ?? `BINANCE:${asset.ticker}USDT`
    window.dispatchEvent(new CustomEvent('vigil-chart-symbol', { detail: { symbol: tvSym } }))
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">PRICE TRACKER</span>
        <div className="widget-actions">
          <span className={`widget-badge${loading ? ' inactive' : ''}`}>LIVE</span>
          <button className={`widget-btn pt-mode-btn${mode === 'grid' ? ' pt-mode-active' : ''}`} onClick={() => setMode('grid')} title="Grid">⊞</button>
          <button className={`widget-btn pt-mode-btn${mode === 'tape' ? ' pt-mode-active' : ''}`} onClick={() => setMode('tape')} title="Tape">≡</button>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>

      <div className="widget-body" ref={bodyRef} style={{ flexDirection: 'column', alignItems: 'stretch', position: 'relative' }}>
        {toast && <div key={toast.key} className="pt-toast">{toast.msg}</div>}
        {mode === 'tape' ? (
          <TickerTape
            symbols={PT_TAPE_SYMBOLS}
            colorTheme="dark"
            isTransparent
            displayMode="adaptive"
            locale="en"
          />
        ) : loading && Object.keys(priceData).length === 0 ? (
          <div className="pt-scroll">
            <div className="pt-grid">
              {PT_DEFAULT_ASSETS.map((_, i) => (
                <div key={i} className="asset-card">
                  <div className="skel-block" style={{ padding: 0, gap: 8 }}>
                    <SkeletonLine w="40%" h={10} />
                    <SkeletonLine w="70%" h={18} />
                    <SkeletonLine w="50%" h={9} />
                    <SkeletonLine w="100%" h={36} />
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-footer"><span></span><span>via CoinGecko</span></div>
          </div>
        ) : fetchError && Object.keys(priceData).length === 0 ? (
          <div className="widget-error">
            <span className="widget-error-icon">⚠</span>
            {fetchError}
            <button className="widget-error-retry" onClick={() => { setFetchError(null); fetchAll(true) }}>↻ Retry</button>
          </div>
        ) : (
          <div className="pt-scroll">
            {assets.length === 0
              ? <div className="empty-state"><span className="empty-state-icon">📈</span>Search below to add assets</div>
              : <div className="pt-grid">
                  {assets.map(asset => (
                    <AssetCard key={asset.id} asset={asset} priceData={priceData} onRemove={handleRemove} onChartClick={handleChartClick} />
                  ))}
                </div>
            }
            <AssetSearch existingIds={assets.map(a => a.id)} onAdd={handleAdd} />
            <div className="pt-footer">
              <span>{lastRefresh ? `Updated ${timeAgo}` : ''}</span>
              <span>via CoinGecko</span>
            </div>
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
  const [embedUrl,   setEmbedUrl]   = useState(initialUrl)
  const [input,      setInput]      = useState(initialUrl)
  const [error,      setError]      = useState(null)
  const isVisibleLs = usePageVisibility()

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
        <span className="widget-title">LIVESTREAM</span>
        <div className="widget-actions">
          <span className={`widget-badge${embedUrl ? '' : ' inactive'}`}>
            {embedUrl && <span className="badge-dot" />}
            {embedUrl ? 'LIVE' : 'STANDBY'}
          </span>
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
        src={isVisibleLs ? embedUrl : ''}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="Livestream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}

// ─── Weather (Open-Meteo + Nominatim geocoding) ───────────────────────────────
const NOM_URL = q =>
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
const WX_URL  = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,weather_code,relative_humidity_2m` +
  `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
  `&wind_speed_unit=kmh&timezone=auto`

function decodeWmo(code) {
  if (code === 0)  return { label: 'Clear Sky',     icon: '☀️'  }
  if (code <= 2)   return { label: 'Partly Cloudy', icon: '⛅'  }
  if (code === 3)  return { label: 'Overcast',      icon: '☁️'  }
  if (code <= 48)  return { label: 'Fog',           icon: '🌫️' }
  if (code <= 67)  return { label: 'Rain',          icon: '🌧️' }
  if (code <= 77)  return { label: 'Snow',          icon: '❄️'  }
  if (code <= 82)  return { label: 'Rain Showers',  icon: '🌦️' }
  if (code <= 86)  return { label: 'Snow Showers',  icon: '❄️'  }
  if (code <= 99)  return { label: 'Thunderstorm',  icon: '⛈️'  }
  return           { label: 'Unknown',              icon: '🌡️' }
}

const WX_DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function Weather({ widgetId, initialCity = 'Berlin', onCityChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const locKey = `vigil_weather_loc_${widgetId ?? 'default'}`

  const [latLon,    setLatLon]    = useState(() => {
    try { const r = localStorage.getItem(locKey); return r ? JSON.parse(r) : null } catch { return null }
  })
  const [city,      setCity]      = useState(initialCity)
  const [cityInput, setCityInput] = useState(initialCity)
  const [locName,   setLocName]   = useState(() => {
    try { const r = localStorage.getItem(locKey); return r ? (JSON.parse(r).name || initialCity) : initialCity } catch { return initialCity }
  })
  const [data,       setData]       = useState(null)
  const [daily,      setDaily]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [fetchKey,   setFetchKey]   = useState(0)
  const bodyRef                     = useRef(null)
  const [bodyH,      setBodyH]      = useState(999)
  const isVisibleWx = usePageVisibility()

  useEffect(() => {
    if (!bodyRef.current) return
    const ro = new ResizeObserver(([e]) => setBodyH(e.contentRect.height))
    ro.observe(bodyRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!latLon) { setCity(initialCity); setCityInput(initialCity); setLocName(initialCity) }
  }, [initialCity])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onLocation(e) {
      const { name, lat, lon } = e.detail ?? {}
      if (typeof lat !== 'number' || typeof lon !== 'number') return
      const loc = { lat, lon, name: name || '' }
      setLatLon(loc); setLocName(name || '')
      try { localStorage.setItem(locKey, JSON.stringify(loc)) } catch {}
    }
    window.addEventListener('vigil:location', onLocation)
    return () => window.removeEventListener('vigil:location', onLocation)
  }, [locKey])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true); setError(null)
      try {
        let lat, lon, name
        if (latLon) {
          lat = latLon.lat; lon = latLon.lon; name = latLon.name
        } else {
          const json = await fetch(NOM_URL(city), {
            headers: { 'User-Agent': 'Vigil/1.0' },
            signal: AbortSignal.timeout(8000),
          }).then(r => r.json())
          const loc = json[0]
          if (!loc) throw new Error(`"${city}" not found`)
          lat = parseFloat(loc.lat); lon = parseFloat(loc.lon)
          name = loc.display_name.split(',')[0].trim()
          const saved = { lat, lon, name }
          setLatLon(saved)
          try { localStorage.setItem(locKey, JSON.stringify(saved)) } catch {}
        }
        if (cancelled) return
        setLocName(name)
        const wx = await fetch(WX_URL(lat, lon), { signal: AbortSignal.timeout(8000) }).then(r => r.json())
        if (cancelled) return
        setData(wx.current)
        setDaily(wx.daily ?? null)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Fetch failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    const id = setInterval(() => { if (!document.hidden) run() }, 10 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [city, latLon, locKey, fetchKey])

  // Re-fetch when tab becomes visible again
  useEffect(() => {
    if (isVisibleWx) setFetchKey(k => k + 1)
  }, [isVisibleWx])

  function handleCitySubmit(e) {
    e.preventDefault()
    const c = cityInput.trim()
    if (!c) return
    try { localStorage.removeItem(locKey) } catch {}
    setLatLon(null); setCity(c); onCityChange?.(c)
  }

  const wmo         = data ? decodeWmo(data.weather_code) : null
  const todayHi     = daily?.temperature_2m_max?.[0]
  const todayLo     = daily?.temperature_2m_min?.[0]
  const showForecast = bodyH >= 220 && daily?.time?.length > 0
  const fcastDays   = (daily?.time ?? []).slice(0, 5).map((dateStr, i) => ({
    day: WX_DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()],
    wmo: decodeWmo(daily.weather_code[i]),
    max: Math.round(daily.temperature_2m_max[i]),
    min: Math.round(daily.temperature_2m_min[i]),
  }))

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title={`WEATHER · ${locName.toUpperCase()}`} badge="LIVE" badgeActive={!loading && !error} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />

      <form className="wx-search-bar" onSubmit={handleCitySubmit} onPointerDownCapture={e => e.stopPropagation()}>
        <input
          className="wx-search-input"
          value={cityInput}
          onChange={e => setCityInput(e.target.value)}
          placeholder="City or country..."
          spellCheck={false}
        />
        <button className="wx-search-btn" type="submit">🔍</button>
      </form>

      <div className="widget-body" ref={bodyRef}>
        {error ? (
          <div className="widget-error">
            <span className="widget-error-icon">⚠</span>
            {error}
            <button className="widget-error-retry" onClick={() => { setError(null); setFetchKey(k => k + 1) }}>Retry</button>
          </div>
        ) : loading || !data ? (
          <div className="skel-block" style={{ width: '100%' }}>
            <SkeletonLine w="60%" h={40} />
            <SkeletonLine w="40%" h={12} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[55, 42, 60, 48].map((w, i) => <SkeletonLine key={i} w={`${w}%`} h={10} />)}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {[1,2,3,4,5].map(i => <SkeletonLine key={i} w="18%" h={56} />)}
            </div>
          </div>
        ) : (
          <div className="wx-body">
            <div className="wx-main">
              <div className="wx-icon-temp">
                <span className="wx-icon">{wmo.icon}</span>
                <span className="wx-temp">{Math.round(data.temperature_2m)}°C</span>
              </div>
              <div className="wx-condition">{wmo.label}</div>
              <div className="wx-stats-row">
                {todayHi != null && (
                  <span className="wx-stat-item">↑{Math.round(todayHi)}° ↓{Math.round(todayLo)}°</span>
                )}
                <span className="wx-stat-item">💧 {data.relative_humidity_2m}%</span>
                <span className="wx-stat-item">💨 {Math.round(data.wind_speed_10m)} km/h</span>
                <span className="wx-stat-item">🌡️ {Math.round(data.apparent_temperature)}°C</span>
              </div>
            </div>
            {showForecast && (
              <div className="wx-forecast">
                {fcastDays.map(d => (
                  <div key={d.day} className="wx-fcast-card">
                    <span className="wx-fcast-day">{d.day}</span>
                    <span className="wx-fcast-icon">{d.wmo.icon}</span>
                    <span className="wx-fcast-hi">{d.max}°</span>
                    <span className="wx-fcast-lo">{d.min}°</span>
                  </div>
                ))}
              </div>
            )}
            <div className="attr-line">via Open-Meteo · Nominatim</div>
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
const ACTIVE_WS_KEY      = 'vigil_active_workspace'
const widgetsKey         = id => `vigil_ws${id.replace('ws-', '')}_widgets`
const DEFAULT_WORKSPACES = [{ id: 'ws-1', name: 'Workspace 1' }]
const DEFAULT_WIDGETS    = [
  { id: 'atlas',         type: 'map'           },
  { id: 'feed',          type: 'feed'          },
  { id: 'rss',           type: 'rss'           },
  { id: 'prices',        type: 'prices'        },
  { id: 'stream',        type: 'stream'        },
  { id: 'weather',       type: 'weather'       },
  { id: 'conflict', type: 'conflict' },
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
const TV_DEFAULT_SYMBOL = 'BINANCE:BTCUSDT'

function ChartWidget({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const storageKey = `vigil_tvchart_symbol_${widgetId ?? 'default'}`
  const [activeSymbol, setActiveSymbol] = useState(() => {
    try { return localStorage.getItem(storageKey) || TV_DEFAULT_SYMBOL } catch { return TV_DEFAULT_SYMBOL }
  })
  const [inputSymbol, setInputSymbol] = useState(activeSymbol)

  useEffect(() => {
    const handler = e => {
      const sym = e.detail?.symbol
      if (!sym) return
      setActiveSymbol(sym)
      setInputSymbol(sym)
      try { localStorage.setItem(storageKey, sym) } catch {}
    }
    window.addEventListener('vigil-chart-symbol', handler)
    return () => window.removeEventListener('vigil-chart-symbol', handler)
  }, [storageKey])

  function go(raw) {
    const sym = raw.trim().toUpperCase()
    if (!sym) return
    setActiveSymbol(sym)
    setInputSymbol(sym)
    try { localStorage.setItem(storageKey, sym) } catch {}
  }

  const displayTicker = activeSymbol.includes(':') ? activeSymbol.split(':')[1] : activeSymbol
  const tvUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_vigil&symbol=${encodeURIComponent(activeSymbol)}&interval=D&theme=dark&style=1&locale=en&toolbar_bg=0d1421&enable_publishing=0&hide_side_toolbar=0&allow_symbol_change=1&save_image=0`

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="TV CHART" onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <form
        className="tvchart-bar"
        onSubmit={e => { e.preventDefault(); go(inputSymbol) }}
        onPointerDownCapture={e => e.stopPropagation()}
      >
        <span className="tvchart-symbol-dot">●</span>
        <span className="tvchart-symbol-label">{displayTicker}</span>
        <input
          className="rss-input tvchart-input"
          value={inputSymbol}
          onChange={e => setInputSymbol(e.target.value)}
          placeholder="Symbol (e.g. BTCUSDT, AAPL, EURUSD)"
          spellCheck={false}
        />
        <button className="rss-go-btn" type="submit">GO</button>
      </form>
      <iframe
        key={activeSymbol}
        src={tvUrl}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="TradingView Chart"
        allow="clipboard-write"
      />
    </div>
  )
}

// ─── Browser widget ──────────────────────────────────────────────────────────
const BROWSER_DEFAULT_URL = 'https://www.google.com'
const BROWSER_BLOCKED     = /twitter\.com|x\.com|facebook\.com|instagram\.com|linkedin\.com|reddit\.com/i

function BrowserWidget({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const storageKey = `vigil_browser_url_${widgetId}`
  const savedUrl   = (() => { try { return localStorage.getItem(storageKey) || BROWSER_DEFAULT_URL } catch { return BROWSER_DEFAULT_URL } })()

  const histRef      = useRef({ stack: [savedUrl], idx: 0 })
  const [url,        setUrl]      = useState(savedUrl)
  const [input,      setInput]    = useState(savedUrl)
  const [error,      setError]    = useState(false)
  const [frameKey,   setFrameKey] = useState(0)   // bump to remount iframe (refresh)
  const [, tick]                  = useState(0)   // force re-render for canGoBack/Forward

  function load(raw) {
    let u = raw.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) {
      if (!u.includes('.')) u += '.com'
      u = 'https://' + u
    }
    const h = histRef.current
    h.stack  = h.stack.slice(0, h.idx + 1)
    h.stack.push(u)
    h.idx    = h.stack.length - 1
    setUrl(u); setInput(u); setError(false); setFrameKey(0); tick(n => n + 1)
    try { localStorage.setItem(storageKey, u) } catch {}
  }

  function step(delta) {
    const h = histRef.current
    const next = h.idx + delta
    if (next < 0 || next >= h.stack.length) return
    h.idx = next
    const u = h.stack[next]
    setUrl(u); setInput(u); setError(false); setFrameKey(0); tick(n => n + 1)
    try { localStorage.setItem(storageKey, u) } catch {}
  }

  const canBack    = histRef.current.idx > 0
  const canForward = histRef.current.idx < histRef.current.stack.length - 1
  const isBlocked  = BROWSER_BLOCKED.test(url)

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="BROWSER" onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <form
        className="browser-bar"
        onSubmit={e => { e.preventDefault(); load(input) }}
        onPointerDownCapture={e => e.stopPropagation()}
      >
        <button type="button" className="browser-nav-btn" onClick={() => step(-1)} disabled={!canBack}    title="Back">←</button>
        <button type="button" className="browser-nav-btn" onClick={() => step(1)}  disabled={!canForward} title="Forward">→</button>
        <input
          className="rss-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter any URL…"
          spellCheck={false}
        />
        <button className="rss-go-btn" type="submit" title="Go">GO</button>
        <button type="button" className="rss-go-btn" onClick={() => { setError(false); setFrameKey(k => k + 1) }} title="Refresh">↻</button>
        <button type="button" className="rss-go-btn" onClick={() => window.open(url, '_blank', 'noopener')} title="Open in new tab">↗</button>
      </form>
      {isBlocked
        ? (
          <div className="browser-blocked">
            <div className="browser-blocked-icon">⚠</div>
            <div className="browser-blocked-title">This site doesn't allow embedding.</div>
            <button className="browser-open-btn" onClick={() => window.open(url, '_blank', 'noopener')}>↗ Open in new tab</button>
          </div>
        )
        : error
        ? (
          <div className="browser-error">
            This site cannot be embedded.{' '}
            <button className="browser-error-btn" onClick={() => window.open(url, '_blank', 'noopener')}>↗ Open in new tab</button>
          </div>
        ) : (
          <iframe
            key={url + frameKey}
            src={url}
            style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
            title="Browser"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            allow="fullscreen"
            onError={() => setError(true)}
          />
        )
      }
    </div>
  )
}

// ─── Widget catalog + renderer ────────────────────────────────────────────────
// ─── Social Feed widget ───────────────────────────────────────────────────────
const SOCIAL_DEFAULT_FOLLOWS = [
  { id: 'sf-1', platform: 'reddit',   type: 'subreddit', value: 'worldnews',        label: 'r/worldnews' },
  { id: 'sf-2', platform: 'reddit',   type: 'subreddit', value: 'ukraine',           label: 'r/ukraine' },
  { id: 'sf-3', platform: 'twitter',  type: 'keyword',   value: 'Iran war',          label: 'Iran war' },
  { id: 'sf-4', platform: 'telegram', type: 'channel',   value: 'ukrainianmilitary', label: '@ukrainianmilitary' },
]
const SOCIAL_PLAT_ORDER = ['twitter', 'reddit', 'telegram']
const SOCIAL_PLAT_LABEL = { twitter: 'X / TWITTER', reddit: 'REDDIT', telegram: 'TELEGRAM' }
function socialIcon(p) { return p === 'twitter' ? '🐦' : p === 'reddit' ? '🔴' : '✈️' }
function socialFmt(n)  { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }
function socialAge(utc) {
  const s = Math.floor(Date.now() / 1000) - utc
  if (s < 60) return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function SocialFeed({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const storageKey = `vigil_social_follows_${widgetId}`

  const [follows,      setFollows]      = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || 'null'); return Array.isArray(s) && s.length ? s : SOCIAL_DEFAULT_FOLLOWS } catch { return SOCIAL_DEFAULT_FOLLOWS }
  })
  const [activeId,     setActiveId]     = useState(() => follows[0]?.id ?? null)
  const [addingFollow, setAddingFollow] = useState(false)
  const [addPlatform,  setAddPlatform]  = useState('reddit')
  const [addValue,     setAddValue]     = useState('')
  const [posts,        setPosts]        = useState([])
  const [loading,      setLoading]      = useState(false)

  const activeFollow = follows.find(f => f.id === activeId) ?? null

  function saveFollows(next) {
    setFollows(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  function addFollow() {
    const v = addValue.trim(); if (!v) return
    let type, value, label
    if (addPlatform === 'reddit') {
      const clean = v.replace(/^r\//, '')
      const isSub = !/\s/.test(clean)
      type = isSub ? 'subreddit' : 'keyword'; value = isSub ? clean : v; label = isSub ? `r/${clean}` : v
    } else if (addPlatform === 'twitter') {
      const isHandle = /^@?[A-Za-z0-9_]+$/.test(v)
      type = isHandle ? 'account' : 'keyword'; value = v.replace(/^@/, ''); label = isHandle ? `@${value}` : v
    } else {
      type = 'channel'; value = v.replace(/^@/, ''); label = `@${value}`
    }
    const entry = { id: `sf-${Date.now()}`, platform: addPlatform, type, value, label }
    saveFollows([...follows, entry]); setActiveId(entry.id); setAddValue(''); setAddingFollow(false)
  }

  function removeFollow(id) {
    const next = follows.filter(f => f.id !== id)
    saveFollows(next)
    if (activeId === id) setActiveId(next[0]?.id ?? null)
  }

  const fetchReddit = useCallback(async (follow) => {
    if (!follow || follow.platform !== 'reddit') return
    setLoading(true)
    try {
      const url = follow.type === 'subreddit'
        ? `https://www.reddit.com/r/${follow.value}.json?limit=25`
        : `https://www.reddit.com/search.json?q=${encodeURIComponent(follow.value)}&sort=new&limit=25`
      const res  = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
      const json = await res.json()
      setPosts((json?.data?.children ?? []).map(c => c.data))
    } catch { setPosts([]) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (activeFollow?.platform === 'reddit') { setPosts([]); fetchReddit(activeFollow) }
    else setPosts([])
  }, [activeFollow, fetchReddit])

  useEffect(() => {
    if (activeFollow?.platform !== 'reddit') return
    const id = setInterval(() => fetchReddit(activeFollow), 10 * 60_000)
    return () => clearInterval(id)
  }, [activeFollow, fetchReddit])

  const grouped = {}
  follows.forEach(f => { (grouped[f.platform] ??= []).push(f) })

  const addPlaceholder = addPlatform === 'twitter'  ? 'Username (e.g. @PakMilitary) or keyword'
                       : addPlatform === 'reddit'   ? 'Subreddit (e.g. ukraine) or keyword'
                       :                              'Channel (e.g. @ukrainianmilitary)'

  function renderRight() {
    if (!activeFollow) return <div className="empty-state">Select a source from the sidebar</div>

    if (activeFollow.platform === 'twitter') {
      const tUrl = activeFollow.type === 'account'
        ? `https://x.com/${activeFollow.value}`
        : `https://x.com/search?q=${encodeURIComponent(activeFollow.value)}`
      return (
        <div className="browser-blocked">
          <div className="browser-blocked-icon">🐦</div>
          <div className="browser-blocked-title">X / Twitter requires a paid API key</div>
          <div className="browser-blocked-sub">Open it in your browser to browse this account or search — Vigil stays open in the background.</div>
          <button className="browser-open-btn" onClick={() => window.open(tUrl, '_blank', 'noopener')}>↗ Open {activeFollow.label} on X</button>
        </div>
      )
    }

    if (activeFollow.platform === 'telegram') {
      return (
        <div className="browser-blocked">
          <div className="browser-blocked-icon">✈️</div>
          <div className="browser-blocked-title">Telegram channel</div>
          <div className="browser-blocked-sub">Open this channel in Telegram or your browser to read messages.</div>
          <button className="browser-open-btn" onClick={() => window.open(`https://t.me/${activeFollow.value}`, '_blank', 'noopener')}>↗ Open {activeFollow.label} on Telegram</button>
        </div>
      )
    }

    // Reddit
    if (loading && posts.length === 0) return <SkeletonFeedItems count={6} />
    if (!loading && posts.length === 0) return (
      <div className="empty-state"><span className="empty-state-icon">🔍</span>No posts found for {activeFollow.label}</div>
    )
    return posts.map((post, i) => (
      <a key={i} className="social-post" href={`https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer">
        <div className="social-post-meta">🔴 r/{post.subreddit} · {socialAge(post.created_utc)}</div>
        <div className="social-post-title">{post.title}</div>
        <div className="social-post-score">▲ {socialFmt(post.score)} · 💬 {socialFmt(post.num_comments)}</div>
      </a>
    ))
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header">
        <span className="widget-title">SOCIAL FEED</span>
        <div className="widget-actions">
          <span className={`widget-badge${loading ? ' inactive' : ''}`}>{loading ? 'LOADING' : 'LIVE'}</span>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse}   title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose}      title="Close">✕</button>}
        </div>
      </div>

      <div className="rss-body">
        {/* LEFT SIDEBAR */}
        <div className="social-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div className="rss-sidebar-label">FOLLOWING</div>
          <div className="rss-source-list">
            {SOCIAL_PLAT_ORDER.filter(p => grouped[p]?.length).map(platform => (
              <div key={platform}>
                <div className="social-group-label">{SOCIAL_PLAT_LABEL[platform]}</div>
                {grouped[platform].map(f => (
                  <div key={f.id} className={`rss-source-item${activeId === f.id ? ' active' : ''}`} onClick={() => setActiveId(f.id)}>
                    <span className="social-plat-icon">{socialIcon(f.platform)}</span>
                    <span className="rss-source-name">{f.label}</span>
                    <button className="rss-source-del" onClick={e => { e.stopPropagation(); removeFollow(f.id) }}>×</button>
                  </div>
                ))}
              </div>
            ))}

            {addingFollow && (
              <div className="rss-add-source-form" onPointerDownCapture={e => e.stopPropagation()}
                style={{ padding: '6px 8px', borderTop: '1px solid #1a2535' }}>
                <div className="social-platform-btns">
                  {SOCIAL_PLAT_ORDER.map(p => (
                    <button key={p} className={`social-plat-btn${addPlatform === p ? ' active' : ''}`}
                      onClick={() => { setAddPlatform(p); setAddValue('') }}>{socialIcon(p)}</button>
                  ))}
                </div>
                <input autoFocus className="rss-add-source-input" value={addValue}
                  onChange={e => setAddValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addFollow(); if (e.key === 'Escape') { setAddingFollow(false); setAddValue('') } }}
                  placeholder={addPlaceholder} />
                <div className="rss-add-source-actions">
                  <button className="rss-add-source-add" onClick={addFollow}>ADD</button>
                  <button className="rss-add-source-cancel" onClick={() => { setAddingFollow(false); setAddValue('') }}>Cancel</button>
                </div>
              </div>
            )}
            <button className="rss-add-source-btn" style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
              onClick={() => setAddingFollow(v => !v)}>＋ Add</button>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {renderRight()}
          </div>
        </div>
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
  { type: 'conflict', label: 'CONFLICT', icon: '⚔️' },
  { type: 'chart',    label: 'TV Chart', icon: '📊' },
  { type: 'browser', label: 'Browser',     icon: '🌐' },
  { type: 'social', label: 'SOCIAL FEED', icon: '📡' },
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
  conflict: { w: 8, h: 12 },
  chart:    { w: 6, h: 11 },
  browser: { w: 6, h: 14 },
  social:  { w: 5, h: 11 },
}

function renderWidgetComponent(widget, { onClose, onFullscreen, isFullscreen, onCollapse, collapsed, settings, updateSetting }) {
  const p = { onClose, onFullscreen, isFullscreen, onCollapse, collapsed }
  switch (widget.type) {
    case 'map':      return <AtlasWidget  {...p} widgetId={widget.id} />
    case 'feeds':    return <FeedsWidget  {...p} />
    case 'feed':     return <KeywordFeed  {...p} widgetId={widget.id} />
    case 'rss':      return <RssFeed      {...p} widgetId={widget.id} />
    case 'prices':   return <PriceTracker {...p} widgetId={widget.id} />
    case 'stream':   return <Livestream   {...p} initialUrl={settings.livestreamUrl}  onUrlChange={url  => updateSetting('livestreamUrl', url)} />
    case 'weather':  return <Weather      {...p} widgetId={widget.id} initialCity={settings.weatherCity} onCityChange={city => updateSetting('weatherCity', city)} />
    case 'conflict': return <ConflictFeed {...p} />
    case 'chart':    return <ChartWidget  {...p} widgetId={widget.id} />
    case 'browser': return <BrowserWidget {...p} widgetId={widget.id} />
    case 'social':  return <SocialFeed  {...p} widgetId={widget.id} />
    default:        return null
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
  { i: 'atlas',         x: 0, y: 0,  w: 8, h: 14 },
  { i: 'feed',          x: 8, y: 0,  w: 4, h: 14 },
  { i: 'rss',           x: 0, y: 14, w: 3, h: 10 },
  { i: 'prices',        x: 3, y: 14, w: 3, h: 10 },
  { i: 'stream',        x: 6, y: 14, w: 3, h: 10 },
  { i: 'weather',       x: 9, y: 14, w: 3, h: 10 },
  { i: 'conflict', x: 0, y: 24, w: 12, h: 14 },
]

const wsKey = id => `vigil_workspace_${id.replace('ws-', '')}`

// ─── Layout version — bump to force-reset all saved layouts on next load ─────
const LAYOUT_VERSION     = 6
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
function resolveInitialWs() {
  try {
    const wsList = readWorkspacesMeta()
    const saved  = localStorage.getItem(ACTIVE_WS_KEY)
    return (saved && wsList.some(w => w.id === saved)) ? saved : (wsList[0]?.id ?? 'ws-1')
  } catch { return 'ws-1' }
}
const _INIT_WS = resolveInitialWs()

export default function App() {
  const [workspaces,   setWorkspaces]   = useState(readWorkspacesMeta)
  const [activeWs,     setActiveWs]     = useState(_INIT_WS)
  const [layout,       setLayout]       = useState(() => readLayout(_INIT_WS))
  const [settings,     setSettings]     = useState(() => readSettings(_INIT_WS))
  const [widgets,      setWidgets]      = useState(() => readWidgets(_INIT_WS))
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
    localStorage.setItem(ACTIVE_WS_KEY, wsId)
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
      localStorage.setItem(ACTIVE_WS_KEY, fallback)
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
    const wType    = widgets.find(w => w.id === widgetId)?.type
    const defaultH = WIDGET_DEFAULTS[wType]?.h ?? 8

    if (isCollapsed) {
      const savedH = (collapseMap[widgetId] > 1) ? collapseMap[widgetId] : defaultH
      setLayout(prev => prev.map(item => item.i === widgetId ? { ...item, h: savedH } : item))
      setCollapseMap(prev => { const next = { ...prev }; delete next[widgetId]; return next })
    } else {
      const item    = layout.find(i => i.i === widgetId)
      const current = item?.h ?? defaultH
      const saveH   = current > 1 ? current : defaultH
      setLayout(prev => prev.map(i => i.i === widgetId ? { ...i, h: 1 } : i))
      setCollapseMap(prev => ({ ...prev, [widgetId]: saveH }))
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

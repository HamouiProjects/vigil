import { useState, useRef, useEffect } from 'react'
import AtlasWorldGlobe from './AtlasWorldGlobe'

const DEFAULT_GLOBE_LAYERS = { wildfires: false, earthquakes: true, storms: false, aircraft: false }

const LAYER_DEFS = [
  { key: 'wildfires',   label: 'Wildfires',   color: '#FFD700' },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF8C42' },
  { key: 'storms',      label: 'Storms',      color: '#38BDF8' },
  { key: 'aircraft',    label: 'Aircraft',    color: '#4ADE80' },
]

const COMING_SOON = [
  {
    label: 'Conflict',
    tag: 'SOON',
    tooltip: 'Verified conflict feed — coming soon',
  },
]

const IFRAME_URLS = {
  conflict: 'https://liveuamap.com/',
  marine:   'https://www.shipfinder.com/?mmsi=&imo=',
  flights:  'https://globe.adsbexchange.com/?lat=20&lon=0&zoom=3',
  cyber:    'https://threatmap.checkpoint.com/',
}

const IFRAME_CREDIT = {
  conflict: 'via Liveuamap',
  marine:   'via ShipFinder',
  flights:  'via ADS-B Exchange',
  cyber:    'via Check Point',
}

const EMBEDDED_SOURCE_LABELS = {
  conflict: 'Conflict',
  marine: 'Marine',
  flights: 'Flights',
  cyber: 'Cyber',
}

const TABS = [
  { key: 'world',    label: 'WORLD' },
  { key: 'conflict', label: 'CONFLICT' },
  { key: 'marine',   label: 'MARINE' },
  { key: 'flights',  label: 'FLIGHTS' },
  { key: 'cyber',    label: 'CYBER' },
]

const barStyle = {
  display: 'flex', gap: 6, padding: '6px 12px', alignItems: 'center',
  background: 'var(--surface, #0d1117)', borderBottom: '1px solid var(--border, #1e2329)',
  overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', flexShrink: 0,
}

const tabBtnStyle = (active) => ({
  padding: '3px 8px', border: `1px solid ${active ? 'var(--accent, #00D4FF)' : 'rgba(255,255,255,0.15)'}`,
  borderRadius: 2, background: active ? 'var(--accent-dim, rgba(0,212,255,0.15))' : 'transparent',
  color: active ? 'var(--accent, #00D4FF)' : 'var(--text-muted, #484f58)',
  fontFamily: 'var(--font-mono, JetBrains Mono)', fontSize: 11, textTransform: 'uppercase',
  letterSpacing: '0.5px', lineHeight: 1, cursor: 'pointer', flexShrink: 0,
  transition: 'color 0.15s, border-color 0.15s',
})

const sourcesPanelStyle = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 25,
  maxWidth: 280,
  padding: '10px 28px 10px 12px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 3,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  lineHeight: 1.45,
  color: 'var(--color-text-secondary)',
}

export default function AtlasWidget({ id, paused, config, onSaveConfig, setActions }) {
  const layers = config.layers ?? DEFAULT_GLOBE_LAYERS
  const mapMode = config.mapMode ?? 'world'

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

  const [barsCollapsed, setBarsCollapsed] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshSpinning, setRefreshSpinning] = useState(false)

  const sourcesPanelRef = useRef(null)
  const sourcesToggleRef = useRef(null)

  function toggleLayer(key) {
    const cur = configRef.current.layers ?? DEFAULT_GLOBE_LAYERS
    onSaveConfigRef.current({ ...configRef.current, layers: { ...cur, [key]: !cur[key] } })
  }

  function switchTab(mode) {
    if (mode === (configRef.current.mapMode ?? 'world')) return
    onSaveConfigRef.current({ ...configRef.current, mapMode: mode })
  }

  function handleRefresh() {
    setRefreshNonce((n) => n + 1)
    setRefreshSpinning(true)
    window.setTimeout(() => setRefreshSpinning(false), 800)
  }

  useEffect(() => {
    if (!showSources) return
    const onPointerDown = (e) => {
      if (sourcesPanelRef.current?.contains(e.target)) return
      if (sourcesToggleRef.current?.contains(e.target)) return
      setShowSources(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showSources])

  useEffect(() => {
    setActions?.(
      <>
        <button
          type="button"
          className="widget-btn"
          onClick={() => setBarsCollapsed((v) => !v)}
          title={barsCollapsed ? 'Expand' : 'Collapse'}
        >
          {barsCollapsed ? '▴' : '▾'}
        </button>
        <button
          type="button"
          className="widget-btn"
          onClick={handleRefresh}
          title="Refresh"
        >
          <span
            style={
              refreshSpinning
                ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' }
                : undefined
            }
          >
            ↻
          </span>
        </button>
        <button
          ref={sourcesToggleRef}
          type="button"
          className="widget-btn"
          onClick={() => setShowSources((v) => !v)}
          title="Sources & attribution"
        >
          ?
        </button>
      </>,
    )
  }, [setActions, barsCollapsed, showSources, refreshSpinning])

  const iframeSrc = (key) => (mapMode === key && !paused) ? IFRAME_URLS[key] : 'about:blank'

  return (
    <>
      {!barsCollapsed && (
        <div style={barStyle} onPointerDownCapture={e => e.stopPropagation()}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => switchTab(key)} style={tabBtnStyle(mapMode === key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {mapMode === 'world' && !barsCollapsed && (
        <div style={barStyle} onPointerDownCapture={e => e.stopPropagation()}>
          {LAYER_DEFS.map(({ key, label, color }) => {
            const on = layers[key]
            return (
              <button
                key={key}
                onClick={() => toggleLayer(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', border: `1px solid ${on ? color : 'rgba(255,255,255,0.15)'}`, borderRadius: 2, background: 'transparent', color: on ? color : 'var(--text-muted, #484f58)', fontFamily: 'var(--font-mono, JetBrains Mono)', fontSize: 11, textTransform: 'uppercase', cursor: 'pointer', lineHeight: 1, letterSpacing: '0.5px', transition: 'color 0.15s, border-color 0.15s', flexShrink: 0 }}
              >
                <span style={{ fontSize: 9 }}>{on ? '●' : '○'}</span>
                {label}
              </button>
            )
          })}
          {COMING_SOON.map(({ label, tag, tooltip }) => (
            <span
              key={label}
              title={tooltip}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 6px',
                border: '1px solid var(--color-border-muted, rgba(255,255,255,0.1))',
                borderRadius: 2,
                background: 'transparent',
                color: 'var(--color-text-muted, #484f58)',
                fontFamily: 'var(--font-mono, JetBrains Mono)',
                fontSize: 11,
                textTransform: 'uppercase',
                cursor: 'default',
                lineHeight: 1,
                letterSpacing: '0.5px',
                opacity: 0.55,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 9 }}>○</span>
              {label}
              <span
                style={{
                  fontSize: 8,
                  padding: '1px 3px',
                  border: '1px solid var(--color-border-muted, rgba(255,255,255,0.12))',
                  borderRadius: 2,
                  letterSpacing: '0.08em',
                  opacity: 0.9,
                }}
              >
                {tag}
              </span>
            </span>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }}>
        {showSources && (
          <div
            ref={sourcesPanelRef}
            style={sourcesPanelStyle}
            onPointerDownCapture={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowSources(false)}
              title="Close"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 18,
                height: 18,
                padding: 0,
                border: 'none',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
            <div style={{ fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Sources & attribution
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Globe layers
              </div>
              <div>Earthquakes — USGS · Storms — GDACS · Aircraft — adsb.lol · Wildfires — NASA FIRMS</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Embedded views
              </div>
              <div>
                {['conflict', 'marine', 'flights', 'cyber'].map((key, i, arr) => (
                  <span key={key}>
                    {EMBEDDED_SOURCE_LABELS[key]} — {IFRAME_CREDIT[key].replace(/^via /i, '')}
                    {i < arr.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 4, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Basemap
              </div>
              <div>© MapTiler · © OpenStreetMap</div>
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 10, borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>
              Vigil tracks, it does not verify.
            </div>
          </div>
        )}

        {/* WORLD globe: stays mounted; paused when it is not the active tab so its pollers stop */}
        <div style={{ display: mapMode === 'world' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <AtlasWorldGlobe
            paused={paused || mapMode !== 'world'}
            layers={layers}
            refreshNonce={refreshNonce}
          />
        </div>

        {['conflict', 'marine', 'flights', 'cyber'].map(key => (
          <div key={key} style={{ display: mapMode === key ? 'block' : 'none', position: 'absolute', inset: 0 }}>
            <iframe
              src={iframeSrc(key)}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={`Atlas ${key}`}
              allowFullScreen
            />
          </div>
        ))}

        {paused && mapMode !== 'world' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(10,12,16,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>
            <span style={{ color: 'var(--amber)', fontSize: 22 }}>⏸</span>
            <span style={{ color: 'var(--amber)', fontSize: 11, letterSpacing: '0.12em' }}>PAUSED</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>Live feed disabled</span>
          </div>
        )}
      </div>
    </>
  )
}

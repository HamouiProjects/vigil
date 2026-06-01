import { useState, useRef } from 'react'
import AtlasGlobe from './AtlasGlobe'

const DEFAULT_GLOBE_LAYERS = { conflict: true, wildfires: false, earthquakes: false, storms: false, piracy: false }

const LAYER_DEFS = [
  { key: 'conflict',    label: 'Conflict',    color: '#FF3333' },
  { key: 'wildfires',   label: 'Wildfires',   color: '#FFD700' },
  { key: 'earthquakes', label: 'Earthquakes', color: '#FF8C42' },
  { key: 'storms',      label: 'Storms',      color: '#38BDF8' },
  { key: 'piracy',      label: 'Piracy',      color: '#1E6BFF' },
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

export default function AtlasWidget({ id, paused, config, onSaveConfig }) {
  const layers = config.layers ?? DEFAULT_GLOBE_LAYERS
  const mapMode = config.mapMode ?? 'world'

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

  const [barsCollapsed, setBarsCollapsed] = useState(false)

  function toggleLayer(key) {
    const cur = configRef.current.layers ?? DEFAULT_GLOBE_LAYERS
    onSaveConfigRef.current({ ...configRef.current, layers: { ...cur, [key]: !cur[key] } })
  }

  function switchTab(mode) {
    if (mode === (configRef.current.mapMode ?? 'world')) return
    onSaveConfigRef.current({ ...configRef.current, mapMode: mode })
  }

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
          <button
            onClick={() => setBarsCollapsed(true)}
            title="Collapse"
            style={{ marginLeft: 'auto', width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0 }}
          >▾</button>
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
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }}>
        {barsCollapsed && (
          <button
            onClick={() => setBarsCollapsed(false)}
            title="Expand"
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,17,23,0.85)', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0 }}
          >▴</button>
        )}

        {/* WORLD globe: stays mounted; paused when it is not the active tab so its pollers stop */}
        <div style={{ display: mapMode === 'world' ? 'block' : 'none', position: 'absolute', inset: 0 }}>
          <AtlasGlobe paused={paused || mapMode !== 'world'} layers={layers} />
        </div>

        {['conflict', 'marine', 'flights', 'cyber'].map(key => (
          <div key={key} style={{ display: mapMode === key ? 'block' : 'none', position: 'absolute', inset: 0 }}>
            <iframe
              src={iframeSrc(key)}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={`Atlas ${key}`}
              allowFullScreen
            />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', padding: '2px 0', fontSize: 9, color: 'var(--text-muted)', background: 'rgba(10,12,16,0.6)', letterSpacing: '0.04em', pointerEvents: 'none' }}>
              {IFRAME_CREDIT[key]} · tracks, does not verify
            </div>
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

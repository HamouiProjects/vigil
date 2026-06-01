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

export default function AtlasWidget({ id, paused, config, onSaveConfig }) {
  const layers = config.layers ?? DEFAULT_GLOBE_LAYERS
  // read now to lock persistence shape; only 'world' exists until Sprint 8b
  const mapMode = config.mapMode ?? 'world'
  void mapMode

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

  const [barsCollapsed, setBarsCollapsed] = useState(false)

  function toggleLayer(key) {
    const cur = configRef.current.layers ?? DEFAULT_GLOBE_LAYERS
    onSaveConfigRef.current({ ...configRef.current, layers: { ...cur, [key]: !cur[key] } })
  }

  return (
    <div className="widget" data-widget-id={id}>
      <div className="widget-header widget-drag-handle" style={{ cursor: 'default' }}>
        <div className="widget-title-group">
          <span className="widget-title">ATLAS · WORLD</span>
        </div>
        {paused && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>PAUSED</span>
        )}
      </div>

      {!barsCollapsed && (
        <div
          style={{ display: 'flex', gap: 6, padding: '6px 12px', alignItems: 'center', background: 'var(--surface, #0d1117)', borderBottom: '1px solid var(--border, #1e2329)', overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', flexShrink: 0 }}
          onPointerDownCapture={e => e.stopPropagation()}
        >
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
          <button
            onClick={() => setBarsCollapsed(true)}
            title="Collapse"
            style={{ marginLeft: 'auto', width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0 }}
          >▾</button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative', overflow: 'hidden' }}>
        {barsCollapsed && (
          <button
            onClick={() => setBarsCollapsed(false)}
            title="Expand"
            style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,17,23,0.85)', border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0 }}
          >▴</button>
        )}
        <AtlasGlobe paused={paused} layers={layers} />
      </div>
    </div>
  )
}

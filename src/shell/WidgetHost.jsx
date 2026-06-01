import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { widgetRegistry, SOURCE_BACKED_TYPES } from './widgetRegistry.js'

const FS_STYLE = {
  position: 'fixed',
  top: '40px',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg, #0A0C10)',
}

const SLOT_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  minHeight: 0,
}

export default function WidgetHost({
  widget,
  workspacePaused,
  widgetPaused,
  onTogglePause,
  entitlements,
  onSaveConfig,
  onRemove,
  sources,
  onAddSource,
  onRemoveSource,
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const slotRef = useRef(null)
  const portalRootRef = useRef(null)

  if (!portalRootRef.current && typeof document !== 'undefined') {
    portalRootRef.current = document.createElement('div')
    portalRootRef.current.className = 'widget-host-root'
  }

  useEffect(() => {
    const node = portalRootRef.current
    if (!node) return

    const parent = fullscreen ? document.body : slotRef.current
    if (parent && node.parentNode !== parent) {
      parent.appendChild(node)
    }

    Object.assign(node.style, fullscreen ? FS_STYLE : SLOT_STYLE)
  }, [fullscreen])

  const Component = widgetRegistry[widget.type]
  if (!Component) {
    return (
      <div className="widget-host-missing" style={{ padding: 8, fontSize: 10, color: 'var(--text-muted)' }}>
        Unknown widget type: {widget.type}
      </div>
    )
  }

  void entitlements

  const overridden = workspacePaused                 // global / workspace / inactive-tab already folded in
  const effectivePaused = overridden || widgetPaused

  const cartridge = (
    <>
      <div
        className="widget-host-chrome"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          padding: '2px 6px',
          borderBottom: fullscreen ? '1px solid var(--border)' : 'none',
          background: 'var(--bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="widget-btn"
            onClick={overridden ? undefined : onTogglePause}
            title={overridden ? 'Paused by workspace / global' : (effectivePaused ? 'Resume widget' : 'Pause widget')}
            aria-label={effectivePaused ? 'Resume widget' : 'Pause widget'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: effectivePaused ? '#970047' : '#009750',
              opacity: overridden ? 0.35 : 1,
              cursor: overridden ? 'not-allowed' : 'pointer',
            }}
          >
            {effectivePaused ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          {effectivePaused && (
            <span style={{ fontSize: 8, letterSpacing: '0.1em', color: '#970047', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)' }}>PAUSED</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {onRemove && (
            <button type="button" className="widget-btn widget-btn-close" onClick={onRemove} title="Remove widget">✕</button>
          )}
          <button
            type="button"
            className="widget-btn"
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? '⤡' : '⤢'}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Component
          id={widget.id}
          paused={effectivePaused}
          config={widget.config ?? {}}
          onSaveConfig={onSaveConfig}
          {...(SOURCE_BACKED_TYPES.has(widget.type)
            ? { sources, onAddSource, onRemoveSource }
            : {})}
        />
      </div>
    </>
  )

  return (
    <>
      <div
        ref={slotRef}
        style={{
          width: '100%',
          height: fullscreen ? 0 : '100%',
          minHeight: fullscreen ? 0 : 280,
          overflow: 'hidden',
        }}
      />
      {portalRootRef.current && createPortal(cartridge, portalRootRef.current)}
    </>
  )
}

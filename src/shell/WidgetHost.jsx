import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { widgetRegistry } from './widgetRegistry.js'

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

export default function WidgetHost({ widget, workspacePaused, entitlements, onSaveConfig }) {
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

  const cartridge = (
    <>
      <div
        className="widget-host-chrome"
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '2px 6px',
          borderBottom: fullscreen ? '1px solid var(--border)' : 'none',
          background: 'var(--bg)',
        }}
      >
        <button
          type="button"
          className="widget-btn"
          onClick={() => setFullscreen(f => !f)}
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? '⤡' : '⤢'}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Component
          id={widget.id}
          paused={workspacePaused}
          config={widget.config ?? {}}
          onSaveConfig={onSaveConfig}
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

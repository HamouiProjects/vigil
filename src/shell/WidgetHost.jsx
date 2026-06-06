import { useState } from 'react'
import { widgetRegistry, widgetRegistryMeta, SOURCE_BACKED_TYPES } from './widgetRegistry.js'
import WidgetErrorBoundary from './WidgetErrorBoundary.jsx'

// Fullscreen is an in-place style swap on the wrapper — NOT a DOM reparent. Moving an <iframe>
// in the DOM forces the browser to reload it (wiping in-session chart drawings/indicators), so the
// node must never move. With useCSSTransforms={false} on the grid (Grid.jsx) no ancestor creates a
// containing block, so this position:fixed resolves against the viewport and isn't clipped.
const FS_STYLE = {
  position: 'fixed',
  top: '40px',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-bg, #0A0C10)',
}

export default function WidgetHost({
  widget,
  workspacePaused,
  widgetPaused,
  collapsed = false,
  onToggleCollapse,
  onTogglePause,
  entitlements,
  onSaveConfig,
  onRemove,
  sources,
  onAddSource,
  onRemoveSource,
  readOnly = false,
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [widgetTitle, setWidgetTitle] = useState(null)
  const [widgetActions, setWidgetActions] = useState(null)

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

  const title = widgetTitle ?? widgetRegistryMeta[widget.type]?.label ?? widget.type

  const wrapStyle = fullscreen
    ? FS_STYLE
    : { width: '100%', height: '100%', minHeight: collapsed ? 0 : 280, display: 'flex', flexDirection: 'column' }

  return (
    <div className="widget-fs-wrap" style={wrapStyle}>
      <div
        className="widget"
        {...(collapsed ? { 'data-collapsed': '' } : {})}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      >
        <div className="widget-header" style={{ cursor: 'grab', justifyContent: 'space-between' }}>
          <div className="widget-title-group">
            <span className="widget-title">{title}</span>
            {effectivePaused && (
              <span style={{ marginLeft: 6, fontSize: 8, letterSpacing: '0.1em', color: 'var(--color-error)', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)' }}>PAUSED</span>
            )}
          </div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            {onToggleCollapse && (
              <button
                type="button"
                className="widget-btn"
                onClick={onToggleCollapse}
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? '+' : '−'}
              </button>
            )}
            {widgetActions}
            {!readOnly && (
              <button
                type="button" className="widget-btn"
                onClick={overridden ? undefined : onTogglePause}
                title={overridden ? 'Paused by workspace / global' : (effectivePaused ? 'Resume widget' : 'Pause widget')}
                aria-label={effectivePaused ? 'Resume widget' : 'Pause widget'}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: effectivePaused ? 'var(--color-error)' : 'var(--color-success)', opacity: overridden ? 0.35 : 1, cursor: overridden ? 'not-allowed' : 'pointer' }}
              >
                {effectivePaused
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>}
              </button>
            )}
            <button type="button" className="widget-btn" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {fullscreen ? '⤡' : '⤢'}
            </button>
            {onRemove && (
              <button type="button" className="widget-btn widget-btn-close" onClick={onRemove} title="Remove widget">✕</button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <WidgetErrorBoundary resetKeys={[widget.id, JSON.stringify(widget.config ?? {})]} title={title}>
            <Component
              id={widget.id}
              paused={effectivePaused}
              config={widget.config ?? {}}
              onSaveConfig={onSaveConfig}
              setTitle={setWidgetTitle}
              setActions={setWidgetActions}
              {...(SOURCE_BACKED_TYPES.has(widget.type) ? { sources, onAddSource, onRemoveSource } : {})}
            />
          </WidgetErrorBoundary>
        </div>
      </div>
    </div>
  )
}

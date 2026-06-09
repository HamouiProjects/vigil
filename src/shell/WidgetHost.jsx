import { useState, useEffect, useRef, Suspense } from 'react'
import { widgetRegistry, widgetRegistryMeta, SOURCE_BACKED_TYPES } from './widgetRegistry.js'
import WidgetErrorBoundary from './WidgetErrorBoundary.jsx'

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
  const wrapRef = useRef(null)

  // Native browser fullscreen. requestFullscreen() does NOT move the node in the DOM, so the widget's
  // <iframe> is never reloaded — in-session chart drawings survive. Crucially, the BROWSER owns the
  // exit gesture, so Esc always exits even when a cross-origin iframe (TradingView) holds focus —
  // making it impossible to get trapped in fullscreen.
  useEffect(() => {
    const onFsChange = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement === el) {
      document.exitFullscreen?.()?.catch(() => {})
    } else {
      el.requestFullscreen?.()?.catch(() => {})
    }
  }

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
    ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg, #0A0C10)' }
    : { width: '100%', height: '100%', minHeight: collapsed ? 0 : 280, display: 'flex', flexDirection: 'column' }

  return (
    <div className="widget-fs-wrap" ref={wrapRef} style={wrapStyle}>
      <div
        className="widget"
        {...(collapsed ? { 'data-collapsed': '' } : {})}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      >
        <div className="widget-header" style={{ cursor: 'grab', justifyContent: 'space-between' }}>
          <div className="widget-title-group">
            <span className="widget-title">{title}</span>
            {fullscreen && (
              <span style={{ marginLeft: 8, fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, JetBrains Mono, monospace)' }}>ESC TO EXIT</span>
            )}
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
            <button type="button" className="widget-btn" onClick={toggleFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {fullscreen ? '⤡' : '⤢'}
            </button>
            {onRemove && (
              <button type="button" className="widget-btn widget-btn-close" onClick={onRemove} title="Remove widget">✕</button>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <WidgetErrorBoundary resetKeys={[widget.id, JSON.stringify(widget.config ?? {})]} title={title}>
            <Suspense fallback={
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                Loading
              </div>
            }>
              <Component
                id={widget.id}
                paused={effectivePaused}
                config={widget.config ?? {}}
                onSaveConfig={onSaveConfig}
                setTitle={setWidgetTitle}
                setActions={setWidgetActions}
                {...(SOURCE_BACKED_TYPES.has(widget.type) ? { sources, onAddSource, onRemoveSource } : {})}
              />
            </Suspense>
          </WidgetErrorBoundary>
        </div>
      </div>
    </div>
  )
}

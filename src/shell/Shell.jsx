import { useEffect, useState } from 'react'
import { useShellStore, isWorkspacePaused } from '../state/shellStore.js'
import { widgetRegistryMeta } from './widgetRegistry.js'
import Grid from './Grid.jsx'
import EntitlementDebug from './EntitlementDebug.jsx'

function ShellGlobalLiveToggle() {
  const globalLive = useShellStore(s => s.globalLive === true)

  return (
    <button
      type="button"
      className="shell-global-live-btn"
      onClick={(e) => {
        e.stopPropagation()
        const live = useShellStore.getState().globalLive === true
        useShellStore.getState().setGlobalLive(!live)
      }}
      title={globalLive ? 'Click to pause all live feeds' : 'Click to resume all live feeds'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontSize: 10,
        fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        color: globalLive ? 'var(--green)' : 'var(--red)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: globalLive ? 'var(--green)' : 'var(--red)',
          boxShadow: globalLive ? '0 0 6px var(--green)' : 'none',
        }}
      />
      {globalLive ? 'LIVE' : 'PAUSED'}
    </button>
  )
}

function UpgradeNudge({ message, onDismiss }) {
  if (!message) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100001,
        background: 'var(--surface-elevated)',
        border: '1px solid var(--amber)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
        fontSize: 10,
        padding: '8px 12px',
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      <span>{message}</span>
      <button type="button" className="widget-btn" onClick={onDismiss} title="Dismiss">✕</button>
    </div>
  )
}

export default function Shell() {
  const workspaces = useShellStore(s => s.workspaces)
  const activeWs = useShellStore(s => s.activeWs)
  const globalLive = useShellStore(s => s.globalLive === true)
  const pausedWorkspaces = useShellStore(s => s.pausedWorkspaces)
  const inactiveTabPause = useShellStore(s => s.inactiveTabPause)
  const setActiveWs = useShellStore(s => s.setActiveWs)
  const toggleWorkspacePause = useShellStore(s => s.toggleWorkspacePause)
  const addWorkspace = useShellStore(s => s.addWorkspace)
  const removeWorkspace = useShellStore(s => s.removeWorkspace)
  const addWidget = useShellStore(s => s.addWidget)

  const [upgradeNudge, setUpgradeNudge] = useState(null)
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)

  useEffect(() => {
    const { globalLive: live, setGlobalLive } = useShellStore.getState()
    if (typeof live !== 'boolean') setGlobalLive(true)
  }, [])

  useEffect(() => {
    if (!upgradeNudge) return
    const t = setTimeout(() => setUpgradeNudge(null), 4000)
    return () => clearTimeout(t)
  }, [upgradeNudge])

  useEffect(() => {
    if (!showWidgetPicker) return
    function onDoc() { setShowWidgetPicker(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showWidgetPicker])

  const pauseState = { globalLive, activeWs, pausedWorkspaces, inactiveTabPause }

  function nudgeUpgrade(message) {
    setUpgradeNudge(message)
  }

  function handleAddWorkspace() {
    const ok = addWorkspace()
    if (!ok) nudgeUpgrade('Upgrade to Pro for unlimited workspaces')
  }

  function handleAddWidget(type) {
    const ok = addWidget(activeWs, type)
    setShowWidgetPicker(false)
    if (!ok) nudgeUpgrade('Upgrade to Pro for unlimited widgets per workspace')
  }

  return (
    <div className="app">
      <UpgradeNudge message={upgradeNudge} onDismiss={() => setUpgradeNudge(null)} />

      <nav className="navbar">
        <div className="navbar-left">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--accent)' }}>VIGIL</span>
          <span style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '1px 4px', borderRadius: 2 }}>SHELL</span>
        </div>

        <div className="navbar-center">
          <div className="ws-tabs">
            {workspaces.map(ws => {
              const isActive = ws.id === activeWs
              const isPaused = isWorkspacePaused(pauseState, ws.id)
              return (
                <div
                  key={ws.id}
                  className={`ws-tab${isActive ? ' active' : ''}${isPaused ? ' ws-paused' : ''}`}
                  onClick={() => setActiveWs(ws.id)}
                  title={ws.name}
                >
                  <span className="ws-tab-name">{ws.name}</span>
                  {workspaces.length > 1 && (
                    <button
                      type="button"
                      className="widget-btn widget-btn-close"
                      onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id) }}
                      title="Remove workspace"
                    >
                      ✕
                    </button>
                  )}
                  {isActive && (
                    <button
                      type="button"
                      className={`ws-power-btn${isPaused ? ' is-paused' : ' is-live'}`}
                      onClick={(e) => { e.stopPropagation(); toggleWorkspacePause(ws.id) }}
                      title={isPaused ? 'Resume workspace' : 'Pause workspace'}
                      style={!globalLive ? { color: '#970047', opacity: 0.25, pointerEvents: 'none' } : undefined}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                        <path d="M12 3v9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        <path d="M6.3 5.7a9 9 0 1 0 11.4 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                    </button>
                  )}
                </div>
              )
            })}
            <button className="ws-add-btn" onClick={handleAddWorkspace} title="New workspace">+</button>
          </div>
        </div>

        <div className="navbar-right" style={{ position: 'relative', zIndex: 110 }}>
          <div style={{ position: 'relative' }}>
            <button type="button" className="nav-add-btn" onClick={() => setShowWidgetPicker(v => !v)}>
              + Add Widget
            </button>
            {showWidgetPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  zIndex: 200,
                  minWidth: 160,
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  padding: 6,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}
                onPointerDownCapture={e => e.stopPropagation()}
              >
                {Object.entries(widgetRegistryMeta).map(([type, meta]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleAddWidget(type)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '6px 8px',
                      border: 'none',
                      background: 'none',
                      color: 'var(--text-primary)',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 2,
                    }}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <ShellGlobalLiveToggle />
        </div>
      </nav>

      <div style={{ width: '100%', height: 'calc(100vh - 40px)', position: 'relative', overflow: 'auto' }}>
        <Grid />
      </div>

      <EntitlementDebug />
    </div>
  )
}

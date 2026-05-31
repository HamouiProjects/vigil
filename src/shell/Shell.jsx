import { useShellStore, isWorkspacePaused } from '../state/shellStore.js'
import Grid from './Grid.jsx'
import EntitlementDebug from './EntitlementDebug.jsx'

export default function Shell() {
  const workspaces = useShellStore(s => s.workspaces)
  const activeWs = useShellStore(s => s.activeWs)
  const globalLive = useShellStore(s => s.globalLive)
  const pausedWorkspaces = useShellStore(s => s.pausedWorkspaces)
  const inactiveTabPause = useShellStore(s => s.inactiveTabPause)
  const setActiveWs = useShellStore(s => s.setActiveWs)
  const setGlobalLive = useShellStore(s => s.setGlobalLive)
  const toggleWorkspacePause = useShellStore(s => s.toggleWorkspacePause)

  const pauseState = { globalLive, activeWs, pausedWorkspaces, inactiveTabPause }

  return (
    <div className="app">
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
          </div>
        </div>

        <div className="navbar-right">
          <button
            type="button"
            className="status-dot"
            onClick={() => setGlobalLive(!globalLive)}
            title={globalLive ? 'Click to pause all live feeds' : 'Click to resume all live feeds'}
            style={{ color: globalLive ? 'var(--green)' : 'var(--red)' }}
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
        </div>
      </nav>

      <div style={{ width: '100%', height: 'calc(100vh - 40px)', position: 'relative', overflow: 'auto' }}>
        <Grid />
      </div>

      <EntitlementDebug />
    </div>
  )
}

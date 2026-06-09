/* global __APP_VERSION__ */
import { useEffect, useState, useRef } from 'react'
import { useShellStore, isWorkspacePaused } from '../state/shellStore.js'
import { useShellPersistence } from '../data/useShellPersistence.js'
import { publishWorkspace } from '../data/workspacesRepo.js'
import { loadSubscription } from '../data/subscriptionRepo.js'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { widgetRegistryMeta } from './widgetRegistry.js'
import Grid from './Grid.jsx'
import EntitlementDebug from './EntitlementDebug.jsx'
import UpgradeModal from './UpgradeModal.jsx'
import AccountMenu from './AccountMenu.jsx'
import { supabase } from '../lib/supabase.js'
import AuthScreen from '../components/layout/AuthScreen.jsx'
import { getThemePref, setThemePref, reconcileRemotePref } from '../utils/theme.js'

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
          boxShadow: globalLive ? '0 0 8px var(--green)' : 'none',
        }}
      />
      {globalLive ? 'LIVE' : 'PAUSED'}
    </button>
  )
}

function UpgradeNudge({ message, onDismiss, onUpgrade }) {
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
      {onUpgrade && (
        <button
          type="button"
          className="nav-add-btn btn-primary"
          onClick={onUpgrade}
          style={{ padding: '2px 8px', fontSize: 9 }}
        >
          Upgrade
        </button>
      )}
      <button type="button" className="widget-btn" onClick={onDismiss} title="Dismiss">✕</button>
    </div>
  )
}

export default function Shell() {
  useShellPersistence()
  const loaded = useShellStore(s => s.loaded)
  const workspaces = useShellStore(s => s.workspaces)
  const activeWs = useShellStore(s => s.activeWs)
  const globalLive = useShellStore(s => s.globalLive === true)
  const pausedWorkspaces = useShellStore(s => s.pausedWorkspaces)
  const inactiveTabPause = useShellStore(s => s.inactiveTabPause)
  const setActiveWs = useShellStore(s => s.setActiveWs)
  const toggleWorkspacePause = useShellStore(s => s.toggleWorkspacePause)
  const addWorkspace = useShellStore(s => s.addWorkspace)
  const removeWorkspace = useShellStore(s => s.removeWorkspace)
  const renameWorkspace = useShellStore(s => s.renameWorkspace)
  const moveWorkspace = useShellStore(s => s.moveWorkspace)
  const addWidget = useShellStore(s => s.addWidget)

  const [upgradeNudge, setUpgradeNudge] = useState(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [showWidgetPicker, setShowWidgetPicker] = useState(false)
  const [account, setAccount] = useState(null)
  const [themePref, setThemePrefState] = useState(getThemePref())
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState('login')
  const [navCollapsed, setNavCollapsed] = useState(() => { try { return localStorage.getItem('vigil_nav_collapsed') === '1' } catch { return false } })
  const [wsBarCollapsed, setWsBarCollapsed] = useState(() => { try { return localStorage.getItem('vigil_ws_bar_collapsed') === '1' } catch { return false } })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const scrollRef = useRef(null)
  const [atBottom, setAtBottom] = useState(false)
  const [editingWs, setEditingWs] = useState(null)
  const [wsDraft, setWsDraft] = useState('')
  const dragWsId = useRef(null)
  const [dragOverWs, setDragOverWs] = useState(null)
  const widgetPickerRef = useRef(null)

  const plan = useShellStore(s => s.entitlements.plan)
  const uid = useShellStore(s => s.uid)

  useEffect(() => {
    const { globalLive: live, setGlobalLive } = useShellStore.getState()
    if (typeof live !== 'boolean') setGlobalLive(true)
  }, [])

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    if (!upgradeNudge) return
    const t = setTimeout(() => setUpgradeNudge(null), 4000)
    return () => clearTimeout(t)
  }, [upgradeNudge])

  useEffect(() => {
    if (!showWidgetPicker) return
    function onDoc(e) {
      if (widgetPickerRef.current?.contains(e.target)) return
      setShowWidgetPicker(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showWidgetPicker])

  useEffect(() => {
    if (!uid) return
    supabase.auth.getUser().then(({ data }) => {
      setAccount({ email: data?.user?.email ?? null, isAnon: data?.user?.is_anonymous === true, username: data?.user?.user_metadata?.username ?? null })
      reconcileRemotePref(data?.user?.user_metadata?.theme)
      setThemePrefState(getThemePref())
      const rc = data?.user?.user_metadata?.nav_collapsed
      if (typeof rc === 'boolean') {
        setNavCollapsed(rc)
        try { localStorage.setItem('vigil_nav_collapsed', rc ? '1' : '0') } catch {}
      }
      const rcWs = data?.user?.user_metadata?.ws_bar_collapsed
      if (typeof rcWs === 'boolean') {
        setWsBarCollapsed(rcWs)
        try { localStorage.setItem('vigil_ws_bar_collapsed', rcWs ? '1' : '0') } catch {}
      }
    })
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('upgraded') === '1') {
      let tries = 0
      const poll = async () => {
        tries++
        try {
          const sub = await loadSubscription(uid)
          if (sub?.plan === 'pro') {
            useShellStore.getState().setEntitlements(resolveEntitlements('pro', sub.addOns ?? [], sub?.status))
            setUpgradeNudge('Welcome to Individual — real-time data unlocked.')
            return
          }
        } catch {}
        if (tries < 6) setTimeout(poll, 1500)
      }
      poll()
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('upgrade') === 'cancelled') {
      setUpgradeNudge('Checkout cancelled')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [uid])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const NEAR = 24
    const recompute = () => {
      const max = el.scrollHeight - el.clientHeight
      const scrollable = max > NEAR
      setAtBottom(scrollable && (max - el.scrollTop <= NEAR))
    }
    recompute()
    el.addEventListener('scroll', recompute, { passive: true })
    window.addEventListener('resize', recompute)
    return () => {
      el.removeEventListener('scroll', recompute)
      window.removeEventListener('resize', recompute)
    }
  }, [loaded, activeWs, navCollapsed])

  const pauseState = { globalLive, activeWs, pausedWorkspaces, inactiveTabPause }
  const visibleWorkspaces = wsBarCollapsed ? workspaces.filter(w => w.id === activeWs) : workspaces

  function nudgeUpgrade(message) {
    setUpgradeNudge(message)
  }

  function handleAddWorkspace() {
    const ok = addWorkspace()
    if (!ok) nudgeUpgrade('Free includes 1 room. Upgrade for more.')
  }

  function handleAddWidget(type) {
    const wsId = useShellStore.getState().activeWs
    const ok = addWidget(wsId, type)
    setShowWidgetPicker(false)
    if (!ok) nudgeUpgrade('Free includes 12 widgets per room. Upgrade for unlimited.')
  }

  async function handleShare() {
    const s = useShellStore.getState()
    if (!s.uid || !s.activeWs) return
    try {
      const url = await publishWorkspace(s.uid, s.activeWs, window.location.origin)
      await navigator.clipboard.writeText(url)
      setUpgradeNudge('Public link copied — anyone with it can view this room')
    } catch (e) {
      console.error(e)
      setUpgradeNudge('Could not create share link')
    }
  }

  const setTheme = (p) => { setThemePref(p); setThemePrefState(p) }

  const handleSetUsername = async (name) => {
    const u = (name || '').trim()
    if (!u) return
    await supabase.auth.updateUser({ data: { username: u } })
    setAccount(a => (a ? { ...a, username: u } : a))
  }

  const setNavCollapsedPersisted = (v) => {
    setNavCollapsed(v)
    try { localStorage.setItem('vigil_nav_collapsed', v ? '1' : '0') } catch {}
    supabase.auth.updateUser({ data: { nav_collapsed: v } }).catch(() => {})
  }

  const setWsBarCollapsedPersisted = (v) => {
    setWsBarCollapsed(v)
    try { localStorage.setItem('vigil_ws_bar_collapsed', v ? '1' : '0') } catch {}
    supabase.auth.updateUser({ data: { ws_bar_collapsed: v } }).catch(() => {})
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  if (!loaded) {
    return (
      <div
        className="app"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
          fontSize: 10,
          color: 'var(--text-secondary)',
        }}
      >
        Loading workspace…
      </div>
    )
  }

  return (
    <div className="app">
      <UpgradeNudge
        message={upgradeNudge}
        onDismiss={() => setUpgradeNudge(null)}
        onUpgrade={() => { setUpgradeNudge(null); setShowUpgrade(true) }}
      />

      {navCollapsed
        ? <div className="nav-reveal-handle" onClick={() => setNavCollapsedPersisted(false)} title="Show toolbar" aria-label="Show toolbar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        : (<nav className="navbar">
        <div className="navbar-left">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-wordmark)' }}>VIGIL</span>
          <button
            type="button"
            className="widget-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (hide browser UI — for recording)'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            style={{ marginLeft: 10 }}
          >
            {isFullscreen ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>
              </svg>
            )}
          </button>
        </div>

        <div className="navbar-center">
          <div className="ws-tabs">
            {workspaces.length > 1 && (
              <button
                type="button"
                className="ws-add-btn"
                onClick={() => setWsBarCollapsedPersisted(!wsBarCollapsed)}
                title={wsBarCollapsed ? 'Show all workspaces' : 'Show only the active workspace'}
                aria-label={wsBarCollapsed ? 'Show all workspaces' : 'Show only the active workspace'}
              >
                {wsBarCollapsed ? '‹' : '›'}
              </button>
            )}
            {visibleWorkspaces.map(ws => {
              const isActive = ws.id === activeWs
              const isPaused = isWorkspacePaused(pauseState, ws.id)
              return (
                <div
                  key={ws.id}
                  className={`ws-tab${isActive ? ' active' : ''}${isPaused ? ' ws-paused' : ''}`}
                  onClick={() => setActiveWs(ws.id)}
                  title={ws.name}
                  draggable={editingWs !== ws.id}
                  onDragStart={(e) => { dragWsId.current = ws.id; e.dataTransfer.effectAllowed = 'move' }}
                  onDragOver={(e) => { e.preventDefault(); if (dragOverWs !== ws.id) setDragOverWs(ws.id) }}
                  onDragLeave={() => setDragOverWs(prev => (prev === ws.id ? null : prev))}
                  onDrop={(e) => { e.preventDefault(); if (dragWsId.current && dragWsId.current !== ws.id) moveWorkspace(dragWsId.current, ws.id); dragWsId.current = null; setDragOverWs(null) }}
                  onDragEnd={() => { dragWsId.current = null; setDragOverWs(null) }}
                  style={dragOverWs === ws.id ? { boxShadow: 'inset 2px 0 0 var(--color-brand)' } : undefined}
                >
                  {editingWs === ws.id ? (
                    <input
                      value={wsDraft}
                      autoFocus
                      maxLength={32}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setWsDraft(e.target.value)}
                      onBlur={() => { renameWorkspace(ws.id, wsDraft); setEditingWs(null) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { renameWorkspace(ws.id, wsDraft); setEditingWs(null) }
                        else if (e.key === 'Escape') { setEditingWs(null) }
                      }}
                      style={{ font: 'inherit', color: 'var(--color-text-primary)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-brand)', padding: 0, width: 84, outline: 'none' }}
                    />
                  ) : (
                    <span
                      className="ws-tab-name"
                      onDoubleClick={(e) => { e.stopPropagation(); setWsDraft(ws.name); setEditingWs(ws.id) }}
                    >
                      {ws.name}
                    </span>
                  )}
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
                      style={!globalLive ? { color: 'var(--color-error)', opacity: 0.25, pointerEvents: 'none' } : undefined}
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
          <button type="button" className="nav-add-btn btn-secondary" onClick={handleShare}>Share</button>
          <div ref={widgetPickerRef} style={{ position: 'relative' }}>
            <button type="button" className="nav-add-btn btn-secondary" onClick={() => setShowWidgetPicker(v => !v)}>
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
          <AccountMenu
            account={account}
            plan={plan}
            themePref={themePref}
            onSetTheme={setTheme}
            onUpgrade={() => setShowUpgrade(true)}
            onLogin={() => { setAuthView('login'); setShowAuth(true) }}
            onSignOut={async () => { await supabase.auth.signOut(); window.location.reload() }}
            onSetUsername={handleSetUsername}
          />
          <button type="button" className="nav-collapse-btn" onClick={() => setNavCollapsedPersisted(true)} title="Hide toolbar" aria-label="Hide toolbar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </nav>)}

      <div ref={scrollRef} style={{ width: '100%', height: navCollapsed ? 'calc(100vh - 14px)' : 'calc(100vh - 40px)', position: 'relative', overflow: 'auto' }}>
        <Grid />
        <div aria-hidden="true" style={{ height: 36 }} />
      </div>

      <div className={`bottom-bar${atBottom ? ' is-visible' : ''}`} aria-hidden={!atBottom}>
        <span className="bottom-bar-note">Vigil tracks, it does not verify.</span>
        <span className="bottom-bar-meta">v{__APP_VERSION__} · © {new Date().getFullYear()}</span>
      </div>

      {import.meta.env.DEV && <EntitlementDebug />}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {showAuth && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'var(--bg, #0A0C10)' }}>
          <AuthScreen
            authView={authView}
            setAuthView={setAuthView}
            onClose={() => setShowAuth(false)}
            onAuthed={() => window.location.reload()}
          />
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import { supabase } from './lib/supabase'
import { clearVigilPersistedState } from './utils/workspaceHelpers'
import { WIDGET_CATALOG } from './constants/widgetTypes'
import { VigilProvider, useVigil } from './context/VigilContext'
import AuthScreen from './components/layout/AuthScreen'
import NavBar from './components/layout/NavBar'
import AddWidgetModal from './components/layout/AddWidgetModal'
import SettingsModal from './components/layout/SettingsModal'
import WorkspaceGrid from './components/layout/WorkspaceGrid'
import WidgetRenderer from './components/layout/WidgetRenderer'
import EntitlementDebug from './shell/EntitlementDebug.jsx'

export default function App() {
  return (
    <VigilProvider>
      <AppInner />
    </VigilProvider>
  )
}

function AppInner() {
  const {
    workspaces, activeWs, mountedWs, wsLayouts, wsWidgets, wsSettings, wsCollapse,
    saved, fullscreenId,
    switchWorkspace, renameWorkspace, addWorkspace, deleteWorkspace, duplicateWorkspace,
    addWidget, removeWidget, updateSetting, toggleCollapse,
    handleLayoutChange, enterFullscreen, exitFullscreen,
    globalLive, pausedWorkspaces, inactiveTabPause,
  } = useVigil()

  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [user,         setUser]         = useState(null)
  const [authLoading,  setAuthLoading]  = useState(true)
  const [authView,     setAuthView]     = useState('login')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && fullscreenId) exitFullscreen() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreenId])

  let fsWidget = null
  let fsWsId   = null
  if (fullscreenId) {
    for (const wsId of mountedWs) {
      const found = (wsWidgets[wsId] ?? []).find(w => w.id === fullscreenId)
      if (found) { fsWidget = found; fsWsId = wsId; break }
    }
  }
  const fsCatalog = fsWidget ? WIDGET_CATALOG.find(c => c.type === fsWidget.type) : null

  if (authLoading) return <div className="auth-init-screen"><div className="auth-init-inner"><div className="auth-spinner" /><span className="auth-init-text">INITIALIZING...</span></div></div>
  if (!user) return <AuthScreen authView={authView} setAuthView={setAuthView} />

  return (
    <div className="app">
      {/* TEMP: remove in shell sprint */}
      <EntitlementDebug />
      <NavBar
        saved={saved}
        workspaces={workspaces}
        activeWs={activeWs}
        onSwitchWs={switchWorkspace}
        onRenameWs={renameWorkspace}
        onAddWs={addWorkspace}
        onDeleteWs={deleteWorkspace}
        onDuplicateWs={duplicateWorkspace}
        onShowAddModal={() => setShowAddModal(true)}
        onOpenSettings={() => setShowSettings(true)}
        user={user}
        onSignOut={() => { clearVigilPersistedState(); supabase.auth.signOut() }}
      />
      <div style={{ width: '100%', height: 'calc(100vh - 40px)', position: 'relative' }}>
        {[...mountedWs].map(wsId => (
          <div
            key={wsId}
            style={{
              display:  wsId === activeWs ? 'block' : 'none',
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              overflowY: 'auto',
            }}
          >
            <WorkspaceGrid
              layout={wsLayouts[wsId] ?? []}
              widgets={wsWidgets[wsId] ?? []}
              collapseMap={wsCollapse[wsId] ?? {}}
              settings={wsSettings[wsId] ?? {}}
              workspacePaused={pausedWorkspaces.includes(wsId) || !globalLive || (wsId !== activeWs && inactiveTabPause)}
              isActiveWs={wsId === activeWs}
              fullscreenId={fullscreenId}
              onLayoutChange={newLayout => handleLayoutChange(wsId, newLayout)}
              onClose={widgetId => removeWidget(wsId, widgetId)}
              onFullscreen={enterFullscreen}
              onCollapse={widgetId => toggleCollapse(wsId, widgetId)}
              updateSetting={updateSetting}
            />
          </div>
        ))}
        <button className="fab-add" onClick={() => setShowAddModal(true)} title="Add widget">+</button>
      </div>

      {showAddModal && <AddWidgetModal onAdd={addWidget} onClose={() => setShowAddModal(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {fsWidget && createPortal(
        <div className="fullscreen-overlay">
          <div className="fs-bar">
            <span className="fs-bar-title">{fsCatalog?.icon} {fsCatalog?.label ?? 'Widget'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: '#3a4a5c', letterSpacing: '0.1em' }}>ESC to exit</span>
              <button className="fs-exit-btn" onClick={exitFullscreen}>⤡ Exit Fullscreen</button>
            </div>
          </div>
          <div className="fs-content">
            <WidgetRenderer
              widget={fsWidget}
              onClose={() => removeWidget(fsWsId, fullscreenId)}
              onFullscreen={exitFullscreen}
              isFullscreen={true}
              onCollapse={undefined}
              collapsed={false}
              settings={wsSettings[fsWsId] ?? {}}
              updateSetting={updateSetting}
              workspacePaused={pausedWorkspaces.includes(fsWsId) || !globalLive}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

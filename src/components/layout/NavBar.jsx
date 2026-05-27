import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getSettings, saveSettings, subscribeSettings, toggleWorkspacePause } from '../../utils/settingsStore'

export function UtcClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setTime([n.getUTCHours(), n.getUTCMinutes(), n.getUTCSeconds()]
        .map(v => String(v).padStart(2, '0')).join(':'))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <div className="clock"><span className="clock-label">UTC</span>{time}</div>
}

function WsTab({ ws, isActive, isPaused, globalLive, inactiveTabPause, onSwitchWs, onStartRename, onCtxMenu, onTogglePause }) {
  const divRef = useRef(null)

  useEffect(() => {
    const el = divRef.current
    if (!el) return

    function onCtx(e) {
      e.preventDefault()
      e.stopPropagation()
      onCtxMenu(e.clientX, e.clientY)
    }
    function onDbl(e) {
      e.preventDefault()
      e.stopPropagation()
      onStartRename()
    }

    el.addEventListener('contextmenu', onCtx)
    el.addEventListener('dblclick',    onDbl)
    return () => {
      el.removeEventListener('contextmenu', onCtx)
      el.removeEventListener('dblclick',    onDbl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.id])

  return (
    <div
      ref={divRef}
      className={`ws-tab${isActive ? ' active' : ''}${isPaused ? ' ws-paused' : ''}`}
      onClick={() => onSwitchWs(ws.id)}
      title={ws.name}
    >
      <span className="ws-tab-name">{ws.name}</span>
      <button
        className={`ws-power-btn${(isPaused || (inactiveTabPause && !isActive)) ? ' is-paused' : ' is-live'}`}
        onClick={(e) => { e.stopPropagation(); onTogglePause(); }}
        title={isPaused ? 'Resume workspace' : 'Pause workspace'}
        style={!globalLive ? { color: '#970047', opacity: 0.25, pointerEvents: 'none' } : undefined}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M6.3 5.7a9 9 0 1 0 11.4 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </button>
    </div>
  )
}

export default function NavBar({ saved, workspaces, activeWs, onSwitchWs, onRenameWs, onAddWs, onDeleteWs, onDuplicateWs, onShowAddModal, onOpenSettings, user, onSignOut }) {
  const [editingId,       setEditingId]       = useState(null)
  const [nameInput,       setNameInput]       = useState('')
  const [ctxMenu,         setCtxMenu]         = useState(null)
  const [globalLive,       setGlobalLive]       = useState(() => getSettings().globalLive)
  const [pausedWorkspaces, setPausedWorkspaces] = useState(() => getSettings().pausedWorkspaces ?? [])
  const [inactiveTabPause, setInactiveTabPause] = useState(() => getSettings().inactiveTabPause)
  const ctxMenuRef   = useRef(null)
  const editInputRef = useRef(null)

  useEffect(() => subscribeSettings(s => {
    setGlobalLive(s.globalLive)
    setPausedWorkspaces(s.pausedWorkspaces ?? [])
    setInactiveTabPause(s.inactiveTabPause)
  }), [])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  useEffect(() => {
    if (!ctxMenu) return
    function onDown(e) {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target)) setCtxMenu(null)
    }
    function onKey(e) { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown',   onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown',   onKey)
    }
  }, [ctxMenu])

  function openCtxMenu(clientX, clientY, ws) {
    const menuW = 148, menuH = workspaces.length > 1 ? 138 : 110
    const x = Math.min(clientX, window.innerWidth  - menuW - 6)
    const y = Math.min(clientY, window.innerHeight - menuH - 6)
    setCtxMenu({ x, y, ws })
  }

  function startRename(ws)  { setEditingId(ws.id); setNameInput(ws.name); setCtxMenu(null) }
  function cancelRename()   { setEditingId(null) }
  function commitRename(ws) {
    const name = nameInput.trim()
    if (name && name !== ws.name) onRenameWs(ws.id, name)
    setEditingId(null)
  }

  const canDelete = workspaces.length > 1

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="logo-icon">V</div>
        <span className="logo-text">Vigil</span>
        <span className="logo-tag">OPS</span>
      </div>
      <div className="navbar-center">
        <div className="ws-tabs">
          {workspaces.map(ws =>
            editingId === ws.id ? (
              <input
                key={ws.id}
                ref={editInputRef}
                className="ws-name-input"
                value={nameInput}
                size={Math.max(nameInput.length + 1, 6)}
                onChange={e => setNameInput(e.target.value)}
                onBlur={() => commitRename(ws)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); commitRename(ws) }
                  if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                }}
              />
            ) : (
              <WsTab
                key={ws.id}
                ws={ws}
                isActive={ws.id === activeWs}
                isPaused={pausedWorkspaces.includes(ws.id)}
                globalLive={globalLive}
                inactiveTabPause={inactiveTabPause}
                onSwitchWs={onSwitchWs}
                onStartRename={() => startRename(ws)}
                onCtxMenu={(x, y) => openCtxMenu(x, y, ws)}
                onTogglePause={() => toggleWorkspacePause(ws.id)}
              />
            )
          )}
          {workspaces.length < 6 && (
            <button className="ws-add-btn" onClick={onAddWs} title="New workspace">+</button>
          )}
        </div>
      </div>
      <div className="navbar-right">
        <button className="nav-add-btn" onClick={onShowAddModal}>+ Add Widget</button>
        <button
          className={`status-dot${globalLive ? '' : ' paused'}`}
          onClick={() => saveSettings({ globalLive: !globalLive })}
          title={globalLive ? 'Click to pause all live feeds' : 'Click to resume all live feeds'}
        >
          {globalLive ? 'LIVE' : 'PAUSED'}
        </button>
        <button className="nav-settings-btn" onClick={onOpenSettings} title="Settings">⚙</button>
        <UtcClock />
        <div className={`save-indicator${saved ? ' visible' : ''}`}>SAVED</div>
        {user && (
          <>
            <span className="nav-user-email" title={user.email}>
              {user.email && user.email.length > 20 ? user.email.slice(0, 20) + '…' : user.email}
            </span>
            <button className="nav-signout-btn" onClick={onSignOut}>SIGN OUT</button>
          </>
        )}
      </div>

      {ctxMenu && createPortal(
        <div
          ref={ctxMenuRef}
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="ctx-item" onMouseDown={() => { toggleWorkspacePause(ctxMenu.ws.id); setCtxMenu(null) }}>
            {pausedWorkspaces.includes(ctxMenu.ws.id) ? '▶ Resume workspace' : '⏸ Pause workspace'}
          </div>
          <div className="ctx-item" onMouseDown={() => startRename(ctxMenu.ws)}>✏ Rename</div>
          <div className="ctx-item" onMouseDown={() => { onDuplicateWs(ctxMenu.ws.id); setCtxMenu(null) }}>⧉ Duplicate</div>
          <div
            className={`ctx-item ${canDelete ? 'ctx-item-danger' : 'ctx-item-disabled'}`}
            onMouseDown={canDelete ? () => { onDeleteWs(ctxMenu.ws.id); setCtxMenu(null) } : undefined}
          >🗑 Delete</div>
        </div>,
        document.body
      )}
    </nav>
  )
}

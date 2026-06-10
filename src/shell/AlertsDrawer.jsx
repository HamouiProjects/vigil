import { useEffect, useState } from 'react'

export default function AlertsDrawer({ open, onClose, entitlements }) {
  const [section, setSection] = useState('rules')

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  void entitlements

  return (
    <>
      <div className="alerts-drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="alerts-drawer" role="dialog" aria-label="Alerts">
        <header className="alerts-drawer-header">
          <span className="alerts-drawer-title">Alerts</span>
          <button type="button" className="widget-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </header>
        <div className="alerts-drawer-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'rules'}
            className={`alerts-drawer-tab${section === 'rules' ? ' is-active' : ''}`}
            onClick={() => setSection('rules')}
          >
            Rules
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'activity'}
            className={`alerts-drawer-tab${section === 'activity' ? ' is-active' : ''}`}
            onClick={() => setSection('activity')}
          >
            Activity
          </button>
        </div>
        <div className="alerts-drawer-body">
          {section === 'rules' && (
            <p className="alerts-drawer-empty">No alert rules yet.</p>
          )}
          {section === 'activity' && (
            <p className="alerts-drawer-empty">No activity yet.</p>
          )}
        </div>
      </aside>
    </>
  )
}

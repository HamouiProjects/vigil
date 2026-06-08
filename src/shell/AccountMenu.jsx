// src/shell/AccountMenu.jsx — account avatar + dropdown (appearance/theme, upgrade, auth)
import { useState, useRef, useEffect } from 'react'

export default function AccountMenu({ account, plan, themePref, onSetTheme, onUpgrade, onLogin, onSignOut, onSetUsername }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const username = account?.username || ''

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const isReal = account && account.isAnon === false
  const email = account?.email || ''
  const themes = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="account-avatar" onClick={() => setOpen(v => !v)} title="Account" aria-label="Account menu">
        {username
          ? username[0].toUpperCase()
          : (isReal && email
              ? email[0].toUpperCase()
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="2"/><path d="M5 19c0-3.3 3.1-5 7-5s7 1.7 7 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>)}
      </button>
      {open && (
        <div className="account-menu">
          <div className="account-menu-header">
            <span className="account-menu-name">{username || (isReal ? email : 'Guest')}</span>
            <span className="account-menu-plan">{plan && plan !== 'free' ? plan.toUpperCase() : 'FREE'}</span>
          </div>

          {isReal && (editing
            ? <div className="account-menu-edit">
                <input className="account-menu-input" value={draft} maxLength={32} placeholder="Username" autoFocus onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const v = draft.trim(); if (v) { onSetUsername(v); setEditing(false) } } }} />
                <button type="button" className="account-menu-item" style={{ width: 'auto' }} onClick={() => { const v = draft.trim(); if (v) { onSetUsername(v); setEditing(false) } }}>Save</button>
              </div>
            : <button type="button" className="account-menu-item" onClick={() => { setDraft(username); setEditing(true) }}>{username ? 'Edit username' : 'Set username'}</button>
          )}

          <button type="button" className="account-menu-item" onClick={() => setAppearanceOpen(v => !v)} aria-expanded={appearanceOpen}>
            <span>Appearance</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)' }}>
              <span style={{ fontSize: 11 }}>{(themes.find(([v]) => v === themePref) || [])[1]}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ transform: appearanceOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }}><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
          </button>
          {appearanceOpen && themes.map(([val, lbl]) => (
            <button key={val} type="button" className="account-menu-item" style={{ paddingLeft: 24 }} onClick={() => onSetTheme(val)}>
              <span>{lbl}</span>
              {themePref === val && <span className="account-menu-check">✓</span>}
            </button>
          ))}

          <div className="account-menu-divider" />

          {plan === 'free' && (
            <button type="button" className="account-menu-item" onClick={() => { setOpen(false); onUpgrade() }}>Upgrade to Pro</button>
          )}
          {isReal
            ? <button type="button" className="account-menu-item account-menu-signout" onClick={() => { setOpen(false); onSignOut() }}>Sign out</button>
            : <button type="button" className="account-menu-item" onClick={() => { setOpen(false); onLogin() }}>Log in / Sign up</button>
          }
        </div>
      )}
    </div>
  )
}

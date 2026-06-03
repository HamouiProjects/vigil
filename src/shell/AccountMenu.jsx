// src/shell/AccountMenu.jsx — account avatar + dropdown (appearance/theme, upgrade, auth)
import { useState, useRef, useEffect } from 'react'

export default function AccountMenu({ account, plan, themePref, onSetTheme, onUpgrade, onLogin, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

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
        {isReal && email
          ? email[0].toUpperCase()
          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="2"/><path d="M5 19c0-3.3 3.1-5 7-5s7 1.7 7 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
      </button>
      {open && (
        <div className="account-menu">
          <div className="account-menu-header">
            <span className="account-menu-name">{isReal ? email : 'Guest'}</span>
            <span className="account-menu-plan">{plan === 'pro' ? 'PRO' : 'FREE'}</span>
          </div>

          <div className="account-menu-label">Appearance</div>
          {themes.map(([val, lbl]) => (
            <button key={val} type="button" className="account-menu-item" onClick={() => onSetTheme(val)}>
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

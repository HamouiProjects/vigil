// src/shell/AccountMenu.jsx — account avatar + thin launcher dropdown
import { useState, useRef, useEffect } from 'react'

export default function AccountMenu({ account, plan, onOpenSettings, onAuth, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const avatarRef = useRef(null)
  const username = account?.username || ''

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const isReal = account && account.isAnon === false
  const email = account?.email || ''

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button ref={avatarRef} type="button" className="account-avatar" onClick={() => setOpen(v => !v)} title="Account" aria-label="Account menu">
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

          <button
            type="button"
            className="account-menu-item"
            onClick={() => { setOpen(false); avatarRef.current?.focus(); onOpenSettings() }}
          >
            Settings
          </button>

          <div className="account-menu-divider" />

          {isReal ? (
            <button type="button" className="account-menu-item account-menu-signout" onClick={() => { setOpen(false); onSignOut() }}>Sign out</button>
          ) : (
            <>
              <button type="button" className="account-menu-item account-menu-primary" onClick={() => { setOpen(false); onAuth('signup') }}>Sign up</button>
              <button type="button" className="account-menu-item" onClick={() => { setOpen(false); onAuth('login') }}>Log in</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

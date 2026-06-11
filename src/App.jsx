import { useEffect, useState, lazy, Suspense } from 'react'
import './App.css'
import { supabase } from './lib/supabase.js'

const Shell = lazy(() => import('./shell/Shell.jsx'))
const PublicRoom = lazy(() => import('./shell/PublicRoom.jsx'))
const Landing = lazy(() => import('./landing/Landing.jsx'))
const AuthScreen = lazy(() => import('./components/layout/AuthScreen.jsx'))

function AppSplash() {
  return (
    <div className="app-splash" aria-hidden="true">
      <span className="vigil-wordmark">VIGIL</span>
    </div>
  )
}

// Anon clone sessions are browser-bound: edits persist locally but are lost on
// another device or once the anon session clears. Calm, dismissible nudge that
// invites the user to keep the room by signing in. Anon persistence is untouched.
function AnonKeepRoomNudge() {
  const [dismissed, setDismissed] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState('signup')

  // Calm exit intent: when the cursor leaves through the top of the viewport
  // (toward the tab bar / close), resurface the nudge if it was dismissed.
  // No custom beforeunload string (browsers block custom copy).
  useEffect(() => {
    function onMouseOut(e) {
      if (e.clientY <= 0 && !e.relatedTarget) setDismissed(false)
    }
    document.addEventListener('mouseout', onMouseOut)
    return () => document.removeEventListener('mouseout', onMouseOut)
  }, [])

  return (
    <>
      {!dismissed && !showAuth && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
            fontSize: 11,
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)' }}>
            You are not signed in. Sign up to keep this room across devices.
          </span>
          <button
            type="button"
            className="nav-add-btn btn-primary"
            style={{ padding: '2px 10px', fontSize: 10 }}
            onClick={() => { setAuthView('signup'); setShowAuth(true) }}
          >
            Save / sign up
          </button>
          <button
            type="button"
            className="widget-btn"
            onClick={() => setDismissed(true)}
            title="Dismiss"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {showAuth && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'var(--color-bg)' }}>
          <Suspense fallback={null}>
            <AuthScreen
              authView={authView}
              setAuthView={setAuthView}
              reason="Sign up to keep this room across devices."
              onClose={() => setShowAuth(false)}
              onAuthed={() => window.location.reload()}
            />
          </Suspense>
        </div>
      )}
    </>
  )
}

export default function App() {
  const slug = new URLSearchParams(window.location.search).get('r')
  const [sessionState, setSessionState] = useState('pending')
  const [anonSession, setAnonSession] = useState(false)

  useEffect(() => {
    if (slug) return

    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      const user = session?.user
      setAnonSession(user?.is_anonymous === true)
      setSessionState(user?.id ? 'authenticated' : 'anonymous')
    })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (slug) {
    return (
      <Suspense fallback={<AppSplash />}>
        <PublicRoom slug={slug} />
      </Suspense>
    )
  }

  if (sessionState === 'pending') return <AppSplash />

  if (sessionState === 'authenticated') {
    return (
      <Suspense fallback={<AppSplash />}>
        <Shell />
        {anonSession && <AnonKeepRoomNudge />}
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<AppSplash />}>
      <Landing />
    </Suspense>
  )
}

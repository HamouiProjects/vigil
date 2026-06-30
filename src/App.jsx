import { useEffect, useState, lazy, Suspense } from 'react'
import './App.css'
import { supabase } from './lib/supabase.js'
import AppErrorBoundary from './shell/AppErrorBoundary.jsx'
import GlobeMark from './brand/GlobeMark.jsx'

const Shell = lazy(() => import('./shell/Shell.jsx'))
const PublicRoom = lazy(() => import('./shell/PublicRoom.jsx'))
const Landing = lazy(() => import('./landing/Landing.jsx'))
const AuthScreen = lazy(() => import('./components/layout/AuthScreen.jsx'))
const LegalPage = lazy(() => import('./legal/LegalPage.jsx'))
const InfoPage = lazy(() => import('./info/InfoPage.jsx'))
const PricingPage = lazy(() => import('./pricing/PricingPage.jsx'))
const AboutPage = lazy(() => import('./info/AboutPage.jsx'))
const ContactPage = lazy(() => import('./info/ContactPage.jsx'))

function AppSplash() {
  return (
    <div className="app-splash" aria-hidden="true">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <GlobeMark size={64} />
        <span className="vigil-wordmark">VIGIL</span>
      </div>
    </div>
  )
}

function hasSeenOnboarding() {
  try { return localStorage.getItem('vigil_seen_onboarding') === '1' } catch { return false }
}

// Anon clone sessions are browser-bound: edits persist locally but are lost on
// another device or once the anon session clears. Calm, dismissible nudge that
// invites the user to keep the room by signing in. Anon persistence is untouched.
function AnonKeepRoomNudge() {
  // Wait for the welcome tour to finish before nudging, so a first-time visitor
  // does not get the tour and the keep-room prompt stacked on top of each other.
  const [tourPending, setTourPending] = useState(() => !hasSeenOnboarding())
  const [dismissed, setDismissed] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authView, setAuthView] = useState('signup')

  useEffect(() => {
    if (!tourPending) return undefined
    function onDone() { setTourPending(false) }
    window.addEventListener('vigil:onboarding-done', onDone)
    return () => window.removeEventListener('vigil:onboarding-done', onDone)
  }, [tourPending])

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

  // Esc dismisses the prompt while it is showing (parity with the share confirmation).
  useEffect(() => {
    if (dismissed || showAuth) return undefined
    function onKey(e) { if (e.key === 'Escape') setDismissed(true) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismissed, showAuth])

  return (
    <>
      {!tourPending && !dismissed && !showAuth && (
        <div className="modal-overlay" onClick={() => setDismissed(true)}>
          <div
            role="status"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '20px 24px',
              maxWidth: 'min(360px, calc(100vw - 40px))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              textAlign: 'center',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono, JetBrains Mono, monospace)', fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
              You are not signed in. Sign up to keep this room across devices.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="nav-add-btn btn-primary"
                onClick={() => { setAuthView('signup'); setShowAuth(true) }}
              >
                Save / sign up
              </button>
              <button
                type="button"
                className="nav-add-btn btn-secondary"
                onClick={() => setDismissed(true)}
              >
                Not now
              </button>
            </div>
          </div>
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
  const params = new URLSearchParams(window.location.search)
  const slug = params.get('r')
  const legalPage = params.get('p')
  const isLegal = ['impressum', 'privacy', 'terms'].includes(legalPage)
  const isInfo = legalPage === 'faq'
  const isAbout = legalPage === 'about'
  const isPricing = legalPage === 'pricing'
  const isContact = legalPage === 'contact'

  useEffect(() => {
    const ROUTE_LABELS = {
      pricing: 'Pricing',
      contact: 'Contact',
      about: 'About',
      faq: 'FAQ',
      privacy: 'Privacy',
      terms: 'Terms',
      impressum: 'Impressum',
    }
    const label = ROUTE_LABELS[legalPage] || null
    const title = label ? `${label} | Vigil` : 'Vigil'
    const url = label
      ? `https://thevigilroom.com/?p=${legalPage}`
      : 'https://thevigilroom.com/'
    document.title = title
    const setMeta = (selector, attr, value) => {
      const el = document.head.querySelector(selector)
      if (el) el.setAttribute(attr, value)
    }
    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[name="twitter:title"]', 'content', title)
    setMeta('meta[property="og:url"]', 'content', url)
    setMeta('link[rel="canonical"]', 'href', url)
  }, [legalPage])

  const [sessionState, setSessionState] = useState('pending')
  const [anonSession, setAnonSession] = useState(false)

  useEffect(() => {
    if (slug || isLegal || isInfo || isAbout || isPricing || isContact) return

    let cancelled = false

    const applyUser = (user) => {
      if (cancelled) return
      setAnonSession(user?.is_anonymous === true)
      setSessionState(user?.id ? 'authenticated' : 'anonymous')
    }

    supabase.auth.getSession().then(({ data: { session } }) => applyUser(session?.user))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user)
    })

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [slug, isLegal, isInfo, isAbout, isPricing, isContact])

  if (isLegal) {
    return (
      <Suspense fallback={<AppSplash />}>
        <AppErrorBoundary>
          <LegalPage page={legalPage} />
        </AppErrorBoundary>
      </Suspense>
    )
  }

  if (isInfo) {
    return (
      <Suspense fallback={<AppSplash />}>
        <AppErrorBoundary>
          <InfoPage page={legalPage} />
        </AppErrorBoundary>
      </Suspense>
    )
  }

  if (isPricing) {
    return (
      <Suspense fallback={<AppSplash />}>
        <AppErrorBoundary>
          <PricingPage />
        </AppErrorBoundary>
      </Suspense>
    )
  }

  if (isAbout) {
    return (
      <Suspense fallback={<AppSplash />}>
        <AppErrorBoundary>
          <AboutPage />
        </AppErrorBoundary>
      </Suspense>
    )
  }

  if (isContact) {
    return (
      <Suspense fallback={<AppSplash />}>
        <AppErrorBoundary>
          <ContactPage />
        </AppErrorBoundary>
      </Suspense>
    )
  }

  if (slug) {
    return (
      <Suspense fallback={<AppSplash />}>
        <AppErrorBoundary>
          <PublicRoom slug={slug} />
        </AppErrorBoundary>
      </Suspense>
    )
  }

  if (sessionState === 'pending') return <AppSplash />

  if (sessionState === 'authenticated') {
    return (
      <Suspense fallback={<AppSplash />}>
        <AppErrorBoundary>
          <Shell />
          {anonSession && <AnonKeepRoomNudge />}
        </AppErrorBoundary>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<AppSplash />}>
      <AppErrorBoundary>
        <Landing />
      </AppErrorBoundary>
    </Suspense>
  )
}

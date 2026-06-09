import { useEffect, useState, lazy, Suspense } from 'react'
import './App.css'
import { supabase } from './lib/supabase.js'

const Shell = lazy(() => import('./shell/Shell.jsx'))
const PublicRoom = lazy(() => import('./shell/PublicRoom.jsx'))
const Landing = lazy(() => import('./landing/Landing.jsx'))

function AppSplash() {
  return (
    <div className="app-splash" aria-hidden="true">
      <span className="vigil-wordmark">VIGIL</span>
    </div>
  )
}

export default function App() {
  const slug = new URLSearchParams(window.location.search).get('r')
  const [sessionState, setSessionState] = useState('pending')

  useEffect(() => {
    if (slug) return

    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setSessionState(session?.user?.id ? 'authenticated' : 'anonymous')
      }
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
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<AppSplash />}>
      <Landing />
    </Suspense>
  )
}

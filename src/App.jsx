import { useEffect, useState } from 'react'
import './App.css'
import './landing/landing.css'
import { supabase } from './lib/supabase.js'
import Shell from './shell/Shell.jsx'
import PublicRoom from './shell/PublicRoom.jsx'
import Landing from './landing/Landing.jsx'

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

  if (slug) return <PublicRoom slug={slug} />

  if (sessionState === 'pending') return <AppSplash />

  if (sessionState === 'authenticated') return <Shell />

  return <Landing />
}

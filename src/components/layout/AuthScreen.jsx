import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { validatePassword } from '../../lib/validatePassword'
import GlobeMark from '../../brand/GlobeMark.jsx'

export default function AuthScreen({ authView, setAuthView, onAuthed, onClose, reason }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [username, setUsername] = useState('')
  const [error,    setError]    = useState(null)
  const [message,  setMessage]  = useState(null)
  const [loading,  setLoading]  = useState(false)

  function clearForm() { setEmail(''); setPassword(''); setConfirm(''); setUsername(''); setError(null); setMessage(null) }

  async function handleLogin(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else onAuthed?.()
  }

  async function handleSignup(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    const pwError = validatePassword(password)
    if (pwError) { setError(pwError); return }
    if (!username.trim()) { setError('Please choose a username'); return }
    setError(null); setMessage(null); setLoading(true)

    const { data: u } = await supabase.auth.getUser()
    const isAnon = u?.user?.is_anonymous === true

    if (isAnon) {
      const { error } = await supabase.auth.updateUser({
        email,
        password,
        data: { username: username.trim() },
      })
      setLoading(false)
      if (error) {
        const msg = error.message || ''
        const taken = /already registered|already in use|already been registered/i.test(msg)
        setError(taken ? `${msg} Log in with that email instead.` : msg)
        return
      }
      setMessage('Your account is ready and your room is saved. Check your inbox to confirm your email.')
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: username.trim() } } })
    if (error) { setLoading(false); setError(error.message); return }
    setLoading(false)
    // When "Confirm email" is ON, signUp returns no session — the user must
    // confirm via the emailed link before they can sign in.
    if (!data.session) {
      setMessage('Account created. Check your inbox to confirm your email, then log in.')
      return
    }
    // "Confirm email" OFF: signUp returns a live session — proceed straight in.
    onAuthed?.()
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setLoading(false)
    if (error) setError(error.message)
    else setMessage('Reset link sent. Check your inbox.')
  }

  function switchView(v) { clearForm(); setAuthView(v) }

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ position: 'relative' }}>
        <button
          type="button"
          className="widget-btn"
          onClick={onClose}
          title="Close"
          style={{ position: 'absolute', top: 12, right: 12 }}
        >
          ✕
        </button>
        <div className="auth-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <GlobeMark size={56} />
          <span className="auth-logo-text">VIGIL</span>
          <span className="auth-tagline">Build your own situation room.</span>
        </div>

        {reason && (
          <p style={{ margin: '0 0 14px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>
            {reason}
          </p>
        )}

        {authView !== 'forgot' && (
          <div className="auth-tabs">
            <button className={`auth-tab${authView === 'login'  ? ' active' : ''}`} onClick={() => switchView('login')}>LOGIN</button>
            <button className={`auth-tab${authView === 'signup' ? ' active' : ''}`} onClick={() => switchView('signup')}>SIGN UP</button>
          </div>
        )}

        {authView === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <input className="auth-input" type="email"    value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email"    required autoComplete="email" />
            <input className="auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required autoComplete="current-password" />
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-btn" type="submit" disabled={loading}>{loading ? 'SIGNING IN…' : 'SIGN IN'}</button>
            <button type="button" className="auth-link" onClick={() => switchView('forgot')}>Forgot password?</button>
          </form>
        )}

        {authView === 'signup' && (
          <form className="auth-form" onSubmit={handleSignup}>
            <input className="auth-input" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required autoComplete="username" maxLength={32} />
            <input className="auth-input" type="email"    value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email"                  required autoComplete="email" />
            <input className="auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (8+ chars, upper, lower, number)"  required autoComplete="new-password" />
            <input className="auth-input" type="password" value={confirm}  onChange={e => setConfirm(e.target.value)}  placeholder="Confirm password"         required autoComplete="new-password" />
            {error   && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}
            <button className="auth-btn" type="submit" disabled={loading || !!message}>{loading ? 'CREATING…' : 'CREATE ACCOUNT'}</button>
          </form>
        )}

        {authView === 'forgot' && (
          <form className="auth-form" onSubmit={handleForgot}>
            <div className="auth-forgot-header">Reset Password</div>
            <input className="auth-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required autoComplete="email" />
            {error   && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}
            <button className="auth-btn" type="submit" disabled={loading || !!message}>{loading ? 'SENDING…' : 'SEND RESET LINK'}</button>
            <button type="button" className="auth-link" onClick={() => switchView('login')}>Back to login</button>
          </form>
        )}

        <button type="button" className="auth-link" onClick={onClose} style={{ marginTop: 16 }}>
          Continue as guest
        </button>
      </div>
    </div>
  )
}

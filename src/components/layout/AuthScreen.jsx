import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AuthScreen({ authView, setAuthView }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState(null)
  const [message,  setMessage]  = useState(null)
  const [loading,  setLoading]  = useState(false)

  function clearForm() { setEmail(''); setPassword(''); setConfirm(''); setError(null); setMessage(null) }

  async function handleLogin(e) {
    e.preventDefault()
    setError(null); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  async function handleSignup(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }
    setError(null); setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setLoading(false); setError(error.message); return }
    setMessage('Account created! Signing you in...')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) setError(signInError.message)
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
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-text">VIGIL</span>
          <span className="auth-tagline">Build your own situation room.</span>
        </div>

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
            <input className="auth-input" type="email"    value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email"                  required autoComplete="email" />
            <input className="auth-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 6 chars)"  required autoComplete="new-password" />
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
      </div>
    </div>
  )
}

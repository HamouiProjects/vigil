import { useState, useEffect } from 'react'
import { track } from '@vercel/analytics'
import { supabase } from '../lib/supabase.js'
import { validatePassword } from '../lib/validatePassword'
import { useShellStore } from '../state/shellStore.js'

const INDIVIDUAL_FEATURES = [
  'Real-time data',
  'Daily or weekly brief over your room\'s own sources',
  'Keyword and region alerts',
  'Newsletter to your inbox',
  'Up to 3 rooms',
]

function isValidEmail(value) {
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.includes('@')
}

export default function UpgradeModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [period, setPeriod] = useState('annual')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isAnon, setIsAnon] = useState(null)
  const [existingEmail, setExistingEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => {
        setIsAnon(data?.user?.is_anonymous === true)
        const userEmail = data?.user?.email || ''
        setExistingEmail(userEmail)
        if (userEmail) setEmail(userEmail)
      })
      .catch(() => setIsAnon(true))
  }, [])

  async function handleEarlyAccess() {
    if (loading || success) return
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    setError(null)
    const { error: insertErr } = await supabase
      .from('email_signups')
      .insert({ email: email.trim(), source: 'upgrade' })
    setLoading(false)
    if (insertErr) {
      setError('Something went wrong. Please try again.')
      return
    }
    track('signup', { source: 'upgrade' })
    setSuccess('You\'re on the early access list. We\'ll email you when Individual opens.')
  }

  async function handleContinue() {
    let checkoutEmail

    if (isAnon) {
      const trimmed = email.trim()
      const pwError = validatePassword(password)
      if (!trimmed || pwError) {
        setError(!trimmed ? 'Email is required' : pwError)
        return
      }
      setLoading(true)
      setError(null)
      const { error: upErr } = await supabase.auth.updateUser({ email: trimmed, password })
      if (upErr) {
        setError(upErr.message)
        setLoading(false)
        return
      }
      checkoutEmail = trimmed
    } else {
      setLoading(true)
      setError(null)
      checkoutEmail = existingEmail
    }

    try {
      const uid = useShellStore.getState().uid
      if (!uid) {
        setError('Session not ready')
        setLoading(false)
        return
      }

      const res = await fetch('/api/stripe?action=checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email: checkoutEmail, period }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start checkout')
        setLoading(false)
        return
      }

      window.location.href = data.url
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  const periodBtnStyle = (selected) => ({
    flex: 1,
    padding: '10px 8px',
    background: 'var(--surface)',
    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
    fontSize: 10,
    fontFamily: 'var(--font-mono, JetBrains Mono, monospace)',
    cursor: 'pointer',
    borderRadius: 2,
    textAlign: 'center',
    lineHeight: 1.4,
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Individual (coming soon)</span>
          <button type="button" className="widget-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}>
            Real-time data, the daily or weekly brief, alerts, and the newsletter are rolling out now.
          </p>

          <ul style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            {INDIVIDUAL_FEATURES.map((item) => (
              <li
                key={item}
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: 'var(--color-text-primary)',
                  paddingLeft: 14,
                  position: 'relative',
                }}
              >
                <span style={{
                  position: 'absolute',
                  left: 0,
                  color: 'var(--color-brand)',
                  fontFamily: 'var(--font-mono)',
                }}
                >
                  ·
                </span>
                {item}
              </li>
            ))}
          </ul>

          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-muted)',
            margin: 0,
          }}>
            €8.99/mo or €89/yr when it launches.
          </p>

          {isAnon === null ? (
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>…</div>
          ) : (
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEarlyAccess()}
              placeholder="you@newsroom.org"
              autoComplete="email"
              disabled={loading || !!success}
              aria-label="Email address"
            />
          )}

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button
            type="button"
            className="auth-btn"
            disabled={loading || !!success || isAnon === null}
            onClick={handleEarlyAccess}
          >
            {loading ? 'Submitting…' : 'Get early access'}
          </button>
        </div>
      </div>
    </div>
  )
}

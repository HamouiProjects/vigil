import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useShellStore } from '../state/shellStore.js'

export default function UpgradeModal({ onClose }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [period, setPeriod] = useState('annual')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    const trimmed = email.trim()
    if (!trimmed || password.length < 6) {
      setError(!trimmed ? 'Email is required' : 'Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { error: upErr } = await supabase.auth.updateUser({ email: trimmed, password })
      if (upErr) {
        setError(upErr.message)
        setLoading(false)
        return
      }

      const uid = useShellStore.getState().uid
      if (!uid) {
        setError('Session not ready')
        setLoading(false)
        return
      }

      const res = await fetch('/api/stripe?action=checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email: trimmed, period }),
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
          <span className="modal-title">Upgrade to Pro</span>
          <button type="button" className="widget-btn" onClick={onClose} title="Close">✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={periodBtnStyle(period === 'annual')}
              onClick={() => setPeriod('annual')}
            >
              €15/mo · billed annually
            </button>
            <button
              type="button"
              style={periodBtnStyle(period === 'monthly')}
              onClick={() => setPeriod('monthly')}
            >
              €19/mo
            </button>
          </div>

          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
          />
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Create a password"
            autoComplete="new-password"
          />

          {error && <div className="auth-error">{error}</div>}

          <button
            type="button"
            className="auth-btn"
            disabled={loading}
            onClick={handleContinue}
          >
            {loading ? '…' : 'Continue to payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

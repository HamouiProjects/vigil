// src/settings/SettingsModal.jsx — centered settings modal with left section rail
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { X, Check, ChevronLeft } from 'lucide-react'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { validatePassword } from '../lib/validatePassword.js'
import { supabase } from '../lib/supabase.js'
import { useFocusTrap } from '../hooks/useFocusTrap.js'
import WidgetErrorBoundary from '../shell/WidgetErrorBoundary.jsx'
import './settings.css'

const ALL_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'data-privacy', label: 'Data & Privacy' },
]

const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]

function planLabel(plan) {
  if (!plan || plan === 'free') return 'Free'
  if (plan === 'pro') return 'Individual'
  if (plan === 'team') return 'Team'
  return plan
}

function formatPlanCaps(plan) {
  const ent = resolveEntitlements(plan || 'free')
  const { limits, capabilities } = ent
  const parts = []
  const ws = limits.workspaces
  parts.push(`${ws} ${ws === 1 ? 'room' : 'rooms'}`)
  if (limits.widgetsPerWorkspace === Infinity) {
    parts.push('unlimited widgets per room')
  } else {
    parts.push(`${limits.widgetsPerWorkspace} widgets per room`)
  }
  if (limits.alertRules > 0) {
    parts.push(`${limits.alertRules} alert rules`)
  } else {
    parts.push('no alert rules')
  }
  if (capabilities.has('alerts')) {
    parts.push('alert notifications')
  }
  if (limits.briefsPerMonth != null) {
    parts.push(`${limits.briefsPerMonth} briefs per month`)
  }
  return parts.join(', ')
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  )
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px)')
    const handler = (e) => setMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return mobile
}

function SavedFlash({ visible }) {
  if (!visible) return null
  return <span className="settings-saved-flash">Saved</span>
}

export default function SettingsModal({
  account,
  plan,
  themePref,
  onSetTheme,
  onUpgrade,
  onSignOut,
  onClose,
  onAuth,
  onSetUsername,
}) {
  const isMobile = useIsMobile()
  const [activeSection, setActiveSection] = useState('profile')
  const [mobilePane, setMobilePane] = useState('list')
  const [savedFlash, setSavedFlash] = useState(false)

  const modalRef = useRef(null)
  useFocusTrap(modalRef)

  const isReal = account && account.isAnon === false
  const isPaid = !!plan && plan !== 'free'
  const email = account?.email || ''
  const username = account?.username || ''
  const ent = resolveEntitlements(plan || 'free')
  const hasAlerts = ent.capabilities.has('alerts')
  const sections = useMemo(
    () => (isReal ? ALL_SECTIONS : ALL_SECTIONS.filter((s) => s.id !== 'data-privacy')),
    [isReal]
  )

  const flashSaved = useCallback(() => {
    setSavedFlash(true)
    const t = setTimeout(() => setSavedFlash(false), 2000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function selectSection(id) {
    setActiveSection(id)
    if (isMobile) setMobilePane('section')
  }

  function mobileBack() {
    setMobilePane('list')
  }

  const bodyClass = isMobile
    ? `settings-modal-body${mobilePane === 'list' ? ' is-mobile-list' : ' is-mobile-section'}`
    : 'settings-modal-body'

  return (
    <div className="modal-overlay settings-modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings-modal-header">
          <span className="settings-modal-title">Settings</span>
          <button type="button" className="widget-btn" onClick={onClose} title="Close" aria-label="Close settings">
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>

        <div className={bodyClass}>
          <nav className="settings-rail" aria-label="Settings sections">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`settings-rail-btn${activeSection === s.id ? ' is-active' : ''}`}
                onClick={() => selectSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="settings-mobile-section-list">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className="settings-rail-btn"
                onClick={() => selectSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="settings-panel">
            {isMobile && mobilePane === 'section' && (
              <button type="button" className="settings-mobile-back" onClick={mobileBack}>
                <ChevronLeft size={14} strokeWidth={1.75} />
                Back
              </button>
            )}

            <WidgetErrorBoundary resetKeys={[activeSection]} title="Settings">
              {activeSection === 'profile' && (
                <ProfileSection
                  isReal={isReal}
                  username={username}
                  email={email}
                  onSetUsername={onSetUsername}
                  onAuth={onAuth}
                  onClose={onClose}
                  flashSaved={flashSaved}
                  savedFlash={savedFlash}
                />
              )}
              {activeSection === 'appearance' && (
                <AppearanceSection
                  themePref={themePref}
                  onSetTheme={(v) => { onSetTheme(v); flashSaved() }}
                  savedFlash={savedFlash}
                />
              )}
              {activeSection === 'subscription' && (
                <SubscriptionSection
                  plan={plan}
                  isPaid={isPaid}
                  onUpgrade={() => { onClose(); onUpgrade() }}
                />
              )}
              {activeSection === 'notifications' && (
                <NotificationsSection
                  isReal={isReal}
                  hasAlerts={hasAlerts}
                  onAuth={onAuth}
                  onClose={onClose}
                  flashSaved={flashSaved}
                  savedFlash={savedFlash}
                />
              )}
              {activeSection === 'security' && (
                <SecuritySection
                  isReal={isReal}
                  email={email}
                  onAuth={onAuth}
                  onClose={onClose}
                />
              )}
              {activeSection === 'data-privacy' && isReal && (
                <DataPrivacySection />
              )}
            </WidgetErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileSection({ isReal, username, email, onSetUsername, onAuth, onClose, flashSaved, savedFlash }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  if (!isReal) {
    return (
      <>
        <h2 className="settings-section-title">Profile</h2>
        <p className="settings-field-value">Guest session</p>
        <p className="settings-field-note" style={{ marginTop: 12, marginBottom: 16 }}>
          Sign up to save your room and manage your account.
        </p>
        <button
          type="button"
          className="settings-btn settings-btn-primary"
          onClick={() => { onClose(); onAuth('signup') }}
        >
          Sign up
        </button>
        <button
          type="button"
          className="settings-btn settings-btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => { onClose(); onAuth('login') }}
        >
          Log in
        </button>
      </>
    )
  }

  async function saveUsername() {
    const v = draft.trim()
    if (!v) return
    setSaving(true)
    await onSetUsername(v)
    setSaving(false)
    setEditing(false)
    flashSaved()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 className="settings-section-title" style={{ margin: 0 }}>Profile</h2>
        <SavedFlash visible={savedFlash} />
      </div>

      <div className="settings-field">
        <div className="settings-field-label">Display name</div>
        {editing ? (
          <div className="settings-inline-edit">
            <input
              className="settings-input"
              value={draft}
              maxLength={32}
              placeholder="Username"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveUsername()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <button type="button" className="settings-btn" onClick={saveUsername} disabled={saving}>
              Save
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="settings-field-value">{username || 'Not set'}</span>
            <button
              type="button"
              className="settings-btn settings-btn-ghost"
              onClick={() => { setDraft(username); setEditing(true) }}
            >
              {username ? 'Edit' : 'Set'}
            </button>
          </div>
        )}
      </div>

      <div className="settings-field">
        <div className="settings-field-label">Email</div>
        <div className="settings-field-value">{email || 'No email'}</div>
        <p className="settings-field-note">Email changes are coming later.</p>
      </div>
    </>
  )
}

function AppearanceSection({ themePref, onSetTheme, savedFlash }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 className="settings-section-title" style={{ margin: 0 }}>Appearance</h2>
        <SavedFlash visible={savedFlash} />
      </div>
      {THEMES.map(([val, lbl]) => (
        <button
          key={val}
          type="button"
          className={`settings-option-row${themePref === val ? ' is-active' : ''}`}
          onClick={() => onSetTheme(val)}
        >
          <span>{lbl}</span>
          {themePref === val && <Check size={14} strokeWidth={2} className="settings-option-check" />}
        </button>
      ))}
      <p className="settings-microcopy">Follows your device by default.</p>
      <button
        type="button"
        className="settings-option-row"
        onClick={() => window.dispatchEvent(new CustomEvent('vigil:start-tour'))}
      >
        <span>Replay welcome tour</span>
      </button>
    </>
  )
}

function SubscriptionSection({ plan, isPaid, onUpgrade }) {
  return (
    <>
      <h2 className="settings-section-title">Subscription</h2>
      <p className="settings-plan-name">{planLabel(plan)}</p>
      <p className="settings-plan-caps">{formatPlanCaps(plan)}</p>

      <div className="account-menu-sub-row">
        <span>Paid plan</span>
        <button
          type="button"
          role="switch"
          aria-checked={isPaid}
          aria-label="Paid plan"
          className={`account-switch${isPaid ? ' on' : ''}`}
          onClick={() => { if (!isPaid) onUpgrade() }}
          title={isPaid ? 'Active during early access.' : 'Off. Only you can turn this on.'}
        >
          <span className="account-switch-knob" />
        </button>
      </div>
      <p className="account-menu-note">
        {isPaid
          ? 'Active for early access. Only you control this toggle. Vigil never turns it on or off for you, and nothing is charged during early access.'
          : 'Only you control this toggle. Vigil never turns it on or off for you. Nothing is charged during early access.'}
      </p>
      {!isPaid && (
        <button type="button" className="settings-btn" style={{ marginTop: 8 }} onClick={onUpgrade}>
          See upgrade options
        </button>
      )}
    </>
  )
}

function NotificationsSection({ isReal, hasAlerts, onAuth, onClose, flashSaved, savedFlash }) {
  const [notifyBrief, setNotifyBrief] = useState(true)
  const [notifyAlert, setNotifyAlert] = useState(true)
  const [telegramConnected, setTelegramConnected] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [telegramError, setTelegramError] = useState('')

  useEffect(() => {
    if (!isReal) return
    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata ?? {}
      setNotifyBrief(meta.notify_brief_email !== false)
      setNotifyAlert(meta.notify_alert_email !== false)
      setTelegramConnected(!!meta.telegram_chat_id)
      setLoaded(true)
    })
  }, [isReal])

  async function persistBrief(val) {
    setNotifyBrief(val)
    await supabase.auth.updateUser({ data: { notify_brief_email: val } })
    flashSaved()
  }

  async function persistAlert(val) {
    setNotifyAlert(val)
    await supabase.auth.updateUser({ data: { notify_alert_email: val } })
    flashSaved()
  }

  async function connectTelegram() {
    if (!hasAlerts) return
    setTelegramError('')
    setTelegramLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setTelegramError('Session expired. Reload and try again.')
        return
      }
      const res = await fetch('/api/jobs?action=telegram-link-start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!res.ok) {
        setTelegramError('Could not start Telegram link. Try again.')
        return
      }
      const data = await res.json()
      if (data.deepLink) window.open(data.deepLink, '_blank')
    } catch {
      setTelegramError('Could not start Telegram link. Try again.')
    } finally {
      setTelegramLoading(false)
    }
  }

  async function disconnectTelegram() {
    setTelegramLoading(true)
    setTelegramError('')
    try {
      await supabase.auth.updateUser({ data: { telegram_chat_id: null } })
      setTelegramConnected(false)
      flashSaved()
    } catch {
      setTelegramError('Could not disconnect Telegram. Try again.')
    } finally {
      setTelegramLoading(false)
    }
  }

  if (!isReal) {
    return (
      <>
        <h2 className="settings-section-title">Notifications</h2>
        <p className="settings-guest-note">Sign up to manage notification preferences.</p>
        <button
          type="button"
          className="settings-btn settings-btn-primary"
          onClick={() => { onClose(); onAuth('signup') }}
        >
          Sign up
        </button>
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 className="settings-section-title" style={{ margin: 0 }}>Notifications</h2>
        <SavedFlash visible={savedFlash} />
      </div>

      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-label">Brief email</div>
          <p className="settings-microcopy">Receive the brief by email when you send one.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={notifyBrief}
          aria-label="Brief email"
          className={`account-switch${notifyBrief ? ' on' : ''}`}
          disabled={!loaded}
          onClick={() => persistBrief(!notifyBrief)}
        >
          <span className="account-switch-knob" />
        </button>
      </div>

      <div className={`settings-toggle-row${!hasAlerts ? ' is-disabled' : ''}`}>
        <div>
          <div className="settings-toggle-label">Alert digest email</div>
          <p className="settings-microcopy">
            {hasAlerts
              ? 'Receive alert digest emails for your rules.'
              : 'Alerts are part of paid plans.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={notifyAlert}
          aria-label="Alert digest email"
          className={`account-switch${notifyAlert ? ' on' : ''}`}
          disabled={!loaded || !hasAlerts}
          onClick={() => { if (hasAlerts) persistAlert(!notifyAlert) }}
        >
          <span className="account-switch-knob" />
        </button>
      </div>

      <div className={`settings-toggle-row${!hasAlerts ? ' is-disabled' : ''}`}>
        <div>
          <div className="settings-toggle-label">Telegram</div>
          {telegramConnected ? (
            <p className="settings-microcopy">Telegram connected</p>
          ) : (
            <p className="settings-microcopy">
              {hasAlerts
                ? 'Receive keyword alerts in Telegram.'
                : 'Alerts are part of paid plans.'}
            </p>
          )}
        </div>
        {telegramConnected ? (
          <button
            type="button"
            className="settings-btn"
            disabled={!loaded || !hasAlerts || telegramLoading}
            onClick={disconnectTelegram}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="settings-btn settings-btn-primary"
            disabled={!loaded || !hasAlerts || telegramLoading}
            onClick={connectTelegram}
          >
            {telegramLoading ? 'Opening...' : 'Connect Telegram'}
          </button>
        )}
      </div>
      {!telegramConnected && hasAlerts && (
        <p className="settings-microcopy">
          After you tap Start in Telegram, reopen Settings to see Connected.
        </p>
      )}
      {telegramError && <p className="settings-msg-error">{telegramError}</p>}
    </>
  )
}

function SecuritySection({ isReal, email, onAuth, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!isReal) {
    return (
      <>
        <h2 className="settings-section-title">Security</h2>
        <p className="settings-guest-note">Sign up to change your password.</p>
        <button
          type="button"
          className="settings-btn settings-btn-primary"
          onClick={() => { onClose(); onAuth('signup') }}
        >
          Sign up
        </button>
      </>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (authErr) {
      setSaving(false)
      setError('Current password is incorrect.')
      return
    }
    const pwError = validatePassword(password)
    if (pwError) {
      setSaving(false)
      setError(pwError)
      return
    }
    if (password !== confirm) {
      setSaving(false)
      setError('Passwords do not match')
      return
    }
    const { error: upErr } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (upErr) {
      setError(upErr.message)
      return
    }
    setSuccess(true)
    setCurrentPassword('')
    setPassword('')
    setConfirm('')
  }

  return (
    <>
      <h2 className="settings-section-title">Security</h2>
      <form onSubmit={handleSubmit}>
        <div className="settings-field">
          <div className="settings-field-label">Current password</div>
          <input
            type="password"
            className="settings-input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="settings-field">
          <div className="settings-field-label">New password</div>
          <input
            type="password"
            className="settings-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="settings-field">
          <div className="settings-field-label">Confirm password</div>
          <input
            type="password"
            className="settings-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" className="settings-btn settings-btn-primary" disabled={saving}>
          Update password
        </button>
        {success && <p className="settings-msg-success">Password updated.</p>}
        {error && <p className="settings-msg-error">{error}</p>}
      </form>
    </>
  )
}

function DataPrivacySection() {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const canDelete = confirmText === 'DELETE'

  async function handleDelete() {
    if (!canDelete || deleting) return
    setDeleting(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setError('You are not signed in.')
      setDeleting(false)
      return
    }

    try {
      const res = await fetch('/api/jobs?action=delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })

      if (res.status === 200) {
        const data = await res.json().catch(() => ({}))
        if (data.ok) {
          await supabase.auth.signOut()
          location.href = '/'
          return
        }
      }

      if (res.status === 401) {
        setError('You are not signed in.')
      } else {
        setError('Could not delete your account. Please try again.')
      }
    } catch {
      setError('Could not delete your account. Please try again.')
    }
    setDeleting(false)
  }

  function handleCancel() {
    setConfirmOpen(false)
    setConfirmText('')
    setError(null)
  }

  return (
    <>
      <h2 className="settings-section-title">Data & Privacy</h2>
      <p className="settings-privacy-copy">
        Vigil stores your account email, your rooms and sources, generated briefs, and your alert rules and events.
        Deleting your account removes all of this permanently and immediately.
      </p>

      {!confirmOpen ? (
        <button
          type="button"
          className="settings-btn settings-btn-danger-outline"
          onClick={() => setConfirmOpen(true)}
        >
          Delete account
        </button>
      ) : (
        <div className="settings-delete-confirm">
          <div className="settings-field-label">Type DELETE to confirm</div>
          <input
            className="settings-input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            aria-label="Type DELETE to confirm account deletion"
          />
          <div className="settings-delete-actions">
            <button
              type="button"
              className="settings-btn settings-btn-destructive"
              disabled={!canDelete || deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting...' : 'Delete account'}
            </button>
            <button
              type="button"
              className="settings-btn"
              disabled={deleting}
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
          {error && <p className="settings-msg-error">{error}</p>}
        </div>
      )}
    </>
  )
}

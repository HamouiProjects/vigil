import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const SEVERITIES = ['low', 'normal', 'high']

function channelSummary(channels) {
  return (channels || ['in_app'])
    .map((c) => (c === 'in_app' ? 'in-app' : c === 'slack' ? 'webhook' : c))
    .join(', ')
}

function severityColor(severity) {
  if (severity === 'high') return 'var(--color-error)'
  if (severity === 'low') return 'var(--color-text-muted)'
  return 'var(--color-warning)'
}

function timeAgo(ts) {
  if (!ts) return ''
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function buildChannels(emailOn, webhookOn, canWebhook) {
  const ch = ['in_app']
  if (emailOn) ch.push('email')
  if (canWebhook && webhookOn) ch.push('webhook')
  return ch
}

export default function AlertsDrawer({ open, onClose, entitlements, onUpgrade, onActivityRead }) {
  const [section, setSection] = useState('rules')
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  const [keyword, setKeyword] = useState('')
  const [region, setRegion] = useState('')
  const [emailOn, setEmailOn] = useState(true)
  const [webhookOn, setWebhookOn] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [severity, setSeverity] = useState('normal')

  const canAlert = entitlements.capabilities.has('alerts')
  const canWebhook = entitlements.capabilities.has('alerts_webhook')
  const cap = entitlements.limits.alertRules ?? 0
  const atCap = canAlert && rules.length >= cap

  const keywordByAlertId = useMemo(
    () => Object.fromEntries(rules.map((r) => [r.id, r.keyword])),
    [rules],
  )

  const loadRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error) setRules(data ?? [])
    } finally {
      setRulesLoading(false)
    }
  }, [])

  const loadEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const { data, error } = await supabase
        .from('alert_events')
        .select('*')
        .order('matched_at', { ascending: false })
        .limit(50)
      if (!error) {
        const rows = data ?? []
        setEvents(rows)
        const hadUnread = rows.some((e) => !e.read_at)
        if (hadUnread) {
          supabase
            .from('alert_events')
            .update({ read_at: new Date().toISOString() })
            .is('read_at', null)
            .then(() => onActivityRead?.())
        }
      }
    } finally {
      setEventsLoading(false)
      setEventsLoaded(true)
    }
  }, [onActivityRead])

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) loadRules()
  }, [open, loadRules])

  useEffect(() => {
    if (open && section === 'activity' && !eventsLoaded && !eventsLoading) loadEvents()
  }, [open, section, eventsLoaded, eventsLoading, loadEvents])

  useEffect(() => {
    if (!open) setEventsLoaded(false)
  }, [open])

  async function handleCreate() {
    setFormError('')
    if (!canAlert) {
      onUpgrade?.()
      return
    }
    if (atCap) {
      onUpgrade?.()
      return
    }

    const kw = keyword.trim()
    if (!kw || kw.length > 120) {
      setFormError('Enter a keyword (1 to 120 characters).')
      return
    }
    const reg = region.trim()
    if (reg.length > 120) {
      setFormError('Region must be 120 characters or fewer.')
      return
    }
    if (canWebhook && webhookOn) {
      const url = webhookUrl.trim()
      if (!url.startsWith('https://') || url.length > 500) {
        setFormError('Webhook URL must start with https:// and be 500 characters or fewer.')
        return
      }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      setFormError('Sign in to create alert rules.')
      return
    }

    setCreating(true)
    try {
      const { error } = await supabase.from('alerts').insert({
        user_id: user.id,
        workspace_id: null,
        keyword: kw,
        region: reg || null,
        channels: buildChannels(emailOn, webhookOn, canWebhook),
        severity,
        webhook_url: canWebhook && webhookOn ? webhookUrl.trim() : null,
        active: true,
      })
      if (error) {
        setFormError('Could not create the alert rule. Please try again.')
        return
      }
      setKeyword('')
      setRegion('')
      setWebhookUrl('')
      setWebhookOn(false)
      setSeverity('normal')
      await loadRules()
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(rule) {
    const { error } = await supabase
      .from('alerts')
      .update({ active: !rule.active })
      .eq('id', rule.id)
    if (!error) await loadRules()
  }

  async function handleDelete(ruleId) {
    const { error } = await supabase.from('alerts').delete().eq('id', ruleId)
    if (!error) await loadRules()
  }

  if (!open) return null

  return (
    <>
      <div className="alerts-drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="alerts-drawer" role="dialog" aria-label="Alerts">
        <header className="alerts-drawer-header">
          <span className="alerts-drawer-title">Alerts</span>
          <button type="button" className="widget-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </header>
        <div className="alerts-drawer-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'rules'}
            className={`alerts-drawer-tab${section === 'rules' ? ' is-active' : ''}`}
            onClick={() => setSection('rules')}
          >
            Rules
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'activity'}
            className={`alerts-drawer-tab${section === 'activity' ? ' is-active' : ''}`}
            onClick={() => setSection('activity')}
          >
            Activity
          </button>
        </div>
        <div className="alerts-drawer-body">
          {section === 'rules' && (
            <div className="alerts-rules">
              {!canAlert && (
                <p className="alerts-nudge">
                  Alerts are a paid feature. Upgrade to start a daily digest over your own keywords.
                </p>
              )}
              {canAlert && atCap && (
                <p className="alerts-cap-note">
                  You have {cap} of {cap} alert rules.{' '}
                  <button type="button" className="alerts-upgrade-link" onClick={() => onUpgrade?.()}>
                    Upgrade for more.
                  </button>
                </p>
              )}

              <form
                className="alerts-rule-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate()
                }}
              >
                <label className="alerts-field">
                  <span className="alerts-field-label">Keyword</span>
                  <input
                    type="text"
                    className="alerts-input"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Ukraine"
                  />
                </label>
                <label className="alerts-field">
                  <span className="alerts-field-label">Region (optional)</span>
                  <input
                    type="text"
                    className="alerts-input"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Middle East"
                  />
                </label>

                <div className="alerts-field">
                  <span className="alerts-field-label">Channels</span>
                  <div className="alerts-channel-list">
                    <label className="alerts-channel-row is-fixed">
                      <input type="checkbox" checked disabled />
                      <span>In-app feed</span>
                    </label>
                    <label className="alerts-channel-row">
                      <input
                        type="checkbox"
                        checked={emailOn}
                        onChange={(e) => setEmailOn(e.target.checked)}
                      />
                      <span>Email digest</span>
                    </label>
                    {canWebhook && (
                      <label className="alerts-channel-row">
                        <input
                          type="checkbox"
                          checked={webhookOn}
                          onChange={(e) => setWebhookOn(e.target.checked)}
                        />
                        <span>Webhook / Slack</span>
                      </label>
                    )}
                  </div>
                  {canWebhook && webhookOn && (
                    <input
                      type="url"
                      className="alerts-input alerts-input-webhook"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      maxLength={500}
                      placeholder="https://hooks.slack.com/..."
                    />
                  )}
                </div>

                <div className="alerts-field">
                  <span className="alerts-field-label">Priority</span>
                  <div className="alerts-severity" role="group" aria-label="Severity">
                    {SEVERITIES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`alerts-severity-btn${severity === s ? ' is-active' : ''}`}
                        onClick={() => setSeverity(s)}
                      >
                        <span
                          className="alerts-severity-dot"
                          style={{ background: severityColor(s) }}
                          aria-hidden
                        />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="alerts-caption">
                  Daily digest of new items matching your keyword. Vigil tracks, it does not verify.
                </p>

                {formError && <p className="alerts-form-error">{formError}</p>}

                <button
                  type="submit"
                  className="nav-add-btn btn-primary alerts-create-btn"
                  disabled={creating || (canAlert && atCap)}
                >
                  {!canAlert
                    ? 'Upgrade to enable alerts'
                    : creating
                      ? 'Creating...'
                      : 'Create alert rule'}
                </button>
              </form>

              <div className="alerts-rule-list-wrap">
                {rulesLoading && rules.length === 0 && (
                  <p className="alerts-drawer-empty">Loading rules...</p>
                )}
                {!rulesLoading && rules.length === 0 && (
                  <p className="alerts-drawer-empty">No alert rules yet.</p>
                )}
                {rules.length > 0 && (
                  <ul className="alerts-rule-list">
                    {rules.map((rule) => (
                      <li key={rule.id} className={`alerts-rule-item${rule.active ? '' : ' is-paused'}`}>
                        <div className="alerts-rule-main">
                          <div className="alerts-rule-keyword-row">
                            <span
                              className="alerts-severity-dot"
                              style={{ background: severityColor(rule.severity) }}
                              title={rule.severity}
                              aria-label={`Priority: ${rule.severity}`}
                            />
                            <span className="alerts-rule-keyword">{rule.keyword}</span>
                          </div>
                          {rule.region?.trim() && (
                            <span className="alerts-rule-region">{rule.region}</span>
                          )}
                          <span className="alerts-rule-meta">{channelSummary(rule.channels)}</span>
                        </div>
                        <div className="alerts-rule-actions">
                          <button
                            type="button"
                            className={`alerts-rule-toggle${rule.active ? ' is-on' : ''}`}
                            onClick={() => handleToggleActive(rule)}
                            title={rule.active ? 'Pause rule' : 'Resume rule'}
                            aria-label={rule.active ? 'Pause rule' : 'Resume rule'}
                          />
                          <button
                            type="button"
                            className="alerts-rule-delete widget-btn"
                            onClick={() => handleDelete(rule.id)}
                            title="Delete rule"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {section === 'activity' && (
            <div className="alerts-activity">
              {eventsLoading && events.length === 0 && (
                <p className="alerts-drawer-empty">Loading...</p>
              )}
              {!eventsLoading && events.length === 0 && (
                <p className="alerts-drawer-empty">No activity yet.</p>
              )}
              {events.length > 0 && (
                <ul className="alerts-activity-list">
                  {events.map((ev) => {
                    const kw = keywordByAlertId[ev.alert_id]
                    return (
                      <li
                        key={ev.id}
                        className={`alerts-activity-item${ev.read_at ? '' : ' is-unread'}`}
                      >
                        {!ev.read_at && <span className="alerts-activity-dot" aria-hidden />}
                        <div className="alerts-activity-main">
                          <div className="alerts-activity-top">
                            {ev.source && <span className="alerts-activity-source">{ev.source}</span>}
                            {kw && <span className="alerts-activity-tag">{kw}</span>}
                            <span className="alerts-activity-time">{timeAgo(ev.matched_at)}</span>
                          </div>
                          <a
                            className="alerts-activity-title"
                            href={ev.item_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {ev.item_title || ev.item_url}
                          </a>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

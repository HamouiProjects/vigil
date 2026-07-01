import { useEffect, useRef, useState } from 'react'
import './brief.css'
import { useShellStore } from '../state/shellStore.js'
import { supabase } from '../lib/supabase.js'
import { gatherRoomItems, gatherMarketSymbols, gatherTrendsRequest, gatherWeather } from '../lib/gatherRoomItems.js'
import { useFocusTrap } from '../hooks/useFocusTrap.js'
import { relativeTime, cleanExcerpt, fmtPct, trendGlyph, isHttpUrl, hostnameOf, DEG } from '../../shared/briefFormat.js'
import { buildBriefPdf } from './briefPdf.js'
import GlobeGlyph from '../brand/GlobeGlyph.jsx'
import { TrendsChart, TrendsLegend, COLORS } from '../widgets/TrendsChart.jsx'

function countGroupItems(g) {
  if (Array.isArray(g.parts)) return g.parts.reduce((n, p) => n + (p.items?.length ?? 0), 0)
  return g.items?.length ?? 0
}

function appendBriefItemPlaintext(lines, item, indent = '  ') {
  const title = String(item.title || '').trim()
  if (title) lines.push(indent + title)
  const excerpt = cleanExcerpt(item.excerpt, item.title)
  if (excerpt) lines.push(indent + excerpt)
  const outlet = (item.source || '').trim() || hostnameOf(item.url)
  const date = relativeTime(item.publishedAt)
  const metaBits = []
  if (outlet) metaBits.push(outlet)
  if (date) metaBits.push(date)
  if (typeof item.url === 'string' && item.url) metaBits.push(item.url)
  if (metaBits.length) lines.push(indent + metaBits.join('  '))
  lines.push('')
}

function renderBriefItemJsx(item, key) {
  const excerpt = cleanExcerpt(item.excerpt, item.title)
  const date = relativeTime(item.publishedAt)
  const outlet = (item.source || '').trim() || hostnameOf(item.url)
  return (
    <div key={key} className="brief-item">
      <div className="brief-item-title">{item.title}</div>
      {excerpt && <p className="brief-item-excerpt">{excerpt}</p>}
      <div className="brief-item-meta">
        {isHttpUrl(item.url) ? (
          <a
            className="brief-item-source"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {outlet}
          </a>
        ) : outlet ? (
          <span className="brief-item-source">{outlet}</span>
        ) : null}
        {date && <span className="brief-item-date">{date}</span>}
      </div>
    </div>
  )
}

function appendBriefSectionPlaintext(lines, section) {
  const label = section.label?.trim() || 'Source'
  lines.push(label)
  if (section.parts?.length) {
    for (const part of section.parts) {
      lines.push(`  ${part.label}`)
      if (part.items?.length) {
        for (const item of part.items) appendBriefItemPlaintext(lines, item, '    ')
      } else {
        lines.push('    No update this round')
        lines.push('')
      }
    }
    return
  }
  if (section.items?.length) {
    for (const item of section.items) appendBriefItemPlaintext(lines, item, '  ')
    return
  }
  if (section.status === 'no_update') {
    lines.push(`No update from ${label}`)
  } else if (section.summary?.trim()) {
    lines.push(section.summary)
  }
  lines.push('')
}

const ACCOUNT_MSG = 'Create a free account to generate briefs.'
const NO_ITEMS_MSG = 'Add a News Search or RSS widget to your room, then generate a brief.'
const UNAVAILABLE_MSG = 'Briefs are temporarily unavailable. Please try again shortly.'
const EMPTY_MSG = 'The brief came back empty. This can happen on very large rooms. Try generating again, or remove a few feeds first.'
const PARSE_MSG = 'The brief came back in an unexpected format. Please try generating again.'

const STAGE_LABELS = [
  (count) => (count ? `Gathering ${count} headlines` : 'Gathering headlines'),
  () => 'Summarizing by widget',
  () => 'Writing the brief',
]

function briefToPlainText(brief) {
  const lines = [brief.headline, '']
  for (const section of brief.sections ?? []) {
    appendBriefSectionPlaintext(lines, section)
  }
  const mk = brief.markets
  if (mk && ((mk.rows?.length) || (mk.heatmaps?.length))) {
    lines.push('Markets (as of last refresh)', '')
    for (const r of (mk.rows ?? [])) lines.push(`- ${r.symbol}  ${r.price}${r.currency ? ' ' + r.currency : ''}  ${fmtPct(r.changePct)}`)
    for (const h of (mk.heatmaps ?? [])) lines.push(`- ${h.label} (${h.symbol})  ${fmtPct(h.changePct)}`)
    lines.push('')
  }
  const tr = brief.trends
  if (tr && (tr.terms?.length)) {
    lines.push(`Search interest (relative, not volume${tr.windowLabel ? `, last ${tr.windowLabel}` : ''})`, '')
    for (const t of (tr.terms ?? [])) lines.push(`- ${t.term}  ${t.value}  ${trendGlyph(t.dir)}`)
    if (isHttpUrl(tr.googleTrendsUrl)) lines.push(`Google Trends: ${tr.googleTrendsUrl}`)
    lines.push('')
  }
  const wx = brief.weather
  if (wx && wx.locations && wx.locations.length) {
    lines.push('Weather', '')
    for (const l of wx.locations) {
      lines.push(`${l.name}: ${l.tempC}${DEG}C, feels ${l.feelsC}${DEG}C, ${l.condition}. Wind ${l.windKph} km/h, humidity ${l.humidity}%.`)
      if (l.todayMaxC != null) lines.push(`  Today ${l.todayMaxC}${DEG} / ${l.todayMinC}${DEG}. Tomorrow ${l.tomorrowMaxC}${DEG} / ${l.tomorrowMinC}${DEG}, ${l.tomorrowCondition}.`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

function daysUntilReset() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.max(1, Math.ceil((next - now) / 86400000))
}

export default function BriefPanel({ onClose, onUpgrade }) {
  const workspaces = useShellStore((s) => s.workspaces)
  const activeWs = useShellStore((s) => s.activeWs)
  const uid = useShellStore((s) => s.uid)
  const entitlements = useShellStore((s) => s.entitlements)
  const ws = workspaces.find((w) => w.id === activeWs)

  const canSchedule = entitlements?.capabilities?.has('scheduled_briefs') === true

  const [phase, setPhase] = useState('idle')
  const [errorMsg, setErrorMsg] = useState(null)
  const [brief, setBrief] = useState(null)
  const [usage, setUsage] = useState(null)
  const [preparedFor, setPreparedFor] = useState(null)
  const [sourceCount, setSourceCount] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loadingStage, setLoadingStage] = useState(0)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [emailState, setEmailState] = useState('idle')
  const [emailError, setEmailError] = useState('')
  const [briefEmailEnabled, setBriefEmailEnabled] = useState(true)
  const [cadence, setCadence] = useState('weekly')
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [wsUuid, setWsUuid] = useState(null)
  const [wsResolved, setWsResolved] = useState(false)
  const [scheduleStatus, setScheduleStatus] = useState('idle')
  const [scheduleError, setScheduleError] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const menuRef = useRef(null)
  const modalRef = useRef(null)
  const trendsChartRef = useRef(null)
  useFocusTrap(modalRef)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const meta = data?.user?.user_metadata ?? {}
      setBriefEmailEnabled(meta.notify_brief_email !== false)
    })
  }, [])

  useEffect(() => {
    if (scheduleStatus !== 'saved' && scheduleStatus !== 'error') return undefined
    const t = setTimeout(() => {
      setScheduleStatus('idle')
      setScheduleError('')
    }, 4000)
    return () => clearTimeout(t)
  }, [scheduleStatus])

  useEffect(() => {
    if (!canSchedule || !uid || !activeWs) {
      setWsUuid(null)
      setWsResolved(false)
      return undefined
    }
    let cancelled = false
    async function loadSchedule() {
      setWsResolved(false)
      const { data: wsRow } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', uid)
        .eq('local_id', activeWs)
        .maybeSingle()
      if (cancelled) return
      const uuid = wsRow?.id ?? null
      setWsUuid(uuid)
      setWsResolved(true)
      if (!uuid) {
        setCadence('weekly')
        setScheduleEnabled(false)
        return
      }
      const { data: sched } = await supabase
        .from('brief_schedules')
        .select('cadence, active')
        .eq('user_id', uid)
        .eq('workspace_id', uuid)
        .maybeSingle()
      if (cancelled) return
      setCadence(sched?.cadence === 'daily' ? 'daily' : 'weekly')
      setScheduleEnabled(sched?.active === true)
    }
    loadSchedule()
    return () => { cancelled = true }
  }, [canSchedule, uid, activeWs])

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (menuOpen) setMenuOpen(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, menuOpen])

  useEffect(() => {
    if (!menuOpen) return undefined
    function onMouseDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [menuOpen])

  useEffect(() => {
    if (emailState !== 'sent' && emailState !== 'error') return undefined
    const t = setTimeout(() => {
      setEmailState('idle')
      setEmailError('')
    }, 4000)
    return () => clearTimeout(t)
  }, [emailState])

  useEffect(() => {
    if (phase !== 'loading') return undefined
    setLoadingStage(0)
    const t1 = setTimeout(() => setLoadingStage(1), 2500)
    const t2 = setTimeout(() => setLoadingStage(2), 8000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [phase])

  const stageLabel = STAGE_LABELS[loadingStage]?.(sourceCount) ?? STAGE_LABELS[0](sourceCount)

  async function handleGenerate() {
    setPhase('loading')
    setErrorMsg(null)
    setBrief(null)
    setUsage(null)
    setPreparedFor(null)
    setSourceCount(null)
    setGeneratedAt(null)
    setLoadingStage(0)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user?.is_anonymous) {
      setPhase('error')
      setErrorMsg(ACCOUNT_MSG)
      return
    }

    setPreparedFor(session.user?.user_metadata?.username || null)

    const widgetGroups = await gatherRoomItems(ws)
    const markets = gatherMarketSymbols(ws)
    const trends = gatherTrendsRequest(ws)
    const weather = await gatherWeather(ws)
    const includedGroups = widgetGroups.filter((g) => g.includeInBrief !== false)
    const totalItems = includedGroups.reduce((n, g) => n + countGroupItems(g), 0)
    const hasMarkets = markets && (markets.symbols?.length || markets.heatmaps?.length)
    const hasTrends = trends && trends.terms?.length
    const hasWeather = weather && weather.locations?.length

    if (totalItems === 0 && !hasMarkets && !hasTrends && !hasWeather) {
      setPhase('error')
      setErrorMsg(NO_ITEMS_MSG)
      return
    }

    setSourceCount(includedGroups.reduce((n, g) => n + countGroupItems(g), 0))

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ workspaceId: ws?.id, widgetGroups, period: 'on_demand', markets, trends, weather }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 200 && data.brief) {
        setBrief(data.brief)
        setUsage({ used: data.used, limit: data.limit })
        setGeneratedAt(data.created_at || new Date().toISOString())
        setPhase('result')
        return
      }

      if (res.status === 403 && data.error === 'BRIEF_REQUIRES_ACCOUNT') {
        setPhase('error')
        setErrorMsg(ACCOUNT_MSG)
        return
      }

      if (res.status === 429 && data.error === 'BRIEF_LIMIT_REACHED') {
        setPhase('error')
        setErrorMsg(data.message || 'You have reached your monthly brief limit.')
        return
      }

      if (data.error === 'BRIEF_EMPTY') {
        setPhase('error')
        setErrorMsg(EMPTY_MSG)
        return
      }
      if (data.error === 'BRIEF_PARSE_FAILED') {
        setPhase('error')
        setErrorMsg(PARSE_MSG)
        return
      }
      if (data.error === 'BRIEF_PROVIDER_ERROR') {
        setPhase('error')
        setErrorMsg(data.providerStatus
          ? `The brief provider returned an error (status ${data.providerStatus}). Please try again shortly.`
          : UNAVAILABLE_MSG)
        return
      }
      if (res.status === 503) {
        setPhase('error')
        setErrorMsg(UNAVAILABLE_MSG)
        return
      }

      setPhase('error')
      setErrorMsg(data.message || UNAVAILABLE_MSG)
    } catch {
      setPhase('error')
      setErrorMsg(UNAVAILABLE_MSG)
    }
  }

  function handleCopy() {
    if (!brief) return
    navigator.clipboard.writeText(briefToPlainText(brief)).catch(() => {})
  }

  function handleDownload() {
    if (!brief) return
    const text = briefToPlainText(brief)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'brief.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleEmailBrief() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user?.is_anonymous) {
      setEmailState('error')
      setEmailError('Sign in to email yourself a brief.')
      return
    }

    setEmailState('sending')
    setEmailError('')

    try {
      const res = await fetch('/api/jobs?action=email-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          brief,
          roomName: ws?.name || 'Risk Room',
          preparedFor,
          generatedAt,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 200 && data.sent) {
        setEmailState('sent')
        return
      }

      if (data.error === 'EMAIL_REQUIRES_ACCOUNT') {
        setEmailState('error')
        setEmailError('Create a free account to email briefs.')
        return
      }

      if (data.error === 'EMAIL_NOT_CONFIGURED') {
        setEmailState('error')
        setEmailError('Email is not set up yet.')
        return
      }

      setEmailState('error')
      setEmailError('Could not send the email. Please try again.')
    } catch {
      setEmailState('error')
      setEmailError('Could not send the email. Please try again.')
    }
  }

  async function handleDownloadPdf() {
    if (!brief || pdfBusy) return
    setPdfBusy(true)
    try {
      await buildBriefPdf({
        brief,
        ws,
        generatedAt,
        sourceCount,
        preparedFor,
        trendsChartEl: trendsChartRef.current,
      })
    } catch {
      // txt and Copy remain available on failure
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleSaveSchedule() {
    if (!wsUuid || !uid) return
    setSaveBusy(true)
    setScheduleStatus('idle')
    setScheduleError('')
    const next = new Date()
    next.setUTCHours(6, 0, 0, 0)
    if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1)
    const { error } = await supabase.from('brief_schedules').upsert(
      {
        user_id: uid,
        workspace_id: wsUuid,
        cadence,
        channel: 'email',
        active: scheduleEnabled,
        next_run_at: next.toISOString(),
      },
      { onConflict: 'user_id,workspace_id' },
    )
    setSaveBusy(false)
    if (error) {
      setScheduleStatus('error')
      setScheduleError('Could not save schedule.')
      return
    }
    setScheduleStatus('saved')
  }

  function renderScheduleStrip() {
    if (!canSchedule) {
      return (
        <div className="brief-schedule brief-schedule-locked">
          <span className="brief-schedule-label">Scheduled delivery</span>
          <p className="brief-schedule-note">
            Scheduled delivery is a paid feature. Upgrade to get this brief by email on a daily or weekly cadence.
          </p>
          <button type="button" className="brief-schedule-upgrade" onClick={() => onUpgrade?.()}>
            Upgrade
          </button>
        </div>
      )
    }
    if (wsResolved && !wsUuid) {
      return (
        <div className="brief-schedule">
          <span className="brief-schedule-label">Scheduled delivery</span>
          <p className="brief-schedule-note">Available once your room is saved</p>
        </div>
      )
    }
    return (
      <div className="brief-schedule">
        <span className="brief-schedule-label">Scheduled delivery</span>
        <select
          aria-label="Cadence"
          className="brief-schedule-select"
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          disabled={!wsUuid}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <button
          type="button"
          className={`brief-schedule-toggle${scheduleEnabled ? ' is-on' : ''}`}
          onClick={() => setScheduleEnabled((on) => !on)}
          disabled={!wsUuid}
          aria-pressed={scheduleEnabled}
        >
          {scheduleEnabled ? 'On' : 'Off'}
        </button>
        <button
          type="button"
          className="brief-schedule-save"
          onClick={handleSaveSchedule}
          disabled={!wsUuid || saveBusy}
        >
          Save
        </button>
        <span className="brief-schedule-channel">Sent by email.</span>
        {scheduleStatus === 'saved' && (
          <span className="brief-schedule-status">Saved.</span>
        )}
        {scheduleStatus === 'error' && scheduleError && (
          <span className="brief-schedule-status is-error">{scheduleError}</span>
        )}
        <p className="brief-schedule-note">
          Scheduled briefs cover your news and feed sections.
        </p>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Brief"
        className="modal brief-panel-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <GlobeGlyph size={20} />
            Brief
          </span>
          <div className="brief-header-actions">
            {phase === 'result' && brief && (
              <>
                <div className="brief-download-menu" ref={menuRef}>
                  <button
                    type="button"
                    className="brief-header-btn"
                    onClick={() => setMenuOpen((open) => !open)}
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                  >
                    Download
                  </button>
                  {menuOpen && (
                    <div className="brief-download-dropdown" role="menu">
                      <button
                        type="button"
                        className="brief-download-item"
                        role="menuitem"
                        disabled={pdfBusy}
                        onClick={() => {
                          setMenuOpen(false)
                          if (!pdfBusy) handleDownloadPdf()
                        }}
                      >
                        {pdfBusy ? 'Preparing PDF' : 'Download as PDF'}
                      </button>
                      <button
                        type="button"
                        className="brief-download-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          handleDownload()
                        }}
                      >
                        Download as text
                      </button>
                      <button
                        type="button"
                        className="brief-download-item"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          handleCopy()
                        }}
                      >
                        Copy text to clipboard
                      </button>
                      <button
                        type="button"
                        className="brief-download-item"
                        role="menuitem"
                        disabled={emailState === 'sending' || !briefEmailEnabled}
                        title={!briefEmailEnabled ? 'Brief emails are turned off in Settings.' : undefined}
                        onClick={() => {
                          if (!briefEmailEnabled) return
                          setMenuOpen(false)
                          handleEmailBrief()
                        }}
                      >
                        {emailState === 'sending' ? 'Sending...' : 'Email this to me'}
                      </button>
                    </div>
                  )}
                </div>
                {emailState === 'sent' && (
                  <span className="brief-stage" style={{ margin: 0 }}>Sent to your email.</span>
                )}
                {emailState === 'error' && emailError && (
                  <span className="brief-stage" style={{ margin: 0 }}>{emailError}</span>
                )}
              </>
            )}
            <button type="button" className="widget-btn" onClick={onClose} title="Close">
              ✕
            </button>
          </div>
        </div>

        {renderScheduleStrip()}

        <div className={`modal-body brief-panel-body${menuOpen ? ' brief-body-dimmed' : ''}`}>
          {phase === 'idle' && (
            <p className="brief-idle-copy">
              Summarize headlines from this room&apos;s News Search and RSS widgets into a cited brief.
            </p>
          )}

          {phase === 'loading' && (
            <div className="brief-skeleton" aria-busy="true" aria-live="polite">
              <div className="brief-skeleton-line" style={{ width: '40%' }} />
              <div className="brief-skeleton-line brief-skeleton-masthead" style={{ width: '55%' }} />
              <div className="brief-skeleton-line" style={{ width: '30%' }} />
              <div className="brief-skeleton-line" style={{ width: '100%' }} />
              <div className="brief-skeleton-line" style={{ width: '90%' }} />
              <div className="brief-skeleton-line" style={{ width: '70%' }} />
              <div className="brief-skeleton-line brief-skeleton-section" style={{ width: '35%' }} />
              <div className="brief-skeleton-line" style={{ width: '100%' }} />
              <div className="brief-skeleton-line" style={{ width: '85%' }} />
              <p className="brief-stage">{stageLabel}</p>
            </div>
          )}

          {phase === 'error' && errorMsg && (
            <p className="brief-error">{errorMsg}</p>
          )}

          {phase === 'result' && brief && (
            <article className="brief-content">
              <header className="brief-masthead">
                <div className="brief-masthead-room">{ws?.name || 'Risk Room'}</div>
                <div className="brief-masthead-meta">
                  {generatedAt && (
                    <span>
                      Generated{' '}
                      {new Date(generatedAt).toLocaleString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  {sourceCount != null && (
                    <span>
                      {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
                    </span>
                  )}
                </div>
                {preparedFor && (
                  <div className="brief-masthead-prepared">Prepared for {preparedFor}</div>
                )}
              </header>
              <h2 className="brief-headline">{brief.headline}</h2>
              {(brief.sections ?? []).map((section, si) => (
                <section key={section.widgetId || si} className="brief-section">
                  <h3 className="brief-section-title">{section.label}</h3>
                  {section.parts?.length ? (
                    section.parts.map((part, pi) => (
                      <div key={part.label || pi} className="brief-part">
                        <div className="brief-part-title">{part.label}</div>
                        {part.items?.length ? (
                          <div className="brief-items">
                            {part.items.map((item, ii) => renderBriefItemJsx(item, item.url || `${pi}-${ii}`))}
                          </div>
                        ) : (
                          <p className="brief-part-empty">No update this round</p>
                        )}
                      </div>
                    ))
                  ) : section.items?.length ? (
                    <div className="brief-items">
                      {section.items.map((item, ii) => renderBriefItemJsx(item, item.url || ii))}
                    </div>
                  ) : section.status === 'no_update' ? (
                    <p className="brief-bullet-text">No update from {section.label}</p>
                  ) : section.summary?.trim() ? (
                    <p className="brief-bullet-text">
                      {section.summary}
                      {section.sourceUrl?.startsWith('http') && (
                        <>
                          {' '}
                          <a
                            className="brief-source"
                            href={section.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {section.label}
                            {' ↗'}
                          </a>
                        </>
                      )}
                    </p>
                  ) : null}
                </section>
              ))}
              {brief.markets && ((brief.markets.rows?.length) || (brief.markets.heatmaps?.length)) ? (
                <section className="brief-section brief-markets">
                  <h3 className="brief-section-title">Markets</h3>
                  <div className="brief-markets-caption">as of last refresh</div>
                  <ul className="brief-markets-list">
                    {(brief.markets.rows ?? []).map((r) => (
                      <li key={r.symbol} className="brief-markets-row">
                        <span className="bm-sym">{r.symbol}</span>
                        <span className="bm-name">{r.name}</span>
                        <span className="bm-price">{r.price}{r.currency ? ' ' + r.currency : ''}</span>
                        <span className={`bm-chg bm-${r.dir}`}>{fmtPct(r.changePct)}</span>
                      </li>
                    ))}
                    {(brief.markets.heatmaps ?? []).map((h) => (
                      <li key={h.symbol} className="brief-markets-row">
                        <span className="bm-sym">{h.label}</span>
                        <span className="bm-name">({h.symbol})</span>
                        <span className="bm-price"></span>
                        <span className={`bm-chg bm-${h.dir}`}>{fmtPct(h.changePct)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {brief.trends && (brief.trends.terms?.length) ? (
                <section className="brief-section brief-markets">
                  <h3 className="brief-section-title">Search Interest</h3>
                  <div className="brief-markets-caption">relative search interest{brief.trends.windowLabel ? ` over the last ${brief.trends.windowLabel}` : ''}, not volume</div>
                  {(() => {
                    const terms = brief.trends.terms ?? []
                    const trendsKeywords = terms.map((t) => t.term)
                    const trendsValues = terms.map((t) => t.value)
                    const len = terms.reduce((m, t) => Math.max(m, Array.isArray(t.series) ? t.series.length : 0), 0)
                    const trendsPoints = len
                      ? Array.from({ length: len }, (_, idx) => ({
                          label: '',
                          values: terms.map((t) => (Array.isArray(t.series) ? (t.series[idx] ?? null) : null)),
                        }))
                      : []
                    return (
                      <>
                        <div className="brief-trends-chart-wrap" style={{ height: 150 }}>
                          <TrendsChart points={trendsPoints} keywords={trendsKeywords} chartRef={trendsChartRef} />
                        </div>
                        <TrendsLegend keywords={trendsKeywords} values={trendsValues} colors={COLORS} />
                      </>
                    )
                  })()}
                  {isHttpUrl(brief.trends.googleTrendsUrl) && (
                    <a
                      className="brief-source"
                      href={brief.trends.googleTrendsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google Trends
                      {' ↗'}
                    </a>
                  )}
                </section>
              ) : null}
              {brief.weather && (brief.weather.locations?.length) ? (
                <section className="brief-section brief-weather">
                  <h3 className="brief-section-title">Weather</h3>
                  {brief.weather.locations.map((l, i) => (
                    <div key={l.name + i} className="brief-weather-loc">
                      <span className="bw-name">{l.name}</span>
                      <span className="bw-line">{l.tempC}{DEG}C, feels {l.feelsC}{DEG}C, {l.condition}. Wind {l.windKph} km/h, humidity {l.humidity}%.</span>
                      {l.todayMaxC != null && (
                        <span className="bw-line"> Today {l.todayMaxC}{DEG} / {l.todayMinC}{DEG}. Tomorrow {l.tomorrowMaxC}{DEG} / {l.tomorrowMinC}{DEG}, {l.tomorrowCondition}.</span>
                      )}
                    </div>
                  ))}
                </section>
              ) : null}
              {usage && (() => {
                const remaining = Math.max(0, (usage.limit ?? 0) - (usage.used ?? 0))
                const resetDays = daysUntilReset()
                return (
                  <div className="brief-foot">
                    <span>
                      {remaining} briefs left. Resets in {resetDays}{' '}
                      {resetDays === 1 ? 'day' : 'days'}.
                    </span>
                  </div>
                )
              })()}
              <p className="brief-sourcing-note">
                Summary of this room&apos;s own sources. Vigil tracks, it does not verify.
              </p>
            </article>
          )}

          {phase !== 'result' && (
            <div className="brief-actions">
              <button
                type="button"
                className="nav-add-btn btn-primary"
                onClick={handleGenerate}
                disabled={phase === 'loading'}
              >
                Generate brief
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

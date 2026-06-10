import { useEffect, useRef, useState } from 'react'
import { useShellStore } from '../state/shellStore.js'
import { supabase } from '../lib/supabase.js'
import { gatherRoomItems } from '../lib/gatherRoomItems.js'

const ACCOUNT_MSG = 'Create a free account to generate briefs.'
const NO_ITEMS_MSG = 'Add a News Search or RSS widget to your room, then generate a brief.'
const UNAVAILABLE_MSG = 'Briefs are temporarily unavailable. Please try again shortly.'
const EMPTY_MSG = 'The brief came back empty. This can happen on very large rooms. Try generating again, or remove a few feeds first.'
const PARSE_MSG = 'The brief came back in an unexpected format. Please try generating again.'

const STAGE_LABELS = [
  (count) => (count ? `Gathering ${count} headlines` : 'Gathering headlines'),
  () => 'Grouping into themes',
  () => 'Writing the brief',
]

function briefToPlainText(brief) {
  const lines = [brief.headline, '']
  for (const section of brief.sections ?? []) {
    if (section.title?.trim()) {
      lines.push(section.title)
      lines.push('')
    }
    for (const bullet of section.bullets ?? []) {
      const label = bullet.source?.label
      lines.push(`- ${bullet.text}${label ? ` (${label})` : ''}`)
    }
    if ((section.bullets ?? []).length) lines.push('')
  }
  return lines.join('\n').trim()
}

function daysUntilReset() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return Math.max(1, Math.ceil((next - now) / 86400000))
}

export default function BriefPanel({ onClose }) {
  const workspaces = useShellStore((s) => s.workspaces)
  const activeWs = useShellStore((s) => s.activeWs)
  const ws = workspaces.find((w) => w.id === activeWs)

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
  const menuRef = useRef(null)

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

    const items = await gatherRoomItems(ws)
    if (!items.length) {
      setPhase('error')
      setErrorMsg(NO_ITEMS_MSG)
      return
    }

    setSourceCount(Math.min(items.length, 18))

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          workspaceId: ws?.id,
          items,
          period: 'on_demand',
        }),
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
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 18
      const contentW = pageW - margin * 2
      let y = margin
      const ensure = (h) => { if (y + h > pageH - margin) { doc.addPage(); y = margin } }
      const writeWrapped = (text, opts = {}) => {
        const { size = 10, style = 'normal', color = [33, 33, 33], gap = 1.5, lineH = 5 } = opts
        doc.setFont('helvetica', style)
        doc.setFontSize(size)
        doc.setTextColor(...color)
        for (const ln of doc.splitTextToSize(text, contentW)) {
          ensure(lineH)
          doc.text(ln, margin, y)
          y += lineH
        }
        y += gap
      }
      writeWrapped(ws?.name || 'Risk Room', { size: 14, style: 'bold', gap: 1 })
      const metaBits = []
      if (generatedAt) {
        metaBits.push('Generated ' + new Date(generatedAt).toLocaleString(undefined, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }))
      }
      if (sourceCount != null) {
        metaBits.push(sourceCount + (sourceCount === 1 ? ' source' : ' sources'))
      }
      if (metaBits.length) writeWrapped(metaBits.join('    '), { size: 9, color: [120, 120, 120], gap: 1 })
      if (preparedFor) writeWrapped('Prepared for ' + preparedFor, { size: 10, color: [80, 80, 80], gap: 2 })
      ensure(2)
      doc.setDrawColor(210, 210, 210)
      doc.line(margin, y, pageW - margin, y)
      y += 5
      writeWrapped(brief.headline, { size: 13, style: 'bold', gap: 3 })
      for (const section of brief.sections ?? []) {
        if (section.title?.trim()) writeWrapped(section.title, { size: 11, style: 'bold', gap: 1.5 })
        for (const bullet of section.bullets ?? []) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          doc.setTextColor(33, 33, 33)
          for (const ln of doc.splitTextToSize('- ' + bullet.text, contentW)) {
            ensure(5)
            doc.text(ln, margin, y)
            y += 5
          }
          const url = bullet.source?.url
          if (url && url.startsWith('http')) {
            ensure(5)
            doc.setFontSize(9)
            doc.setTextColor(20, 90, 160)
            doc.textWithLink(bullet.source?.label || 'Source', margin + 4, y, { url })
            y += 6
          } else {
            y += 1.5
          }
        }
        y += 2
      }
      ensure(8)
      writeWrapped("Summary of this room's own sources. Vigil tracks, it does not verify.", { size: 8, color: [120, 120, 120] })
      doc.save('brief.pdf')
    } catch {
      // txt and Copy remain available on failure
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal brief-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Brief</span>
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
                        disabled={emailState === 'sending'}
                        onClick={() => {
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
                <section key={si} className="brief-section">
                  {section.title?.trim() ? (
                    <h3 className="brief-section-title">{section.title}</h3>
                  ) : null}
                  <ul className="brief-bullets">
                    {(section.bullets ?? []).map((bullet, bi) => (
                      <li key={bi} className="brief-bullet">
                        <span className="brief-bullet-text">
                          {bullet.text}
                          {bullet.source?.url?.startsWith('http') && (
                            <>
                              {' '}
                              <a
                                className="brief-source"
                                href={bullet.source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {bullet.source.label || 'Source'}
                                {' ↗'}
                              </a>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
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

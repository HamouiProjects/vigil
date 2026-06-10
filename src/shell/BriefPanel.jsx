import { useEffect, useState } from 'react'
import { useShellStore } from '../state/shellStore.js'
import { supabase } from '../lib/supabase.js'
import { gatherRoomItems } from '../lib/gatherRoomItems.js'

const ACCOUNT_MSG = 'Create a free account to generate briefs.'
const NO_ITEMS_MSG = 'Add a News Search or RSS widget to your room, then generate a brief.'
const UNAVAILABLE_MSG = 'Briefs are temporarily unavailable. Please try again shortly.'
const EMPTY_MSG = 'The brief came back empty. This can happen on very large rooms. Try generating again, or remove a few feeds first.'
const PARSE_MSG = 'The brief came back in an unexpected format. Please try generating again.'

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

export default function BriefPanel({ onClose }) {
  const workspaces = useShellStore((s) => s.workspaces)
  const activeWs = useShellStore((s) => s.activeWs)
  const ws = workspaces.find((w) => w.id === activeWs)

  const [phase, setPhase] = useState('idle')
  const [errorMsg, setErrorMsg] = useState(null)
  const [brief, setBrief] = useState(null)
  const [usage, setUsage] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleGenerate() {
    setPhase('loading')
    setErrorMsg(null)
    setBrief(null)
    setUsage(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session || session.user?.is_anonymous) {
      setPhase('error')
      setErrorMsg(ACCOUNT_MSG)
      return
    }

    const items = await gatherRoomItems(ws)
    if (!items.length) {
      setPhase('error')
      setErrorMsg(NO_ITEMS_MSG)
      return
    }

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal brief-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Brief</span>
          <div className="brief-header-actions">
            {phase === 'result' && brief && (
              <>
                <button type="button" className="brief-header-btn" onClick={handleCopy}>
                  Copy
                </button>
                <button type="button" className="brief-header-btn" onClick={handleDownload}>
                  Download
                </button>
              </>
            )}
            <button type="button" className="widget-btn" onClick={onClose} title="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="modal-body brief-panel-body">
          {phase === 'idle' && (
            <p className="brief-idle-copy">
              Summarize headlines from this room&apos;s News Search and RSS widgets into a cited brief.
            </p>
          )}

          {phase === 'loading' && (
            <p className="brief-loading">Gathering headlines and writing your brief…</p>
          )}

          {phase === 'error' && errorMsg && (
            <p className="brief-error">{errorMsg}</p>
          )}

          {phase === 'result' && brief && (
            <article className="brief-content">
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
              {usage && (
                <div className="brief-foot">
                  <span>Used {usage.used} of {usage.limit} this month</span>
                </div>
              )}
            </article>
          )}

          <div className="brief-actions">
            <button
              type="button"
              className="nav-add-btn btn-primary"
              onClick={handleGenerate}
              disabled={phase === 'loading'}
            >
              {phase === 'result' ? 'Generate again' : 'Generate brief'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

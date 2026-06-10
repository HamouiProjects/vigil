import { useEffect, useState } from 'react'
import { useShellStore } from '../state/shellStore.js'
import { supabase } from '../lib/supabase.js'
import { gatherRoomItems } from '../lib/gatherRoomItems.js'

const ACCOUNT_MSG = 'Create a free account to generate briefs.'
const NO_ITEMS_MSG = 'Add a News Search or RSS widget to your room, then generate a brief.'
const UNAVAILABLE_MSG = 'Briefs are temporarily unavailable. Please try again shortly.'

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

      if (res.status === 502 || res.status === 503) {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal brief-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Brief</span>
          <button type="button" className="widget-btn" onClick={onClose} title="Close">
            ✕
          </button>
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
                  {section.title ? (
                    <h3 className="brief-section-title">{section.title}</h3>
                  ) : null}
                  <ul className="brief-bullets">
                    {(section.bullets ?? []).map((bullet, bi) => (
                      <li key={bi} className="brief-bullet">
                        <span>{bullet.text}</span>
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
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {usage && (
                <p className="brief-meta">
                  Used {usage.used} of {usage.limit} this month.
                </p>
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

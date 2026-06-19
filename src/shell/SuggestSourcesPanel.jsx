import { useState, useMemo } from 'react'
import { useShellStore } from '../state/shellStore.js'
import { useSources } from '../data/useSources.js'

const DISCLAIMER = 'These are suggestions of publicly available sources, not verified or endorsed by Vigil, and not a substitute for your own due diligence.'

const TIER_LABEL = {
  mainstream: 'Mainstream / international',
  local: 'Credible local',
  manufactured: 'Manufactured feed',
  social: 'Social, unverified',
}
const BASIS_LABEL = {
  domain: 'Official (domain-verified)',
  platform: 'Platform-verified',
  verifier: 'Official (trusted verifier)',
  none: 'Not verified',
}

function parseTerms(text) {
  return (text || '').split(',').map(s => s.trim()).filter(Boolean)
}
function isHttpUrl(u) {
  if (typeof u !== 'string') return false
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' } catch { return false }
}

export default function SuggestSourcesPanel({ onClose }) {
  const activeWs = useShellStore(s => s.activeWs)
  const workspaces = useShellStore(s => s.workspaces)
  const updateWidgetConfig = useShellStore(s => s.updateWidgetConfig)
  const { sources, addSource } = useSources()

  const ws = useMemo(() => workspaces.find(w => w.id === activeWs), [workspaces, activeWs])
  const widgetTypes = useMemo(() => [...new Set((ws?.widgets ?? []).map(w => w.type))], [ws])
  const existingFeedUrls = useMemo(() => {
    const target = (ws?.widgets ?? []).find(w => w.type === 'rss')
    const feeds = target?.config?.feeds ?? []
    const byId = new Map(sources.map(src => [src.id, src.identifier]))
    return new Set(feeds.map(f => byId.get(f.sourceId)).filter(Boolean))
  }, [ws, sources])

  const [topics, setTopics] = useState('')
  const [regions, setRegions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [accepted, setAccepted] = useState(() => new Set())
  const [dismissed, setDismissed] = useState(() => new Set())

  async function runSuggest() {
    const t = parseTerms(topics)
    const r = parseTerms(regions)
    if (t.length === 0 && r.length === 0) { setError('Enter at least one topic or region.'); return }
    setError('')
    setLoading(true)
    setResult(null)
    setAccepted(new Set())
    setDismissed(new Set())
    try {
      const res = await fetch('/api/jobs?action=suggest-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: t, regions: r, widgetTypes }),
      })
      if (!res.ok) { setError('Could not fetch suggestions. Try again.'); setLoading(false); return }
      const data = await res.json()
      setResult(data)
    } catch {
      setError('Could not fetch suggestions. Try again.')
    }
    setLoading(false)
  }

  async function acceptSuggestion(s) {
    if (s.widgetType !== 'rss') return
    const target = (ws?.widgets ?? []).find(w => w.type === 'rss')
    if (!target) { setError('Add an RSS widget to accept this.'); return }
    const row = await addSource({ type: 'rss', identifier: s.value, label: s.label, meta: { suggested: true } })
    if (!row) { setError('Could not add the feed.'); return }
    const feeds = target.config?.feeds ?? []
    if (!feeds.some(f => f.sourceId === row.id)) {
      updateWidgetConfig(activeWs, target.id, { ...target.config, feeds: [...feeds, { sourceId: row.id, enabled: true }] })
    }
    setAccepted(prev => { const n = new Set(prev); n.add(s.value); return n })
  }

  const visible = (result?.suggestions ?? []).filter(s => !dismissed.has(s.value))
  const rssGroup = visible.filter(s => s.widgetType === 'rss')

  return (
    <div className="suggest-overlay" onClick={onClose}>
      <div className="suggest-panel" onClick={e => e.stopPropagation()}>
        <div className="suggest-head">
          <h2 className="suggest-heading">Suggest sources</h2>
          <button type="button" className="widget-btn" onClick={onClose} title="Close">x</button>
        </div>
        <div className="suggest-scroll">
          <p className="suggest-disclaimer">{result?.disclaimer ?? DISCLAIMER}</p>
          <div className="suggest-inputs">
            <label className="suggest-field">Topics
              <input type="text" value={topics} onChange={e => setTopics(e.target.value)} placeholder="e.g. a conflict, market, or topic" />
            </label>
            <label className="suggest-field">Also include
              <input type="text" value={regions} onChange={e => setRegions(e.target.value)} placeholder="e.g. a team, place, or event" />
            </label>
            {regions.trim() === '' && (
              <p className="suggest-hint">Add a place to also pull in local outlets.</p>
            )}
            <button type="button" className="nav-add-btn btn-primary" onClick={runSuggest} disabled={loading}>
              {loading ? 'Finding sources...' : 'Suggest sources'}
            </button>
          </div>
          {error && <p className="suggest-error">{error}</p>}
          {loading && (
            <div className="suggest-loading" role="status" aria-live="polite">
              <div className="suggest-progress-track" aria-hidden="true">
                <div className="suggest-progress-bar" />
              </div>
              <p className="suggest-loading-note">Checking real, publicly available feeds. This usually takes around 15 to 40 seconds.</p>
            </div>
          )}
          {result && !loading && (
            <div className="suggest-results">
              {rssGroup.length === 0 && (
                <p className="suggest-empty">
                  {widgetTypes.includes('rss')
                    ? 'No sources resolved for these terms. Try a broader topic or region.'
                    : 'Add an RSS widget to this room to get source suggestions.'}
                </p>
              )}
              {rssGroup.length > 0 && (
                <div className="suggest-group">
                  <h3 className="suggest-group-title">RSS</h3>
                  {rssGroup.map(s => (
                    <div key={s.value} className="suggest-row">
                      <div className="suggest-row-main">
                        <span className="suggest-tier">{TIER_LABEL[s.tier] ?? s.tier}</span>
                        <span className="suggest-name">{s.label}</span>
                        <span className="suggest-basis">{BASIS_LABEL[s.verificationBasis] ?? 'Not verified'}</span>
                      </div>
                      <div className="suggest-row-actions">
                        {isHttpUrl(s.sourceLink) && (
                          <a className="suggest-link" href={s.sourceLink} target="_blank" rel="noreferrer noopener">Source</a>
                        )}
                        {(accepted.has(s.value) || existingFeedUrls.has(s.value))
                          ? <span className="suggest-added">Added</span>
                          : (<>
                              <button type="button" className="nav-add-btn btn-secondary" onClick={() => acceptSuggestion(s)}>Accept</button>
                              <button type="button" className="widget-btn" onClick={() => setDismissed(prev => { const n = new Set(prev); n.add(s.value); return n })} title="Dismiss">x</button>
                            </>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

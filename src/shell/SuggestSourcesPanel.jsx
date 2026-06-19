import { useState, useMemo } from 'react'
import { useShellStore } from '../state/shellStore.js'
import { useSources } from '../data/useSources.js'
import { supabase } from '../lib/supabase.js'

const DISCLAIMER = 'These are suggestions of publicly available sources, not verified or endorsed by Vigil, and not a substitute for your own due diligence.'

function parseTerms(text) {
  return (text || '').split(',').map(s => s.trim()).filter(Boolean)
}
function isHttpUrl(u) {
  if (typeof u !== 'string') return false
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' } catch { return false }
}

const sid = (s) => s.widgetType + ':' + (s.platform ? s.platform + ':' : '') + s.value

// Mirrors SocialFeedWidget's account resolution so accepting a suggestion preserves existing or default accounts.
const SOCIAL_DEFAULT_ACCOUNTS = [
  { id: 'acc-0', platform: 'reddit', value: 'worldnews', enabled: true },
  { id: 'acc-1', platform: 'reddit', value: 'geopolitics', enabled: true },
]
const socialAccountsOf = (w) =>
  w?.config?.accounts ??
  (Array.isArray(w?.config?.subs)
    ? w.config.subs.map(x => ({ id: x.id, platform: 'reddit', value: x.name, enabled: x.enabled }))
    : SOCIAL_DEFAULT_ACCOUNTS)

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
  const existingSymbols = useMemo(() => {
    const target = (ws?.widgets ?? []).find(w => w.type === 'prices')
    const syms = target?.config?.symbols ?? []
    return new Set(syms.map(s => s.tvSymbol).filter(Boolean))
  }, [ws])
  const existingChartSymbol = useMemo(() => {
    const target = (ws?.widgets ?? []).find(w => w.type === 'chart')
    return target?.config?.symbol ?? null
  }, [ws])
  const existingFeedKeywords = useMemo(() => {
    const target = (ws?.widgets ?? []).find(w => w.type === 'feed')
    const tabs = target?.config?.tabs ?? []
    return new Set(tabs.map(t => (t.keyword || '').toLowerCase()).filter(Boolean))
  }, [ws])
  const existingTrendsKeywords = useMemo(() => {
    const target = (ws?.widgets ?? []).find(w => w.type === 'trends')
    const cfg = target?.config ?? {}
    const kws = (Array.isArray(cfg.keywords) && cfg.keywords.length) ? cfg.keywords : (cfg.keyword ? [cfg.keyword] : [])
    return new Set(kws.map(k => String(k || '').toLowerCase()).filter(Boolean))
  }, [ws])
  const existingSocialAccounts = useMemo(() => {
    const target = (ws?.widgets ?? []).find(w => w.type === 'social')
    if (!target) return new Set()
    return new Set(socialAccountsOf(target).map(a => `${a.platform}:${String(a.value || '').toLowerCase()}`))
  }, [ws])

  const [topics, setTopics] = useState('')
  const [regions, setRegions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [accepted, setAccepted] = useState(() => new Set())
  const [acceptedChart, setAcceptedChart] = useState(null)
  const [dismissed, setDismissed] = useState(() => new Set())

  async function runSuggest() {
    const t = parseTerms(topics)
    const r = parseTerms(regions)
    if (t.length === 0 && r.length === 0) { setError('Enter at least one topic or region.'); return }
    setError('')
    setLoading(true)
    setResult(null)
    setAccepted(new Set())
    setAcceptedChart(null)
    setDismissed(new Set())
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('Session expired. Reload and try again.'); setLoading(false); return }
      const res = await fetch('/api/jobs?action=suggest-sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
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
    if (s.widgetType === 'rss') {
      const target = (ws?.widgets ?? []).find(w => w.type === 'rss')
      if (!target) { setError('Add an RSS widget to accept this.'); return }
      const row = await addSource({ type: 'rss', identifier: s.value, label: s.label, meta: { suggested: true } })
      if (!row) { setError('Could not add the feed.'); return }
      const feeds = target.config?.feeds ?? []
      if (!feeds.some(f => f.sourceId === row.id)) {
        updateWidgetConfig(activeWs, target.id, { ...target.config, feeds: [...feeds, { sourceId: row.id, enabled: true }] })
      }
      setAccepted(prev => { const n = new Set(prev); n.add(sid(s)); return n })
      return
    }
    if (s.widgetType === 'prices') {
      const target = (ws?.widgets ?? []).find(w => w.type === 'prices')
      if (!target) { setError('Add a Prices widget to accept this.'); return }
      const syms = target.config?.symbols ?? []
      if (!syms.some(item => item.tvSymbol === s.value)) {
        updateWidgetConfig(activeWs, target.id, { ...target.config, symbols: [...syms, { tvSymbol: s.value, display: s.display, description: s.description }] })
      }
      setAccepted(prev => { const n = new Set(prev); n.add(sid(s)); return n })
    }
    if (s.widgetType === 'chart') {
      const target = (ws?.widgets ?? []).find(w => w.type === 'chart')
      if (!target) { setError('Add a Chart widget to accept this.'); return }
      updateWidgetConfig(activeWs, target.id, { ...target.config, symbol: s.value })
      setAcceptedChart(s.value)
    }
    if (s.widgetType === 'feed') {
      const target = (ws?.widgets ?? []).find(w => w.type === 'feed')
      if (!target) { setError('Add a News Search widget to accept this.'); return }
      const tabs = target.config?.tabs ?? []
      if (!tabs.some(t => (t.keyword || '').toLowerCase() === s.value.toLowerCase())) {
        updateWidgetConfig(activeWs, target.id, { ...target.config, tabs: [...tabs, { id: `tab-${Date.now()}`, keyword: s.value }] })
      }
      setAccepted(prev => { const n = new Set(prev); n.add(sid(s)); return n })
    }
    if (s.widgetType === 'trends') {
      const target = (ws?.widgets ?? []).find(w => w.type === 'trends')
      if (!target) { setError('Add a Search Interest widget to accept this.'); return }
      const cfg = target.config ?? {}
      const kws = (Array.isArray(cfg.keywords) && cfg.keywords.length) ? cfg.keywords : (cfg.keyword ? [cfg.keyword] : [])
      if (kws.some(k => String(k || '').toLowerCase() === s.value.toLowerCase())) {
        setAccepted(prev => { const n = new Set(prev); n.add(sid(s)); return n }); return
      }
      if (kws.length >= 5) { setError('Search Interest compares up to 5 terms. Remove one first.'); return }
      updateWidgetConfig(activeWs, target.id, { ...cfg, keywords: [...kws, s.value] })
      setAccepted(prev => { const n = new Set(prev); n.add(sid(s)); return n })
    }
    if (s.widgetType === 'social') {
      const target = (ws?.widgets ?? []).find(w => w.type === 'social')
      if (!target) { setError('Add a Social widget to accept this.'); return }
      const accts = socialAccountsOf(target)
      const dupe = accts.some(a => a.platform === s.platform && String(a.value || '').toLowerCase() === s.value.toLowerCase())
      if (!dupe) {
        updateWidgetConfig(activeWs, target.id, { ...target.config, accounts: [...accts, { id: `acc-${Date.now()}`, platform: s.platform, value: s.value, enabled: true }] })
      }
      setAccepted(prev => { const n = new Set(prev); n.add(sid(s)); return n })
    }
  }

  const visible = (result?.suggestions ?? []).filter(s => !dismissed.has(sid(s)))
  const rssGroup = visible.filter(s => s.widgetType === 'rss')
  const pricesGroup = visible.filter(s => s.widgetType === 'prices')
  const chartGroup = visible.filter(s => s.widgetType === 'chart')
  const feedGroup = visible.filter(s => s.widgetType === 'feed')
  const trendsGroup = visible.filter(s => s.widgetType === 'trends')
  const socialGroup = visible.filter(s => s.widgetType === 'social')

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
                    <div key={sid(s)} className="suggest-row">
                      <div className="suggest-row-main">
                        {isHttpUrl(s.sourceLink)
                          ? <a className="suggest-name suggest-name-link" href={s.sourceLink} target="_blank" rel="noreferrer noopener">{s.label}</a>
                          : <span className="suggest-name">{s.label}</span>}
                      </div>
                      <div className="suggest-row-actions">
                        {(accepted.has(sid(s)) || existingFeedUrls.has(s.value))
                          ? <span className="suggest-added">Added</span>
                          : (<>
                              <button type="button" className="nav-add-btn btn-secondary" onClick={() => acceptSuggestion(s)}>Accept</button>
                              <button type="button" className="widget-btn" onClick={() => setDismissed(prev => { const n = new Set(prev); n.add(sid(s)); return n })} title="Dismiss">x</button>
                            </>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {widgetTypes.includes('prices') && pricesGroup.length === 0 && (
                <p className="suggest-empty">No instruments resolved for these terms.</p>
              )}
              {pricesGroup.length > 0 && (
                <div className="suggest-group">
                  <h3 className="suggest-group-title">Prices</h3>
                  {pricesGroup.map(s => (
                    <div key={sid(s)} className="suggest-row">
                      <div className="suggest-row-main">
                        <span className="suggest-name">{s.label}</span>
                        <span className="suggest-detail">{s.value}</span>
                      </div>
                      <div className="suggest-row-actions">
                        {(accepted.has(sid(s)) || existingSymbols.has(s.value))
                          ? <span className="suggest-added">Added</span>
                          : (<>
                              <button type="button" className="nav-add-btn btn-secondary" onClick={() => acceptSuggestion(s)}>Accept</button>
                              <button type="button" className="widget-btn" onClick={() => setDismissed(prev => { const n = new Set(prev); n.add(sid(s)); return n })} title="Dismiss">x</button>
                            </>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {widgetTypes.includes('chart') && chartGroup.length === 0 && (
                <p className="suggest-empty">No instruments resolved for these terms.</p>
              )}
              {chartGroup.length > 0 && (
                <div className="suggest-group">
                  <h3 className="suggest-group-title">Chart</h3>
                  {chartGroup.map(s => (
                    <div key={sid(s)} className="suggest-row">
                      <div className="suggest-row-main">
                        <span className="suggest-name">{s.label}</span>
                        <span className="suggest-detail">{s.value}</span>
                      </div>
                      <div className="suggest-row-actions">
                        {(acceptedChart === s.value || existingChartSymbol === s.value)
                          ? <span className="suggest-added">Added</span>
                          : (<>
                              <button type="button" className="nav-add-btn btn-secondary" onClick={() => acceptSuggestion(s)}>Accept</button>
                              <button type="button" className="widget-btn" onClick={() => setDismissed(prev => { const n = new Set(prev); n.add(sid(s)); return n })} title="Dismiss">x</button>
                            </>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {widgetTypes.includes('feed') && feedGroup.length === 0 && (
                <p className="suggest-empty">No keywords suggested for these terms.</p>
              )}
              {feedGroup.length > 0 && (
                <div className="suggest-group">
                  <h3 className="suggest-group-title">News Search</h3>
                  {feedGroup.map(s => (
                    <div key={sid(s)} className="suggest-row">
                      <div className="suggest-row-main">
                        <span className="suggest-name">{s.label}</span>
                      </div>
                      <div className="suggest-row-actions">
                        {(accepted.has(sid(s)) || existingFeedKeywords.has(s.value.toLowerCase()))
                          ? <span className="suggest-added">Added</span>
                          : (<>
                              <button type="button" className="nav-add-btn btn-secondary" onClick={() => acceptSuggestion(s)}>Accept</button>
                              <button type="button" className="widget-btn" onClick={() => setDismissed(prev => { const n = new Set(prev); n.add(sid(s)); return n })} title="Dismiss">x</button>
                            </>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {widgetTypes.includes('trends') && trendsGroup.length === 0 && (
                <p className="suggest-empty">No search terms suggested.</p>
              )}
              {trendsGroup.length > 0 && (
                <div className="suggest-group">
                  <h3 className="suggest-group-title">Search Interest</h3>
                  {trendsGroup.map(s => (
                    <div key={sid(s)} className="suggest-row">
                      <div className="suggest-row-main">
                        <span className="suggest-name">{s.label}</span>
                      </div>
                      <div className="suggest-row-actions">
                        {(accepted.has(sid(s)) || existingTrendsKeywords.has(s.value.toLowerCase()))
                          ? <span className="suggest-added">Added</span>
                          : (<>
                              <button type="button" className="nav-add-btn btn-secondary" onClick={() => acceptSuggestion(s)}>Accept</button>
                              <button type="button" className="widget-btn" onClick={() => setDismissed(prev => { const n = new Set(prev); n.add(sid(s)); return n })} title="Dismiss">x</button>
                            </>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {widgetTypes.includes('social') && socialGroup.length === 0 && (
                <p className="suggest-empty">No accounts resolved for these terms.</p>
              )}
              {socialGroup.length > 0 && (
                <div className="suggest-group">
                  <h3 className="suggest-group-title">Social</h3>
                  {socialGroup.map(s => (
                    <div key={sid(s)} className="suggest-row">
                      <div className="suggest-row-main">
                        <span className="suggest-name">{s.label}</span>
                        <span className="suggest-detail">{s.platform === 'reddit' ? 'Reddit' : 'Bluesky'}</span>
                      </div>
                      <div className="suggest-row-actions">
                        {(accepted.has(sid(s)) || existingSocialAccounts.has(`${s.platform}:${s.value.toLowerCase()}`))
                          ? <span className="suggest-added">Added</span>
                          : (<>
                              <button type="button" className="nav-add-btn btn-secondary" onClick={() => acceptSuggestion(s)}>Accept</button>
                              <button type="button" className="widget-btn" onClick={() => setDismissed(prev => { const n = new Set(prev); n.add(sid(s)); return n })} title="Dismiss">x</button>
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

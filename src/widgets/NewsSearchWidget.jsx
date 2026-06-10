import { useState, useEffect, useCallback, useRef } from 'react'
import usePageVisibility from '../hooks/usePageVisibility'
import { SkeletonFeedItems } from '../components/shared/SkeletonLoader'
import { InfoTooltip } from '../components/shared/WHeader'

export const GN_SEARCH_URL = q =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`

function relTime(pubDate) {
  if (!pubDate) return ''
  const then = new Date(pubDate.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(pubDate) ? '' : 'Z')).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then), m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

async function fetchNewsSearch(q) {
  const res = await fetch(`/api/rss?url=${encodeURIComponent(GN_SEARCH_URL(q))}`, { signal: AbortSignal.timeout(12000) })
  const json = await res.json().catch(() => null)
  if (res.status === 429 || json?.status === 'rate_limited') throw new Error('rate_limited')
  if (!json || json.status !== 'ok') throw new Error(json?.error || 'Feed error')
  const items = json.items ?? []
  if (!items.length) throw new Error('No results')
  return items.map(it => ({
    title: it.title ?? '(no title)',
    link: it.link ?? '',
    pubDate: it.pubDate ?? '',
    source: it.author ?? '',
    description: (it.description ?? '').replace(/<[^>]*>/g, ''),
  }))
}

function nsExtractSource(title) { const p = (title ?? '').split(' - '); return p.length > 1 ? p[p.length - 1].trim() : '' }
function nsCleanTitle(title) { const p = (title ?? '').split(' - '); return p.length > 1 ? p.slice(0, -1).join(' - ').trim() : (title ?? '') }

export const KF_DEFAULT_TABS = [
  { id: 'world',     keyword: 'World'     },
  { id: 'conflicts', keyword: 'Conflicts' },
  { id: 'economy',   keyword: 'Economy'   },
]

export default function NewsSearchWidget({ paused, config, onSaveConfig, setActions }) {
  const tabs = config.tabs ?? KF_DEFAULT_TABS
  const [activeId, setActiveId] = useState(() => (config.tabs ?? KF_DEFAULT_TABS)[0]?.id ?? 'world')
  const [cache, setCache] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newKw, setNewKw] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(config.sidebarOpen ?? true)

  const tabsRef = useRef(tabs); tabsRef.current = tabs
  const cacheRef = useRef(cache); cacheRef.current = cache
  const pausedRef = useRef(paused); useEffect(() => { pausedRef.current = paused }, [paused])
  const configRef = useRef(config); configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig); onSaveConfigRef.current = onSaveConfig
  const didMountRef = useRef(false)
  const containerRef = useRef(null)

  function patch(p) { onSaveConfigRef.current({ ...configRef.current, ...p }) }
  function saveTabs(next) { patch({ tabs: next }) }

  const load = useCallback(async (tabId, keyword) => {
    setLoading(true); setError(null)
    try {
      const items = await fetchNewsSearch(keyword)
      setCache(prev => ({ ...prev, [tabId]: { items: items.slice(0, 50), fetchedAt: Date.now() } }))
    } catch (e) {
      setError(e.message === 'No results' ? 'No results' : e.message === 'rate_limited' ? 'Rate limited — retrying shortly' : 'Search unavailable')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const onVigilSearch = (e) => {
      const q = e.detail?.query?.trim()
      if (!q) return
      const existing = tabsRef.current.find(
        (t) => t.keyword.toLowerCase() === q.toLowerCase(),
      )
      if (existing) {
        setActiveId(existing.id)
      } else {
        const newTab = { id: `tab-${Date.now()}`, keyword: q }
        saveTabs([...tabsRef.current, newTab])
        setActiveId(newTab.id)
      }
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    window.addEventListener('vigil:search', onVigilSearch)
    return () => window.removeEventListener('vigil:search', onVigilSearch)
  }, [])

  useEffect(() => {
    if (pausedRef.current) return
    const tab = tabsRef.current.find(t => t.id === activeId); if (!tab) return
    const entry = cacheRef.current[activeId]
    if (entry && Date.now() - entry.fetchedAt < 5 * 60_000) return
    load(activeId, tab.keyword)
  }, [activeId, load])

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || pausedRef.current) return
      const tab = tabsRef.current.find(t => t.id === activeId)
      if (tab) load(activeId, tab.keyword)
    }, 120_000)
    return () => clearInterval(id)
  }, [activeId, load])

  const isVisible = usePageVisibility()
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (!isVisible || pausedRef.current) return
    const tab = tabsRef.current.find(t => t.id === activeId)
    const entry = cacheRef.current[activeId]
    if (tab && (!entry || Date.now() - entry.fetchedAt > 5 * 60_000)) load(activeId, tab.keyword)
  }, [isVisible, activeId, load])

  function addTab() {
    const kw = newKw.trim(); if (!kw) { setAdding(false); return }
    const id = `tab-${Date.now()}`
    saveTabs([...tabs, { id, keyword: kw }]); setActiveId(id); setNewKw(''); setAdding(false)
  }
  function removeTab(id) {
    const next = tabs.filter(t => t.id !== id); saveTabs(next)
    if (activeId === id) setActiveId(next[0]?.id ?? null)
  }
  function handleRefresh() {
    const tab = tabs.find(t => t.id === activeId); if (!tab || loading) return
    setCache(prev => { const n = { ...prev }; delete n[activeId]; return n }); load(activeId, tab.keyword)
  }
  function toggleSidebar() { setSidebarOpen(v => { patch({ sidebarOpen: !v }); return !v }) }

  useEffect(() => {
    setActions?.(
      <>
        <InfoTooltip wide text={
          <span>
            <strong className="ns-tip-head">News Search</strong>
            Searches Google News worldwide for your saved keywords, sorted by recency and filtered to your keyword.
            <br /><br />📌 <strong>Best for:</strong> broad topic monitoring across all sources (e.g. "Iran nuclear deal").
            <br /><br />📰 <strong>Want specific outlets?</strong> Use the RSS widget and add the sources you trust.
            <br /><br />💡 <strong>Tip:</strong> specific keywords beat single words.
          </span>
        } />
        <button className="widget-btn" onClick={handleRefresh} title="Refresh">
          <span style={loading ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>↻</span>
        </button>
      </>
    )
  }, [setActions, loading, activeId, tabs])

  const activeTab = tabs.find(t => t.id === activeId)
  const keyword = activeTab?.keyword?.toLowerCase() ?? ''
  const rawArticles = cache[activeId]?.items ?? []
  const filtered = rawArticles.filter(a => a.title?.toLowerCase().includes(keyword) || a.description?.toLowerCase().includes(keyword))
  const showFallback = filtered.length === 0 && rawArticles.length > 0
  const displayArticles = filtered.length > 0 ? filtered : rawArticles

  return (
    <div ref={containerRef} className="ns-body" onPointerDownCapture={e => e.stopPropagation()} style={{ flex: 1, minHeight: 0 }}>
      {sidebarOpen ? (
        <div className="ns-sidebar">
          <div className="ns-sidebar-header">
            <span className="ns-sidebar-title">KEYWORDS</span>
            <button className="ns-sidebar-toggle" onClick={toggleSidebar} title="Collapse">‹</button>
          </div>
          <div className="ns-keyword-list">
            {tabs.map(t => (
              <div key={t.id} className={`ns-kw-item${activeId === t.id ? ' active' : ''}`} onClick={() => setActiveId(t.id)}>
                <span className="ns-kw-text">{t.keyword}</span>
                <button className="ns-kw-del" onClick={e => { e.stopPropagation(); removeTab(t.id) }}>×</button>
              </div>
            ))}
          </div>
          <div className="ns-sidebar-footer">
            {adding ? (
              <form className="ns-add-form" onSubmit={e => { e.preventDefault(); addTab() }}>
                <input autoFocus className="ns-add-input" value={newKw} onChange={e => setNewKw(e.target.value)} placeholder="keyword…" onBlur={() => { if (!newKw.trim()) setAdding(false) }} />
              </form>
            ) : (
              <button className="ns-add-btn" onClick={() => setAdding(true)}>+ Add</button>
            )}
          </div>
        </div>
      ) : (
        <div className="ns-slim-strip" onClick={toggleSidebar} title="Expand keywords">
          <span className="ns-slim-chevron">›</span>
        </div>
      )}

      <div className="ns-results">
        {tabs.length === 0 ? (
          <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: 12, letterSpacing: '1px', textTransform: 'uppercase', textAlign: 'center' }}>Add a keyword to start monitoring</div>
        ) : loading && rawArticles.length === 0 ? (
          <SkeletonFeedItems count={8} />
        ) : error && rawArticles.length === 0 ? (
          <div className="widget-error">
            <span className="widget-error-icon">⚠</span>
            {error === 'No results' ? 'No results' : 'Google News unavailable'}
            <button className="widget-error-retry" onClick={() => { setError(null); handleRefresh() }}>Retry ↺</button>
          </div>
        ) : (
          <div className="feed-list">
            {showFallback && <div className="ns-fallback-msg">No headlines matched "{activeTab?.keyword}" exactly — showing related results</div>}
            {displayArticles.map((art, i) => {
              const src = nsExtractSource(art.title) || art.source
              const title = nsCleanTitle(art.title)
              return (
                <a key={i} className={`ns-result-item${showFallback ? ' ns-dim' : ''}`} href={art.link} target="_blank" rel="noopener noreferrer">
                  <div className="ns-result-title">{title}</div>
                  <div className="ns-result-meta">
                    {src && <span className="ns-result-source">{src}</span>}
                    <span className="ns-result-time">{relTime(art.pubDate)}</span>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

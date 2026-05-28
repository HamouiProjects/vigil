import { useState, useEffect, useCallback, useRef } from 'react'
import usePageVisibility from '../../hooks/usePageVisibility'
import { SkeletonFeedItems } from '../shared/SkeletonLoader'
import { InfoTooltip } from './ConflictFeed'
import { rssRelTime } from './RssFeedWidget'
import WHeader from '../shared/WHeader'

const GN_RSS2JSON = q =>
  `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
  )}`

async function fetchNewsSearch(q) {
  const res  = await fetch(GN_RSS2JSON(q), { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.status !== 'ok') throw new Error(json.message || 'Feed error')
  const items = json.items ?? []
  if (!items.length) throw new Error('No results')
  return items.map(item => ({
    title:       item.title       ?? '(no title)',
    link:        item.link        ?? '',
    pubDate:     item.pubDate     ?? '',
    source:      item.author      ?? '',
    description: (item.description ?? '').replace(/<[^>]*>/g, ''),
  }))
}

function nsExtractSource(title) {
  const parts = (title ?? '').split(' - ')
  return parts.length > 1 ? parts[parts.length - 1].trim() : ''
}
function nsCleanTitle(title) {
  const parts = (title ?? '').split(' - ')
  return parts.length > 1 ? parts.slice(0, -1).join(' - ').trim() : (title ?? '')
}

const KF_DEFAULT_TABS = [
  { id: 'world',     keyword: 'World'     },
  { id: 'conflicts', keyword: 'Conflicts' },
  { id: 'economy',   keyword: 'Economy'   },
]

export const kfTabsKey = widgetId => `vigil_newssearch_tabs_${widgetId}`

export default function KeywordFeed({ widgetId = 'newssearch', onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const [tabs, setTabs] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(kfTabsKey(widgetId)) || 'null')
      return Array.isArray(s) && s.length ? s : KF_DEFAULT_TABS
    } catch { return KF_DEFAULT_TABS }
  })
  const [activeId,    setActiveId]    = useState(() => tabs[0]?.id ?? 'world')
  const [cache,       setCache]       = useState({})
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [adding,      setAdding]      = useState(false)
  const [newKw,       setNewKw]       = useState('')
  const [isLive,      setIsLive]      = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(`vigil_newssearch_sidebar_collapsed_${widgetId}`)
      return stored === null ? true : !JSON.parse(stored)
    } catch { return true }
  })

  const tabsRef  = useRef(tabs);  tabsRef.current  = tabs
  const cacheRef = useRef(cache); cacheRef.current = cache

  useEffect(() => {
    try { localStorage.setItem(`vigil_newssearch_sidebar_collapsed_${widgetId}`, JSON.stringify(!sidebarOpen)) } catch {}
  }, [sidebarOpen, widgetId])

  function saveTabs(next) {
    setTabs(next)
    try { localStorage.setItem(kfTabsKey(widgetId), JSON.stringify(next)) } catch {}
  }

  const load = useCallback(async (tabId, keyword) => {
    setLoading(true); setError(null)
    try {
      const items = await fetchNewsSearch(keyword)
      setCache(prev => ({ ...prev, [tabId]: { items: items.slice(0, 50), fetchedAt: Date.now() } }))
    } catch (e) {
      setError(e.message === 'No results' ? 'No results' : 'Search unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const tab = tabsRef.current.find(t => t.id === activeId)
    if (!tab) return
    const entry = cacheRef.current[activeId]
    if (entry && Date.now() - entry.fetchedAt < 5 * 60_000) return
    load(activeId, tab.keyword)
  }, [activeId, load])

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return
      const tab = tabsRef.current.find(t => t.id === activeId)
      if (tab) load(activeId, tab.keyword)
    }, 120_000)
    return () => clearInterval(id)
  }, [activeId, load])

  const isVisible = usePageVisibility()
  useEffect(() => {
    if (!isVisible) return
    const tab   = tabsRef.current.find(t => t.id === activeId)
    const entry = cacheRef.current[activeId]
    if (tab && (!entry || Date.now() - entry.fetchedAt > 5 * 60_000)) load(activeId, tab.keyword)
  }, [isVisible, activeId, load])

  useEffect(() => {
    function onSearch(e) {
      const kw = e.detail?.keyword?.trim()
      if (!kw) return
      const existing = tabsRef.current.find(t => t.keyword.toLowerCase() === kw.toLowerCase())
      if (existing) { setActiveId(existing.id); return }
      const id   = `tab-${Date.now()}`
      const next = [...tabsRef.current, { id, keyword: kw }]
      saveTabs(next)
      setActiveId(id)
    }
    window.addEventListener('vigil:search', onSearch)
    return () => window.removeEventListener('vigil:search', onSearch)
  }, [])

  function addTab() {
    const kw = newKw.trim()
    if (!kw) { setAdding(false); return }
    const id = `tab-${Date.now()}`
    saveTabs([...tabs, { id, keyword: kw }])
    setActiveId(id)
    setNewKw(''); setAdding(false)
  }

  function removeTab(id) {
    const next = tabs.filter(t => t.id !== id)
    if (!next.length) return
    saveTabs(next)
    if (activeId === id) setActiveId(next[0].id)
  }

  function handleRefresh() {
    const tab = tabs.find(t => t.id === activeId)
    if (!tab || loading) return
    setCache(prev => { const next = { ...prev }; delete next[activeId]; return next })
    load(activeId, tab.keyword)
  }

  const activeTab      = tabs.find(t => t.id === activeId)
  const keyword        = activeTab?.keyword?.toLowerCase() ?? ''
  const rawArticles    = cache[activeId]?.items ?? []
  const filtered       = rawArticles.filter(art =>
    art.title?.toLowerCase().includes(keyword) ||
    art.description?.toLowerCase().includes(keyword)
  )
  const showFallback    = filtered.length === 0 && rawArticles.length > 0
  const displayArticles = filtered.length > 0 ? filtered : rawArticles

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="NEWS SEARCH" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={onFullscreen} isFullscreen={isFullscreen} onClose={onClose}>
        <InfoTooltip wide text={
          <span>
            <strong className="ns-tip-head">News Search</strong>
            Searches Google News worldwide for your saved keywords. Results are sorted by recency and filtered to match your keyword in the headline.
            <br /><br />
            📌 <strong>Best for:</strong> broad topic monitoring across all sources worldwide (e.g. "Iran nuclear deal", "Federal Reserve").
            <br /><br />
            📰 <strong>Want specific outlets?</strong> Use the RSS Feed widget — add BBC, Reuters, Al Jazeera, or any source you trust, then filter by keyword there.
            <br /><br />
            💡 <strong>Tip:</strong> More specific keywords (e.g. "Strait of Hormuz blockade") return better results than single words (e.g. "Qatar").
          </span>
        } />
        <button className="widget-btn" onClick={handleRefresh} title="Refresh">
          <span style={loading ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>↻</span>
        </button>
      </WHeader>

      <div className="ns-body" onPointerDownCapture={e => e.stopPropagation()}>
        {sidebarOpen ? (
          <div className="ns-sidebar">
            <div className="ns-sidebar-header">
              <span className="ns-sidebar-title">KEYWORDS</span>
              <button className="ns-sidebar-toggle" onClick={() => setSidebarOpen(false)} title="Collapse">‹</button>
            </div>
            <div className="ns-keyword-list">
              {tabs.map(t => (
                <div
                  key={t.id}
                  className={`ns-kw-item${activeId === t.id ? ' active' : ''}`}
                  onClick={() => setActiveId(t.id)}
                >
                  <span className="ns-kw-text">{t.keyword}</span>
                  {tabs.length > 1 && (
                    <button className="ns-kw-del" onClick={e => { e.stopPropagation(); removeTab(t.id) }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <div className="ns-sidebar-footer">
              {adding ? (
                <form className="ns-add-form" onSubmit={e => { e.preventDefault(); addTab() }}>
                  <input
                    autoFocus
                    className="ns-add-input"
                    value={newKw}
                    onChange={e => setNewKw(e.target.value)}
                    placeholder="keyword…"
                    onBlur={() => { if (!newKw.trim()) setAdding(false) }}
                  />
                </form>
              ) : (
                <button className="ns-add-btn" onClick={() => setAdding(true)}>+ Add</button>
              )}
            </div>
          </div>
        ) : (
          <div className="ns-slim-strip" onClick={() => setSidebarOpen(true)} title="Expand keywords">
            <span className="ns-slim-chevron">›</span>
          </div>
        )}

        <div className="ns-results">
          {tabs.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📡</span>
              Add a keyword above to start monitoring
            </div>
          ) : loading && rawArticles.length === 0 ? (
            <SkeletonFeedItems count={8} />
          ) : error && rawArticles.length === 0 ? (
            <div className="widget-error">
              <span className="widget-error-icon">⚠</span>
              Google News unavailable
              <button className="widget-error-retry" onClick={() => { setError(null); handleRefresh() }}>Retry ↺</button>
            </div>
          ) : (
            <div className="feed-list">
              {showFallback && (
                <div className="ns-fallback-msg">
                  No headlines matched "{activeTab?.keyword}" exactly — showing related results
                </div>
              )}
              {displayArticles.map((art, i) => {
                const src   = nsExtractSource(art.title) || art.source
                const title = nsCleanTitle(art.title)
                return (
                  <a
                    key={i}
                    className={`ns-result-item${showFallback ? ' ns-dim' : ''}`}
                    href={art.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ns-result-title">{title}</div>
                    <div className="ns-result-meta">
                      {src && <span className="ns-result-source">{src}</span>}
                      <span className="ns-result-time">{rssRelTime(art.pubDate)}</span>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

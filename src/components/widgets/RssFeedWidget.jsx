import { useState, useEffect, useCallback, useRef } from 'react'
import usePageVisibility from '../../hooks/usePageVisibility'
import { usePolling } from '../../hooks/usePolling'
import { SkeletonFeedItems } from '../shared/SkeletonLoader'
import WHeader, { InfoTooltip } from '../shared/WHeader'

const RSS_DEFAULT_FEEDS = [
  { id: 'bbc',       name: 'BBC News',      url: 'https://feeds.bbci.co.uk/news/rss.xml',            enabled: true, color: '#e63946' },
  { id: 'aljazeera', name: 'Al Jazeera',    url: 'https://www.aljazeera.com/xml/rss/all.xml',         enabled: true, color: '#00b894' },
  { id: 'france24',  name: 'France 24',     url: 'https://www.france24.com/en/rss',                   enabled: true, color: '#0984e3' },
  { id: 'guardian',  name: 'The Guardian',  url: 'https://www.theguardian.com/world/rss',             enabled: true, color: '#a29bfe' },
  { id: 'dw',        name: 'DW News',       url: 'https://rss.dw.com/rdf/rss-en-all',                enabled: true, color: '#fdcb6e' },
  { id: 'mee',       name: 'Mid East Eye',  url: 'https://www.middleeasteye.net/rss',                 enabled: true, color: '#00b894' },
  { id: 'rt',        name: 'RT News',       url: 'https://www.rt.com/rss/',                          enabled: true, color: '#fd79a8' },
]
const RSS_EXTRA_COLORS = ['#fd79a8', '#fdcb6e', '#e17055', '#74b9ff', '#55efc4', '#636e72']
const RSS_BROKEN_DOMAINS = ['feeds.reuters.com', 'feeds.apnews.com', 'foxnews.com', 'haaretz.com', 'arabnews.com']
const RSS_SUGGESTIONS = [
  { name: 'BBC News',        url: 'https://feeds.bbci.co.uk/news/rss.xml',                       color: '#bb1919' },
  { name: 'BBC World',       url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                  color: '#bb1919' },
  { name: 'Al Jazeera',      url: 'https://www.aljazeera.com/xml/rss/all.xml',                    color: '#009966' },
  { name: 'France 24',       url: 'https://www.france24.com/en/rss',                              color: '#003f8a' },
  { name: 'The Guardian',    url: 'https://www.theguardian.com/world/rss',                        color: '#005689' },
  { name: 'Guardian US',     url: 'https://www.theguardian.com/us-news/rss',                      color: '#005689' },
  { name: 'DW News',         url: 'https://rss.dw.com/rdf/rss-en-all',                           color: '#c8102e' },
  { name: 'Fox News',        url: 'https://moxie.foxnews.com/google-publisher/latest.xml',        color: '#003366' },
  { name: 'NPR News',        url: 'https://feeds.npr.org/1001/rss.xml',                          color: '#4a235a' },
  { name: 'CNN',             url: 'http://rss.cnn.com/rss/edition.rss',                          color: '#cc0000' },
  { name: 'NBC News',        url: 'https://feeds.nbcnews.com/nbcnews/public/news',               color: '#0a356d' },
  { name: 'The Hindu',       url: 'https://www.thehindu.com/news/international/?service=rss',    color: '#8b0000' },
  { name: 'Times of India',  url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms',  color: '#d32f2f' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss',                           color: '#1a6b3c' },
  { name: 'Haaretz',         url: 'https://www.haaretz.com/cmlink/1.628752',                     color: '#00356b' },
  { name: 'Arab News',       url: 'https://www.arabnews.com/rss.xml',                            color: '#006400' },
  { name: 'RT News',         url: 'https://www.rt.com/rss/',                                     color: '#7a0000' },
  { name: 'CGTN',            url: 'https://www.cgtn.com/subscribe/rss/section/world.xml',        color: '#c8102e' },
  { name: 'Politico',        url: 'https://rss.politico.com/politics-news.xml',                  color: '#1a1a2e' },
  { name: 'Foreign Policy',  url: 'https://foreignpolicy.com/feed/',                             color: '#2c3e50' },
  { name: 'The Economist',   url: 'https://www.economist.com/the-world-this-week/rss.xml',       color: '#e2001a' },
]

export function rssRelTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1)    return 'now'
    if (diff < 60)   return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch { return '—' }
}

function ensureFeedColor(feed, idx) {
  return feed.color ? feed : { ...feed, color: RSS_EXTRA_COLORS[idx % RSS_EXTRA_COLORS.length] }
}

export default function RssFeed({ widgetId = 'rss', onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const storageKey = `vigil_rss_feeds_${widgetId}`

  const [feeds, setFeeds] = useState(() => {
    try {
      const OLD_KEY = 'vigil_rss_feeds_rss'
      if (!localStorage.getItem(storageKey) && localStorage.getItem(OLD_KEY)) {
        const m = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null')
        localStorage.removeItem(OLD_KEY)
        if (Array.isArray(m) && m.length) {
          const cleaned = m.filter(f => !RSS_BROKEN_DOMAINS.some(d => (f.url ?? '').includes(d))).map(ensureFeedColor)
          const result  = cleaned.length ? cleaned : RSS_DEFAULT_FEEDS
          localStorage.setItem(storageKey, JSON.stringify(result))
          return result
        }
      }
      const oldUrl = localStorage.getItem(`vigil_rss_url_${widgetId}`)
      if (oldUrl) {
        localStorage.removeItem(`vigil_rss_url_${widgetId}`)
        const migrated = [...RSS_DEFAULT_FEEDS, { id: 'my-feed', name: 'My Feed', url: oldUrl, enabled: true, color: RSS_EXTRA_COLORS[0] }]
        localStorage.setItem(storageKey, JSON.stringify(migrated))
        return migrated
      }
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (Array.isArray(saved) && saved.length) {
        const cleaned = saved.filter(f => !RSS_BROKEN_DOMAINS.some(d => (f.url ?? '').includes(d))).map(ensureFeedColor)
        if (!cleaned.length) { localStorage.setItem(storageKey, JSON.stringify(RSS_DEFAULT_FEEDS)); return RSS_DEFAULT_FEEDS }
        if (cleaned.length < saved.length) localStorage.setItem(storageKey, JSON.stringify(cleaned))
        return cleaned
      }
      return RSS_DEFAULT_FEEDS
    } catch { return RSS_DEFAULT_FEEDS }
  })

  const [itemsByFeed,  setItemsByFeed]  = useState({})
  const [errorByFeed,  setErrorByFeed]  = useState({})
  const [loading,      setLoading]      = useState(true)
  const [lastRefresh,  setLastRefresh]  = useState(null)
  const [timeAgo,      setTimeAgo]      = useState('')
  const [filterInput,  setFilterInput]  = useState(() => {
    try { return localStorage.getItem(`vigil_rss_keyword_${widgetId}`) ?? '' } catch { return '' }
  })
  const [filter,       setFilter]       = useState(() => {
    try { return localStorage.getItem(`vigil_rss_keyword_${widgetId}`) ?? '' } catch { return '' }
  })
  const [activeSource, setActiveSource] = useState(() => {
    try { return localStorage.getItem(`vigil_rss_active_source_${widgetId}`) ?? 'all' } catch { return 'all' }
  })
  const [density,      setDensity]      = useState(() => {
    try { return localStorage.getItem(`vigil_rss_density_${widgetId}`) ?? 'compact' } catch { return 'compact' }
  })
  const [addingSource, setAddingSource] = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newUrl,       setNewUrl]       = useState('')
  const [addError,     setAddError]     = useState('')
  const [showSugs,     setShowSugs]     = useState(false)
  const [savedFilters, setSavedFilters] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`vigil_rss_filters_${widgetId}`) || 'null')
      return Array.isArray(s) ? s : ['Iran', 'Gaza', 'Ukraine', 'Strait of Hormuz']
    } catch { return ['Iran', 'Gaza', 'Ukraine', 'Strait of Hormuz'] }
  })
  const [addingFilter, setAddingFilter] = useState(false)
  const [newFilter,    setNewFilter]    = useState('')

  const [isLive,       setIsLive]       = useState(true)
  const [sourcesCollapsed, setSourcesCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`vigil_rss_sources_collapsed_${widgetId}`) ?? 'false') } catch { return false }
  })
  const [filtersCollapsed, setFiltersCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`vigil_rss_filters_collapsed_${widgetId}`) ?? 'false') } catch { return false }
  })
  const seenRef        = useRef(new Set())
  const [seenVersion,  setSeenVersion]  = useState(0)
  const filterTimerRef = useRef(null)
  const feedsRef       = useRef(feeds); feedsRef.current = feeds
  const isVisibleRss   = usePageVisibility()

  const effectiveLive    = isLive && !workspacePaused
  const effectiveLiveRef = useRef(effectiveLive)
  effectiveLiveRef.current = effectiveLive

  useEffect(() => {
    const saved = localStorage.getItem(`vigil_rss_active_source_${widgetId}`)
    if (saved && saved !== 'all' && !feeds.some(f => f.id === saved)) {
      setActiveSource('all')
      try { localStorage.setItem(`vigil_rss_active_source_${widgetId}`, 'all') } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function saveFeeds(next) {
    setFeeds(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  function feedColor(feedId) {
    return feedsRef.current.find(f => f.id === feedId)?.color ?? '#4a6a8a'
  }

  function markSeen(link) {
    if (!link || seenRef.current.has(link)) return
    seenRef.current.add(link)
    setSeenVersion(v => v + 1)
  }

  const fetchAll = useCallback(async () => {
    const enabled = feedsRef.current.filter(f => f.enabled)
    if (!enabled.length) { setLoading(false); return }
    setLoading(true)
    const results = await Promise.allSettled(
      enabled.map(f => {
        const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}`
        return fetch(url, { signal: AbortSignal.timeout(15000) })
          .then(r => r.json())
      })
    )
    const newErrors = {}
    setItemsByFeed(prev => {
      const next = { ...prev }
      enabled.forEach((f, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value?.status === 'ok') {
          next[f.id] = (r.value.items ?? []).map(item => ({
            title:       item.title       ?? '',
            link:        item.link        ?? '',
            pubDate:     item.pubDate     ?? '',
            description: (item.description ?? '').replace(/<[^>]+>/g, '').trim(),
            _feedId:     f.id,
            _feedName:   f.name,
            _category:   (item.categories?.[0] ?? '').trim(),
          }))
        } else {
          newErrors[f.id] = true
        }
      })
      return next
    })
    setErrorByFeed(prev => {
      const next = { ...prev }
      enabled.forEach(f => { if (!newErrors[f.id]) delete next[f.id] })
      return { ...next, ...newErrors }
    })
    setLastRefresh(Date.now())
    setLoading(false)
  }, [])

  async function retrySingleFeed(feed) {
    try {
      const res  = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`,
        { signal: AbortSignal.timeout(15000) })
      const json = await res.json()
      if (json?.status === 'ok') {
        setItemsByFeed(prev => ({
          ...prev,
          [feed.id]: (json.items ?? []).map(item => ({
            title:       item.title    ?? '',
            link:        item.link     ?? '',
            pubDate:     item.pubDate  ?? '',
            description: (item.description ?? '').replace(/<[^>]+>/g, '').trim(),
            _feedId:     feed.id,
            _feedName:   feed.name,
            _category:   (item.categories?.[0] ?? '').trim(),
          }))
        }))
        setErrorByFeed(prev => { const next = { ...prev }; delete next[feed.id]; return next })
      }
    } catch {}
  }

  function handleRefresh() {
    if (loading) return
    setItemsByFeed({})
    fetchAll()
  }

  usePolling(fetchAll, 5 * 60_000, { isLive: effectiveLive })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isVisibleRss && effectiveLiveRef.current) fetchAll() }, [isVisibleRss])

  useEffect(() => {
    const tick = () => {
      if (!lastRefresh) return
      const s = Math.floor((Date.now() - lastRefresh) / 1000)
      setTimeAgo(s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`)
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [lastRefresh])

  useEffect(() => {
    try { localStorage.setItem(`vigil_rss_active_source_${widgetId}`, activeSource) } catch {}
  }, [activeSource, widgetId])

  useEffect(() => {
    try { localStorage.setItem(`vigil_rss_sources_collapsed_${widgetId}`, JSON.stringify(sourcesCollapsed)) } catch {}
  }, [sourcesCollapsed, widgetId])

  useEffect(() => {
    try { localStorage.setItem(`vigil_rss_filters_collapsed_${widgetId}`, JSON.stringify(filtersCollapsed)) } catch {}
  }, [filtersCollapsed, widgetId])

  // eslint-disable-next-line no-unused-expressions
  seenVersion
  const unreadBySource = {}
  Object.entries(itemsByFeed).forEach(([feedId, items]) => {
    unreadBySource[feedId] = items.filter(item => !seenRef.current.has(item.link)).length
  })
  const totalUnread = Object.values(unreadBySource).reduce((s, n) => s + n, 0)

  const allItems = (() => {
    const seen = new Set()
    return Object.values(itemsByFeed)
      .flat()
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .filter(item => { if (seen.has(item.title)) return false; seen.add(item.title); return true })
  })()

  const sourceFilteredItems = activeSource === 'all'
    ? allItems
    : (itemsByFeed[activeSource] ?? []).slice().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))

  const displayItems = filter.trim()
    ? sourceFilteredItems.filter(item =>
        (item.title + ' ' + item.description).toLowerCase().includes(filter.toLowerCase())
      )
    : sourceFilteredItems

  const isFirstLoad      = loading && Object.keys(itemsByFeed).length === 0
  const activeSourceName = activeSource === 'all' ? 'all sources' : (feeds.find(f => f.id === activeSource)?.name ?? activeSource)

  const filteredSugs = newName.length > 0
    ? RSS_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(newName.toLowerCase()) && !feeds.some(f => f.url === s.url))
    : []

  function selectSuggestion(sug) {
    const newFeed = { id: `feed-${Date.now()}`, name: sug.name, url: sug.url, enabled: true, color: sug.color ?? RSS_EXTRA_COLORS[feeds.length % RSS_EXTRA_COLORS.length] }
    saveFeeds([...feeds, newFeed])
    setNewName(''); setNewUrl(''); setAddError(''); setAddingSource(false); setShowSugs(false)
  }

  function addFeed() {
    const name = newName.trim(), url = newUrl.trim()
    if (!name || !url) { setAddError('Name and URL required'); return }
    if (feeds.some(f => f.url === url)) { setAddError('Already added'); return }
    const newFeed = { id: `feed-${Date.now()}`, name, url, enabled: true, color: RSS_EXTRA_COLORS[feeds.length % RSS_EXTRA_COLORS.length] }
    saveFeeds([...feeds, newFeed])
    setNewName(''); setNewUrl(''); setAddError(''); setAddingSource(false); setShowSugs(false)
  }

  function removeFeed(id) {
    saveFeeds(feeds.filter(f => f.id !== id))
    setErrorByFeed(prev => { const next = { ...prev }; delete next[id]; return next })
    if (activeSource === id) setActiveSource('all')
  }

  function toggleFeed(id) {
    saveFeeds(feeds.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f))
  }

  function closeAddForm() {
    setAddingSource(false); setNewName(''); setNewUrl(''); setAddError(''); setShowSugs(false)
  }

  function saveSavedFilters(next) {
    setSavedFilters(next)
    try { localStorage.setItem(`vigil_rss_filters_${widgetId}`, JSON.stringify(next)) } catch {}
  }
  function applyFilter(kw) {
    clearTimeout(filterTimerRef.current)
    setFilterInput(kw); setFilter(kw)
    try { localStorage.setItem(`vigil_rss_keyword_${widgetId}`, kw) } catch {}
  }
  function removeFilter(kw) {
    saveSavedFilters(savedFilters.filter(x => x !== kw))
    if (filter === kw) {
      setFilterInput(''); setFilter('')
      try { localStorage.removeItem(`vigil_rss_keyword_${widgetId}`) } catch {}
    }
  }
  function addSavedFilter() {
    const kw = newFilter.trim()
    if (!kw || savedFilters.includes(kw)) { setNewFilter(''); setAddingFilter(false); return }
    saveSavedFilters([...savedFilters, kw])
    setNewFilter(''); setAddingFilter(false)
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="RSS FEED" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={onFullscreen} isFullscreen={isFullscreen} onClose={onClose}>
        <InfoTooltip wide text={
          <span>
            <strong className="ns-tip-head">RSS Feed</strong>
            Monitor specific outlets you trust. Add any RSS feed URL and filter by keyword to track topics across your chosen sources only.
            <br /><br />
            📡 <strong>Best for:</strong> following specific outlets (BBC, Al Jazeera, The Guardian) with keyword filtering.
            <br /><br />
            🔍 <strong>Want results from ALL sources worldwide?</strong> Use the News Search widget — it searches Google News globally.
            <br /><br />
            💡 <strong>Tip:</strong> Add niche sources — think-tanks, regional outlets, wire services. Any RSS URL works.
          </span>
        } />
        <button
          className="widget-btn"
          onClick={() => {
            const next = density === 'compact' ? 'comfortable' : 'compact'
            setDensity(next)
            try { localStorage.setItem(`vigil_rss_density_${widgetId}`, next) } catch {}
          }}
          title={density === 'compact' ? 'Comfortable view' : 'Compact view'}
        >{density === 'compact' ? '☰' : '≡'}</button>
        <button className="widget-btn" onClick={handleRefresh} title="Refresh">
          <span style={loading ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>↻</span>
        </button>
      </WHeader>

      <div className="rss-body">
        <div className="rss-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div className="rss-sidebar-label" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSourcesCollapsed(v => !v)}>
            <span style={{ marginRight: 4 }}>{sourcesCollapsed ? '▶' : '▼'}</span>SOURCES
          </div>
          {!sourcesCollapsed && (
            <div className="rss-source-list">
              <div
                className={`rss-source-item${activeSource === 'all' ? ' active' : ''}`}
                onClick={() => setActiveSource('all')}
              >
                <span className="rss-source-name">All</span>
              </div>
              {feeds.map(f => {
                const hasErr = !!errorByFeed[f.id]
                return (
                  <div
                    key={f.id}
                    className={`rss-source-item${activeSource === f.id ? ' active' : ''}`}
                    onClick={() => setActiveSource(f.id)}
                  >
                    <span className="rss-source-name">{f.name}</span>
                    {hasErr && (
                      <span className="rss-source-err" title="Failed — click to retry"
                        onClick={e => { e.stopPropagation(); retrySingleFeed(f) }}>⚠</span>
                    )}
                    <button
                      className="rss-source-del"
                      onClick={e => { e.stopPropagation(); removeFeed(f.id) }}
                      title="Remove"
                    >×</button>
                  </div>
                )
              })}

              {addingSource && (
                <div className="rss-add-source-form" onPointerDownCapture={e => e.stopPropagation()}
                  style={{ padding: '6px 8px', borderTop: '1px solid #1a2535' }}>
                  <div className="rss-add-name-wrap">
                    <input
                      autoFocus
                      className="rss-add-source-input"
                      value={newName}
                      onChange={e => { setNewName(e.target.value); setNewUrl(''); setAddError(''); setShowSugs(true) }}
                      onFocus={() => setShowSugs(true)}
                      onBlur={() => setTimeout(() => setShowSugs(false), 160)}
                      placeholder="Source name…"
                    />
                    {showSugs && filteredSugs.length > 0 && (
                      <div className="rss-sug-dropdown">
                        {filteredSugs.slice(0, 5).map((s, i) => (
                          <div key={i} className="rss-sug-item" onMouseDown={() => selectSuggestion(s)}>
                            <span className="rss-sug-name">{s.name}</span>
                            <span className="rss-sug-url">{s.url}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    className="rss-add-source-input"
                    value={newUrl}
                    onChange={e => { setNewUrl(e.target.value); setAddError('') }}
                    placeholder="RSS URL…"
                    spellCheck={false}
                  />
                  {addError && <span style={{ fontSize: '8px', color: '#ff4d4f' }}>{addError}</span>}
                  <div className="rss-add-source-actions">
                    <button className="rss-add-source-add" onClick={addFeed}>ADD</button>
                    <button className="rss-add-source-cancel" onClick={closeAddForm}>Cancel</button>
                  </div>
                </div>
              )}
              <button className="rss-add-source-btn" style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
                onClick={() => setAddingSource(v => !v)}>
                ＋ Add Source
              </button>
            </div>
          )}
        </div>

        <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="rss-filters-strip" onPointerDownCapture={e => e.stopPropagation()}>
            <div className="rss-filters-strip-header" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setFiltersCollapsed(v => !v)}>
              <span style={{ marginRight: 4 }}>{filtersCollapsed ? '▶' : '▼'}</span>
              <span className="rss-filters-strip-label">FILTERS</span>
            </div>
            {!filtersCollapsed && (
              <div className="rss-filters-chips">
                {savedFilters.map(kw => (
                  <div
                    key={kw}
                    className={`rss-filter-chip${filterInput === kw ? ' active' : ''}`}
                    onClick={() => applyFilter(kw)}
                  >
                    <span className="rss-filter-chip-text">{kw}</span>
                    <button className="rss-filter-chip-del" onClick={e => { e.stopPropagation(); removeFilter(kw) }}>✕</button>
                  </div>
                ))}
                {addingFilter ? (
                  <input
                    autoFocus
                    className="rss-add-source-input"
                    value={newFilter}
                    onChange={e => setNewFilter(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSavedFilter(); if (e.key === 'Escape') { setAddingFilter(false); setNewFilter('') } }}
                    placeholder="Keyword…"
                    style={{ width: 80 }}
                  />
                ) : (
                  <button className="rss-filter-add-btn" onClick={() => setAddingFilter(true)}>＋</button>
                )}
              </div>
            )}
          </div>
          <div className="rss-filter-bar" onPointerDownCapture={e => e.stopPropagation()}>
            <input
              className="rss-input rss-filter-input"
              value={filterInput}
              onChange={e => {
                const v = e.target.value
                setFilterInput(v)
                clearTimeout(filterTimerRef.current)
                filterTimerRef.current = setTimeout(() => {
                  setFilter(v)
                  try { v ? localStorage.setItem(`vigil_rss_keyword_${widgetId}`, v) : localStorage.removeItem(`vigil_rss_keyword_${widgetId}`) } catch {}
                }, 150)
              }}
              placeholder="Filter headlines…"
            />
            {filterInput && (
              <button className="rss-filter-clear" onClick={() => {
                setFilterInput(''); setFilter('')
                try { localStorage.removeItem(`vigil_rss_keyword_${widgetId}`) } catch {}
              }} title="Clear filter">×</button>
            )}
            {filter && (
              <div className="rss-result-count">
                {displayItems.length} article{displayItems.length !== 1 ? 's' : ''} · filtered by "{filter}"
              </div>
            )}
          </div>

          <div className="rss-articles" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {isFirstLoad ? (
              <SkeletonFeedItems count={6} />
            ) : displayItems.length === 0 ? (
              filter ? (
                <div className="empty-state">
                  <span className="empty-state-icon">🔍</span>
                  No headlines matching "{filter}" in {activeSourceName}
                  <button className="widget-error-retry" style={{ marginTop: 6 }} onClick={() => { setFilterInput(''); setFilter('') }}>Clear filter</button>
                </div>
              ) : Object.keys(itemsByFeed).length === 0 && !loading ? (
                <div className="empty-state">
                  <span className="empty-state-icon">📰</span>
                  No articles available
                </div>
              ) : null
            ) : (
              <>
                {displayItems.map((item, i) => {
                  const isSeen = seenRef.current.has(item.link)
                  const desc   = item.description?.slice(0, 150)
                  return (
                    <a
                      key={i}
                      className={`rss-article${density === 'comfortable' ? ' rss-comfortable' : ''}${isSeen ? ' rss-seen' : ''}`}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markSeen(item.link)}
                    >
                      <div className="rss-art-body">
                        <div className="rss-art-meta">
                          <span className="rss-art-source" style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>{item._feedName}</span>
                          {item._category && <span className="rss-art-section">· {item._category}</span>}
                          <span className="rss-art-time">· {rssRelTime(item.pubDate)}</span>
                        </div>
                        <div className="rss-art-title">{item.title}</div>
                        {density === 'comfortable' && desc && (
                          <div className="rss-art-desc">{desc}</div>
                        )}
                      </div>
                      <span className="rss-art-ext">→</span>
                    </a>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import usePageVisibility from '../../hooks/usePageVisibility'
import { usePolling } from '../../hooks/usePolling'
import { SkeletonFeedItems } from '../shared/SkeletonLoader'
import WHeader from '../shared/WHeader'

const DEFAULT_SUBS = [
  { id: 'sub-0', name: 'worldnews',   enabled: true },
  { id: 'sub-1', name: 'geopolitics', enabled: true },
]

function socialAge(utc) {
  const s = Math.floor(Date.now() / 1000) - utc
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function fmtNum(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export default function SocialFeed({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const storageKey = `vigil_social_subs_${widgetId}`

  const [subs, setSubs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (Array.isArray(saved) && saved.length) return saved
    } catch {}
    return DEFAULT_SUBS
  })

  const [posts,            setPosts]            = useState([])
  const [errorBySub,       setErrorBySub]       = useState({})
  const [loading,          setLoading]          = useState(true)
  const [filterInput,      setFilterInput]      = useState('')
  const [filter,           setFilter]           = useState('')
  const [hiddenSubs,       setHiddenSubs]       = useState(new Set())
  const [isLive,           setIsLive]           = useState(true)
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false)
  const [addingSub,        setAddingSub]        = useState(false)
  const [newSubInput,      setNewSubInput]      = useState('')

  const subsRef        = useRef(subs); subsRef.current = subs
  const filterTimerRef = useRef(null)
  const isVisible      = usePageVisibility()

  const effectiveLive    = isLive && !workspacePaused
  const effectiveLiveRef = useRef(effectiveLive)
  effectiveLiveRef.current = effectiveLive

  function saveSubs(next) {
    setSubs(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  const fetchAll = useCallback(async () => {
    const enabled = subsRef.current.filter(s => s.enabled)
    if (!enabled.length) { setLoading(false); return }
    setLoading(true)
    const results = await Promise.allSettled(
      enabled.map(s =>
        fetch(`https://www.reddit.com/r/${s.name}/hot.json?limit=25`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
          .then(r => r.json())
          .then(json => ({ subId: s.id, posts: (json?.data?.children ?? []).map(c => c.data) }))
      )
    )
    const newErrors = {}
    const allPosts  = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        allPosts.push(...r.value.posts)
      } else {
        newErrors[enabled[i].id] = true
      }
    })
    allPosts.sort((a, b) => b.created_utc - a.created_utc)
    setPosts(allPosts)
    setErrorBySub(newErrors)
    setLoading(false)
  }, [])

  usePolling(fetchAll, 10 * 60_000, { isLive: effectiveLive })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isVisible && effectiveLiveRef.current) fetchAll() }, [isVisible])

  function addSub() {
    const name = newSubInput.trim().replace(/^r\//, '').toLowerCase()
    if (!name) return
    if (subs.some(s => s.name.toLowerCase() === name)) {
      setNewSubInput(''); setAddingSub(false); return
    }
    saveSubs([...subs, { id: `sub-${Date.now()}`, name, enabled: true }])
    setNewSubInput(''); setAddingSub(false)
  }

  function removeSub(id) {
    saveSubs(subs.filter(s => s.id !== id))
    setHiddenSubs(prev => { const next = new Set(prev); next.delete(id); return next })
    setErrorBySub(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  function toggleSubVisible(id) {
    setHiddenSubs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const enabledSubs = subs.filter(s => s.enabled)

  const displayPosts = posts.filter(p => {
    const sub = subs.find(s => s.name.toLowerCase() === (p.subreddit ?? '').toLowerCase())
    if (sub && hiddenSubs.has(sub.id)) return false
    if (filter && !p.title.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  const isFirstLoad = loading && posts.length === 0

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="SOCIAL FEED" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={onFullscreen} isFullscreen={isFullscreen} onClose={onClose} />

      <div className="rss-body">
        <div className="rss-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div
            className="rss-sidebar-label"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setSourcesCollapsed(v => !v)}
          >
            <span style={{ marginRight: 4 }}>{sourcesCollapsed ? '▶' : '▼'}</span>SUBREDDITS
          </div>
          {!sourcesCollapsed && (
            <div className="rss-source-list">
              {subs.map(s => (
                <div key={s.id} className="rss-source-item">
                  <span className="rss-source-name">r/{s.name}</span>
                  {errorBySub[s.id] && (
                    <span className="rss-source-err" title="Could not load">⚠</span>
                  )}
                  <button className="rss-source-del" onClick={() => removeSub(s.id)} title="Remove">×</button>
                </div>
              ))}
              {addingSub && (
                <div
                  className="rss-add-source-form"
                  onPointerDownCapture={e => e.stopPropagation()}
                  style={{ padding: '6px 8px', borderTop: '1px solid #1a2535' }}
                >
                  <input
                    autoFocus
                    className="rss-add-source-input"
                    value={newSubInput}
                    onChange={e => setNewSubInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addSub()
                      if (e.key === 'Escape') { setAddingSub(false); setNewSubInput('') }
                    }}
                    placeholder="e.g. ukraine"
                  />
                  <div className="rss-add-source-actions">
                    <button className="rss-add-source-add" onClick={addSub}>ADD</button>
                    <button className="rss-add-source-cancel" onClick={() => { setAddingSub(false); setNewSubInput('') }}>Cancel</button>
                  </div>
                </div>
              )}
              <button
                className="rss-add-source-btn"
                style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
                onClick={() => setAddingSub(v => !v)}
              >＋ Add</button>
            </div>
          )}
        </div>

        <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {enabledSubs.length > 0 && (
            <div className="rss-filters-strip" onPointerDownCapture={e => e.stopPropagation()}>
              <div className="rss-filters-chips">
                {enabledSubs.map(s => (
                  <div
                    key={s.id}
                    className={`rss-filter-chip${!hiddenSubs.has(s.id) ? ' active' : ''}`}
                    onClick={() => toggleSubVisible(s.id)}
                  >
                    <span className="rss-filter-chip-text">r/{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rss-filter-bar" onPointerDownCapture={e => e.stopPropagation()}>
            <input
              className="rss-input rss-filter-input"
              value={filterInput}
              onChange={e => {
                const v = e.target.value
                setFilterInput(v)
                clearTimeout(filterTimerRef.current)
                filterTimerRef.current = setTimeout(() => setFilter(v), 150)
              }}
              placeholder="Filter posts…"
            />
            {filterInput && (
              <button className="rss-filter-clear" onClick={() => { setFilterInput(''); setFilter('') }} title="Clear">×</button>
            )}
          </div>

          <div className="rss-articles" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {isFirstLoad ? (
              <SkeletonFeedItems count={6} />
            ) : displayPosts.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">🔍</span>
                {filter
                  ? `No posts matching "${filter}"`
                  : subs.length === 0
                    ? 'Add subreddits to follow'
                    : 'No posts available'}
              </div>
            ) : (
              displayPosts.map((post, i) => (
                <a
                  key={i}
                  className="rss-article"
                  href={`https://reddit.com${post.permalink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="rss-art-body">
                    <div className="rss-art-meta">
                      <span className="rss-art-source" style={{ fontWeight: 'bold' }}>r/{post.subreddit}</span>
                      <span className="rss-art-time">· {socialAge(post.created_utc)}</span>
                    </div>
                    <div className="rss-art-title">{post.title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: 2 }}>
                      ▲ {fmtNum(post.score)} · 💬 {fmtNum(post.num_comments)}
                    </div>
                  </div>
                  <span className="rss-art-ext">→</span>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

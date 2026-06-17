import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import usePageVisibility from '../hooks/usePageVisibility'
import { usePolling } from '../hooks/usePolling'
import { SkeletonFeedItems } from '../components/shared/SkeletonLoader'
import { SUGGESTIONS } from '../lib/feedSources.js'

export { SUGGESTIONS }

const FEED_COLORS = ['#e63946', '#00b894', '#0984e3', '#a29bfe', '#fdcb6e', '#fd79a8', '#74b9ff', '#636e72']
const DEFAULT_SAVED_FILTERS = ['Iran', 'Gaza', 'Ukraine']

function rssRelTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1) return 'now'
    if (diff < 60) return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch {
    return '·'
  }
}

function mapItems(items, feed) {
  return (items ?? []).map(item => ({
    title: item.title ?? '',
    link: item.link ?? '',
    pubDate: item.pubDate ?? '',
    description: (item.description ?? '').replace(/<[^>]+>/g, '').trim(),
    _sourceId: feed.sourceId,
    _feedName: feed.name,
  }))
}

async function fetchRssFeed(url) {
  const res = await fetch(`/api/rss?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15000),
  })
  if (res.status === 429) return { rateLimited: true }
  const json = await res.json()
  if (json.status === 'rate_limited') return { rateLimited: true }
  if (json.status === 'ok') return { ok: true, items: json.items ?? [] }
  return { error: true }
}

async function fetchRssFeedWithRetry(url, attempts = 3) {
  let last = { error: true }
  for (let i = 0; i < attempts; i++) {
    try {
      last = await fetchRssFeed(url)
    } catch {
      last = { error: true }
    }
    if (last.ok || last.error) return last      // success, or a hard error: do not retry
    if (i < attempts - 1) {                       // only a transient rate_limit falls through
      const delay = 1500 * Math.pow(2, i) + Math.random() * 500
      await new Promise(r => setTimeout(r, delay))
    }
  }
  return last
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const cur = idx++
      try { results[cur] = { status: 'fulfilled', value: await fn(items[cur]) } }
      catch (e) { results[cur] = { status: 'rejected', reason: e } }
    }
  }
  const n = Math.min(limit, items.length) || 1
  await Promise.all(Array.from({ length: n }, worker))
  return results
}

export default function RssFeedWidget({
  id,
  paused,
  config,
  onSaveConfig,
  sources,
  onAddSource,
  setActions,
}) {
  const activeSource = config.activeSource ?? 'all'
  const savedFilters = config.savedFilters ?? DEFAULT_SAVED_FILTERS
  const filtersCollapsed = config.filtersCollapsed ?? false
  const sidebarOpen = config.sidebarOpen ?? true

  const feedRows = useMemo(
    () => (config.feeds ?? [])
      .map(f => {
        const src = sources.find(s => s.id === f.sourceId)
        return src
          ? {
              sourceId: f.sourceId,
              enabled: f.enabled,
              url: src.identifier,
              name: src.label,
              color: src.meta?.color ?? '#4a6a8a',
            }
          : null
      })
      .filter(Boolean),
    [config.feeds, sources],
  )

  const [itemsBySource, setItemsBySource] = useState({})
  const [errorBySource, setErrorBySource] = useState({})
  const [loading, setLoading] = useState(false)
  const [addingSource, setAddingSource] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [addError, setAddError] = useState('')
  const [filterInput, setFilterInput] = useState('')
  const [filter, setFilter] = useState('')
  const [addingFilter, setAddingFilter] = useState(false)
  const [newFilter, setNewFilter] = useState('')
  const [showSugs, setShowSugs] = useState(false)

  const feedRowsRef = useRef(feedRows)
  feedRowsRef.current = feedRows
  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const filterTimerRef = useRef(null)
  const isVisible = usePageVisibility()
  const didMountRef = useRef(false)

  const saveConfig = useCallback(
    patch => onSaveConfigRef.current({ ...configRef.current, ...patch }),
    [],
  )

  useEffect(() => () => clearTimeout(filterTimerRef.current), [])

  useEffect(() => {
    const active = configRef.current.activeSource ?? 'all'
    if (active !== 'all' && !feedRows.some(f => f.sourceId === active)) {
      saveConfig({ activeSource: 'all' })
    }
  }, [feedRows, saveConfig])

  const fetchAll = useCallback(async () => {
    if (pausedRef.current) return
    const enabled = feedRowsRef.current.filter(f => f.enabled)
    if (!enabled.length) {
      setLoading(false)
      return
    }
    setLoading(true)
    const results = await mapPool(enabled, 3, f => fetchRssFeedWithRetry(f.url))
    const newErrors = {}
    setItemsBySource(prev => {
      const next = { ...prev }
      enabled.forEach((f, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value.ok) {
          next[f.sourceId] = mapItems(r.value.items, f)
        } else {
          const v = r.status === 'fulfilled' ? r.value : null
          newErrors[f.sourceId] = v?.rateLimited ? 'rate_limited' : 'error'
        }
      })
      return next
    })
    setErrorBySource(prev => {
      const next = { ...prev }
      enabled.forEach(f => {
        if (!newErrors[f.sourceId]) delete next[f.sourceId]
      })
      return { ...next, ...newErrors }
    })
    setLoading(false)
  }, [])

  async function retrySingleFeed(feed) {
    try {
      const result = await fetchRssFeed(feed.url)
      if (result.ok) {
        setItemsBySource(prev => ({
          ...prev,
          [feed.sourceId]: mapItems(result.items, feed),
        }))
        setErrorBySource(prev => {
          const next = { ...prev }
          delete next[feed.sourceId]
          return next
        })
      } else {
        setErrorBySource(prev => ({ ...prev, [feed.sourceId]: result.rateLimited ? 'rate_limited' : 'error' }))
      }
    } catch {
      setErrorBySource(prev => ({ ...prev, [feed.sourceId]: 'error' }))
    }
  }

  function handleRefresh() {
    if (loading || paused) return
    setItemsBySource({})
    fetchAll()
  }

  usePolling(fetchAll, 5 * 60_000, { isLive: !paused })

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    if (isVisible && !pausedRef.current) fetchAll()
  }, [isVisible, fetchAll])

  const enabledKey = feedRows.filter(f => f.enabled).map(f => `${f.sourceId}:${f.url}`).join('|')
  useEffect(() => {
    if (paused) return
    fetchAll()
  }, [enabledKey, paused, fetchAll])

  async function handleAddFeed(nameOverride, urlOverride, colorOverride) {
    const name = (nameOverride ?? newName).trim()
    const url = (urlOverride ?? newUrl).trim()
    if (!name || !url) {
      setAddError('Name and URL required')
      return
    }
    const row = await onAddSource({
      type: 'rss',
      identifier: url,
      label: name,
      meta: { color: colorOverride ?? FEED_COLORS[feedRows.length % FEED_COLORS.length] },
    })
    if (!row) return
    const feeds = configRef.current.feeds ?? []
    if (feeds.some(f => f.sourceId === row.id)) {
      closeAddForm()
      return
    }
    saveConfig({ feeds: [...feeds, { sourceId: row.id, enabled: true }] })
    closeAddForm()
  }

  function closeAddForm() {
    setAddingSource(false)
    setNewName('')
    setNewUrl('')
    setAddError('')
    setShowSugs(false)
  }

  function removeFeed(sourceId) {
    const patch = {
      feeds: (configRef.current.feeds ?? []).filter(f => f.sourceId !== sourceId),
    }
    if ((configRef.current.activeSource ?? 'all') === sourceId) {
      patch.activeSource = 'all'
    }
    saveConfig(patch)
    setErrorBySource(prev => {
      const next = { ...prev }
      delete next[sourceId]
      return next
    })
    setItemsBySource(prev => {
      const next = { ...prev }
      delete next[sourceId]
      return next
    })
  }

  function toggleFeed(sourceId) {
    saveConfig({
      feeds: (configRef.current.feeds ?? []).map(f =>
        f.sourceId === sourceId ? { ...f, enabled: !f.enabled } : f,
      ),
    })
  }

  function applyFilter(kw) {
    clearTimeout(filterTimerRef.current)
    setFilterInput(kw)
    setFilter(kw)
  }

  function removeSavedFilter(kw) {
    saveConfig({ savedFilters: savedFilters.filter(x => x !== kw) })
    if (filter === kw) applyFilter('')
  }

  function addSavedFilter() {
    const kw = newFilter.trim()
    if (!kw || savedFilters.includes(kw)) {
      setNewFilter('')
      setAddingFilter(false)
      return
    }
    saveConfig({ savedFilters: [...savedFilters, kw] })
    setNewFilter('')
    setAddingFilter(false)
  }

  const filteredSugs = newName.length > 0
    ? SUGGESTIONS.filter(
        s => s.name.toLowerCase().includes(newName.toLowerCase())
          && !feedRows.some(f => f.url === s.url),
      )
    : []

  const allItems = useMemo(() => {
    const seen = new Set()
    const enabledIds = new Set(feedRows.filter(f => f.enabled).map(f => f.sourceId))
    const sourceItems = activeSource === 'all'
      ? feedRows.filter(f => f.enabled).flatMap(f => itemsBySource[f.sourceId] ?? [])
      : (enabledIds.has(activeSource) ? (itemsBySource[activeSource] ?? []) : [])
    return sourceItems
      .slice()
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .filter(item => {
        if (seen.has(item.title)) return false
        seen.add(item.title)
        return true
      })
  }, [itemsBySource, activeSource, feedRows])

  const displayItems = useMemo(() => {
    if (!filter.trim()) return allItems
    const q = filter.toLowerCase()
    return allItems.filter(item =>
      (item.title + ' ' + item.description).toLowerCase().includes(q),
    )
  }, [allItems, filter])

  const isFirstLoad = loading && Object.keys(itemsBySource).length === 0
  const hasFeeds = feedRows.length > 0
  const activeSourceName = activeSource === 'all'
    ? 'all sources'
    : (feedRows.find(f => f.sourceId === activeSource)?.name ?? activeSource)

  useEffect(() => {
    setActions?.(
      <>
        <button
          type="button"
          className="widget-btn"
          onClick={handleRefresh}
          title="Refresh"
          disabled={paused}
        >
          <span style={loading ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>
            ↻
          </span>
        </button>
      </>
    )
  }, [setActions, paused, loading])

  return (
    <>
      <div className="rss-body">
        {sidebarOpen ? (
        <div className="rss-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div className="ns-sidebar-header">
            <span className="ns-sidebar-title">SOURCES</span>
            <button
              type="button"
              className="ns-sidebar-toggle"
              onClick={() => saveConfig({ sidebarOpen: false })}
              title="Collapse"
            >
              ‹
            </button>
          </div>
            <div className="rss-source-list">
              <div
                className={`rss-source-item${activeSource === 'all' ? ' active' : ''}`}
                onClick={() => saveConfig({ activeSource: 'all' })}
              >
                <span className="rss-source-name">All</span>
              </div>

              {feedRows.map(f => {
                const hasErr = !!errorBySource[f.sourceId]
                return (
                  <div
                    key={f.sourceId}
                    className={`rss-source-item${activeSource === f.sourceId ? ' active' : ''}${!f.enabled ? ' rss-source-off' : ''}`}
                  >
                    <span
                      className="rss-source-name"
                      dir="auto"
                      onClick={() => saveConfig({ activeSource: f.sourceId })}
                    >
                      {f.name}
                    </span>
                    <span
                      className={`rss-source-toggle${f.enabled ? ' on' : ''}`}
                      title={f.enabled ? 'Disable feed' : 'Enable feed'}
                      onClick={e => {
                        e.stopPropagation()
                        toggleFeed(f.sourceId)
                      }}
                    />
                    {hasErr && (
                      <span
                        className="rss-source-err"
                        title={errorBySource[f.sourceId] === 'rate_limited' ? 'Rate-limited, retrying' : 'Unreachable, click to retry'}
                        onClick={e => {
                          e.stopPropagation()
                          retrySingleFeed(f)
                        }}
                      >
                        ⚠
                      </span>
                    )}
                    <button
                      type="button"
                      className="rss-source-del"
                      onClick={e => {
                        e.stopPropagation()
                        removeFeed(f.sourceId)
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                )
              })}

              {addingSource && (
                <div
                  className="rss-add-source-form"
                  onPointerDownCapture={e => e.stopPropagation()}
                  style={{ padding: '6px 8px', borderTop: '1px solid var(--color-border)' }}
                >
                  <div className="rss-add-name-wrap">
                    <input
                      autoFocus
                      className="rss-add-source-input"
                      value={newName}
                      onChange={e => {
                        setNewName(e.target.value)
                        setNewUrl('')
                        setAddError('')
                        setShowSugs(true)
                      }}
                      onFocus={() => setShowSugs(true)}
                      onBlur={() => setTimeout(() => setShowSugs(false), 160)}
                      placeholder="Source name…"
                    />
                    {showSugs && filteredSugs.length > 0 && (
                      <div className="rss-sug-dropdown">
                        {filteredSugs.slice(0, 5).map((s, i) => (
                          <div
                            key={i}
                            className="rss-sug-item"
                            onMouseDown={() => handleAddFeed(s.name, s.url, s.color)}
                          >
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
                    onChange={e => {
                      setNewUrl(e.target.value)
                      setAddError('')
                    }}
                    placeholder="RSS URL…"
                    spellCheck={false}
                  />
                  {addError && (
                    <span style={{ fontSize: '8px', color: 'var(--color-error)' }}>{addError}</span>
                  )}
                  <div className="rss-add-source-actions">
                    <button type="button" className="rss-add-source-add" onClick={() => handleAddFeed()}>
                      ADD
                    </button>
                    <button type="button" className="rss-add-source-cancel" onClick={closeAddForm}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="rss-add-source-btn"
                style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
                onClick={() => setAddingSource(v => !v)}
              >
                ＋ Add Source
              </button>
            </div>
        </div>
        ) : (
          <div
            className="rss-slim-strip"
            onClick={() => saveConfig({ sidebarOpen: true })}
            title="Expand sources"
          >
            <span className="rss-slim-chevron">›</span>
          </div>
        )}

        <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="rss-filters-strip" onPointerDownCapture={e => e.stopPropagation()}>
            <div
              className="rss-filters-strip-header"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => saveConfig({ filtersCollapsed: !filtersCollapsed })}
            >
              <span style={{ marginRight: 4 }}>{filtersCollapsed ? '▶' : '▼'}</span>
              <span className="rss-filters-strip-label">FILTERS</span>
            </div>
            {!filtersCollapsed && (
              <div className="rss-filters-chips">
                {savedFilters.map(kw => (
                  <div
                    key={kw}
                    className={`rss-filter-chip${filterInput === kw ? ' active' : ''}`}
                    onClick={() => applyFilter(filterInput === kw ? '' : kw)}
                  >
                    <span className="rss-filter-chip-text">{kw}</span>
                    <button
                      type="button"
                      className="rss-filter-chip-del"
                      onClick={e => {
                        e.stopPropagation()
                        removeSavedFilter(kw)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {addingFilter ? (
                  <input
                    autoFocus
                    className="rss-add-source-input"
                    value={newFilter}
                    onChange={e => setNewFilter(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addSavedFilter()
                      if (e.key === 'Escape') {
                        setAddingFilter(false)
                        setNewFilter('')
                      }
                    }}
                    placeholder="Keyword…"
                    style={{ width: 80 }}
                  />
                ) : (
                  <button
                    type="button"
                    className="rss-filter-add-btn"
                    onClick={() => setAddingFilter(true)}
                  >
                    ＋
                  </button>
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
                filterTimerRef.current = setTimeout(() => setFilter(v), 150)
              }}
              placeholder="Filter headlines…"
            />
            {filterInput && (
              <button
                type="button"
                className="rss-filter-clear"
                onClick={() => applyFilter('')}
                title="Clear filter"
              >
                ×
              </button>
            )}
            {filter && (
              <div className="rss-result-count">
                {displayItems.length} article{displayItems.length !== 1 ? 's' : ''} · filtered by &quot;{filter}&quot;
              </div>
            )}
          </div>

          <div className="rss-articles" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!hasFeeds ? (
              <div className="empty-state">
                <span className="empty-state-icon">📡</span>
                No feeds. Add a source
              </div>
            ) : isFirstLoad ? (
              <SkeletonFeedItems count={6} />
            ) : displayItems.length === 0 ? (
              filter ? (
                <div className="empty-state">
                  <span className="empty-state-icon">🔍</span>
                  No headlines matching &quot;{filter}&quot; in {activeSourceName}
                  <button
                    type="button"
                    className="widget-error-retry"
                    style={{ marginTop: 6 }}
                    onClick={() => applyFilter('')}
                  >
                    Clear filter
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <span className="empty-state-icon">📰</span>
                  No articles available
                </div>
              )
            ) : (
              displayItems.map((item, i) => {
                const desc = item.description?.slice(0, 150)
                return (
                  <a
                    key={`${item.link}-${i}`}
                    className="rss-article rss-comfortable"
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="rss-art-body">
                      <div className="rss-art-meta">
                        <span
                          className="rss-art-source"
                          style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}
                        >
                          {item._feedName}
                        </span>
                        <span className="rss-art-time">· {rssRelTime(item.pubDate)}</span>
                      </div>
                      <div className="rss-art-title" dir="auto">{item.title}</div>
                      {desc && (
                        <div className="rss-art-desc" dir="auto">{desc}</div>
                      )}
                    </div>
                    <span className="rss-art-ext">→</span>
                  </a>
                )
              })
            )}
          </div>
        </div>
      </div>
    </>
  )
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import usePageVisibility from '../hooks/usePageVisibility'
import { usePolling } from '../hooks/usePolling'
import { SkeletonFeedItems } from '../components/shared/SkeletonLoader'

const FEED_COLORS = ['#e63946', '#00b894', '#0984e3', '#a29bfe', '#fdcb6e', '#fd79a8', '#74b9ff', '#636e72']

function rssRelTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1) return 'now'
    if (diff < 60) return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch {
    return '—'
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

export default function RssFeedWidget({
  id,
  paused,
  config,
  onSaveConfig,
  sources,
  onAddSource,
}) {
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

  const feedRowsRef = useRef(feedRows)
  feedRowsRef.current = feedRows
  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const isVisible = usePageVisibility()
  const didMountRef = useRef(false)

  const fetchAll = useCallback(async () => {
    if (pausedRef.current) return
    const enabled = feedRowsRef.current.filter(f => f.enabled)
    if (!enabled.length) {
      setLoading(false)
      return
    }
    setLoading(true)
    const results = await Promise.allSettled(
      enabled.map(f => fetchRssFeed(f.url)),
    )
    const newErrors = {}
    setItemsBySource(prev => {
      const next = { ...prev }
      enabled.forEach((f, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value.ok) {
          next[f.sourceId] = mapItems(r.value.items, f)
        } else {
          newErrors[f.sourceId] = true
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
        setErrorBySource(prev => ({ ...prev, [feed.sourceId]: true }))
      }
    } catch {
      setErrorBySource(prev => ({ ...prev, [feed.sourceId]: true }))
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

  async function handleAddFeed() {
    const name = newName.trim()
    const url = newUrl.trim()
    if (!name || !url) {
      setAddError('Name and URL required')
      return
    }
    const row = await onAddSource({
      type: 'rss',
      identifier: url,
      label: name,
      meta: { color: FEED_COLORS[feedRows.length % FEED_COLORS.length] },
    })
    if (!row) return
    const feeds = configRef.current.feeds ?? []
    if (feeds.some(f => f.sourceId === row.id)) {
      closeAddForm()
      return
    }
    onSaveConfigRef.current({
      ...configRef.current,
      feeds: [...feeds, { sourceId: row.id, enabled: true }],
    })
    closeAddForm()
  }

  function closeAddForm() {
    setAddingSource(false)
    setNewName('')
    setNewUrl('')
    setAddError('')
  }

  function removeFeed(sourceId) {
    onSaveConfig({
      ...config,
      feeds: (config.feeds ?? []).filter(f => f.sourceId !== sourceId),
    })
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
    onSaveConfig({
      ...config,
      feeds: (config.feeds ?? []).map(f =>
        f.sourceId === sourceId ? { ...f, enabled: !f.enabled } : f,
      ),
    })
  }

  const displayItems = useMemo(() => {
    const seen = new Set()
    return Object.values(itemsBySource)
      .flat()
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .filter(item => {
        if (seen.has(item.title)) return false
        seen.add(item.title)
        return true
      })
  }, [itemsBySource])

  const isFirstLoad = loading && Object.keys(itemsBySource).length === 0
  const hasFeeds = feedRows.length > 0

  return (
    <div className="widget" data-widget-id={id}>
      <div className="widget-header widget-drag-handle" style={{ cursor: 'default' }}>
        <div className="widget-title-group">
          <span className="widget-title">RSS</span>
        </div>
        {paused && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            PAUSED
          </span>
        )}
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
      </div>

      <div className="rss-body">
        <div className="rss-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div className="rss-sidebar-label">SOURCES</div>
          <div className="rss-source-list">
            {feedRows.map(f => {
              const hasErr = !!errorBySource[f.sourceId]
              return (
                <div
                  key={f.sourceId}
                  className={`rss-source-item${!f.enabled ? ' rss-source-off' : ''}`}
                  style={{ borderLeftColor: f.enabled ? f.color : undefined }}
                  onClick={() => toggleFeed(f.sourceId)}
                >
                  <span className="rss-source-name">{f.name}</span>
                  {hasErr && (
                    <span
                      className="rss-source-err"
                      title="Failed — click to retry"
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
                style={{ padding: '6px 8px', borderTop: '1px solid #1a2535' }}
              >
                <input
                  autoFocus
                  className="rss-add-source-input"
                  value={newName}
                  onChange={e => {
                    setNewName(e.target.value)
                    setAddError('')
                  }}
                  placeholder="Source name…"
                />
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
                  <span style={{ fontSize: '8px', color: '#ff4d4f' }}>{addError}</span>
                )}
                <div className="rss-add-source-actions">
                  <button type="button" className="rss-add-source-add" onClick={handleAddFeed}>
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

        <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="rss-articles" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!hasFeeds ? (
              <div className="empty-state">
                <span className="empty-state-icon">📡</span>
                No feeds — add a source
              </div>
            ) : isFirstLoad ? (
              <SkeletonFeedItems count={6} />
            ) : displayItems.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">📰</span>
                No articles available
              </div>
            ) : (
              displayItems.map((item, i) => (
                <a
                  key={`${item.link}-${i}`}
                  className="rss-article"
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
                    <div className="rss-art-title">{item.title}</div>
                  </div>
                  <span className="rss-art-ext">→</span>
                </a>
              ))
            )}
          </div>
          <div className="attr-line">via rss2json</div>
        </div>
      </div>
    </div>
  )
}

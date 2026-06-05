import { useState, useEffect, useCallback, useRef } from 'react'
import usePageVisibility from '../hooks/usePageVisibility'
import { usePolling } from '../hooks/usePolling'
import { SkeletonFeedItems } from '../components/shared/SkeletonLoader'

const DEFAULT_ACCOUNTS = [
  { id: 'acc-0', platform: 'reddit', value: 'worldnews', enabled: true },
  { id: 'acc-1', platform: 'reddit', value: 'geopolitics', enabled: true },
]

const ACTIVE_PLATFORMS = ['reddit', 'youtube', 'mastodon', 'bluesky', 'telegram']

const PLATFORMS = {
  reddit: {
    label: 'Reddit',
    placeholder: 'subreddit, or u/username',
    normalize: v => v.trim().replace(/^https?:\/\/(www\.)?reddit\.com\//i, '').replace(/\/+$/, ''),
    feedUrl: v => {
      const isUser = /^\/?u(ser)?\//i.test(v)
      const name = v.replace(/^\/?(r|u|user)\//i, '')
      return isUser
        ? `https://www.reddit.com/user/${name}/.rss`
        : `https://www.reddit.com/r/${name}/.rss`
    },
    labelFor: v => (/^\/?u(ser)?\//i.test(v)
      ? `u/${v.replace(/^\/?(u|user)\//i, '')}`
      : `r/${v.replace(/^\/?r\//i, '')}`),
  },
  youtube: {
    label: 'YouTube',
    placeholder: 'channel ID or URL (UC… / youtube.com/channel/… / /user/…)',
    normalize: v => v.trim(),
    feedUrl: v => buildYouTubeFeedUrl(v),
    labelFor: (v, t) => t || 'YouTube',
  },
  mastodon: {
    label: 'Mastodon',
    placeholder: '@user@instance (e.g. @Mastodon@mastodon.social)',
    normalize: v => v.trim().replace(/^@/, ''),
    feedUrl: v => {
      const [user, instance] = v.split('@')
      return (user && instance) ? `https://${instance}/@${user}.rss` : ''
    },
    labelFor: (v, t) => t || `@${v.split('@')[0]}`,
  },
  bluesky: {
    label: 'Bluesky',
    placeholder: 'handle (e.g. alice.bsky.social)',
    normalize: v => v.trim().replace(/^@/, '').replace(/^https?:\/\/bsky\.app\/profile\//i, '').replace(/\/.*$/, ''),
    feedUrl: v => `https://bsky.app/profile/${v}/rss`,
    labelFor: (v, t) => t || `@${v}`,
  },
  telegram: {
    label: 'Telegram',
    placeholder: 'channel (e.g. durov or t.me/durov)',
    normalize: v => v.trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').replace(/^s\//i, '').replace(/\/.*$/, ''),
    feedUrl: v => `https://t.me/s/${v}`,
    labelFor: (v, t) => t || `@${v}`,
  },
}

function buildYouTubeFeedUrl(v) {
  const s = (v || '').trim()
  if (/^UC[0-9A-Za-z_-]{20,}$/.test(s)) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${s}`
  }
  let m = s.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{20,})/i)
  if (m) return `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}`
  m = s.match(/youtube\.com\/user\/([^/?#]+)/i)
  if (m) return `https://www.youtube.com/feeds/videos.xml?user=${m[1]}`
  return ''
}

const TEASERS = [
  { platform: 'x', label: 'X' },
  { platform: 'threads', label: 'Threads' },
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'facebook', label: 'Facebook' },
]

function PlatformIcon({ platform, size = 14 }) {
  const inner = {
    reddit: (<>
      <circle cx="12" cy="14" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line x1="14.3" y1="7.2" x2="16.6" y2="3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.9" cy="3" r="1.5" fill="currentColor" /><circle cx="9" cy="13.6" r="1.5" fill="currentColor" />
      <circle cx="15" cy="13.6" r="1.5" fill="currentColor" />
      <path d="M8.5 17.2 c1 1 6 1 7 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>),
    youtube: (<>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10.4 9.4 L15.6 12 L10.4 14.6 Z" fill="currentColor" />
    </>),
    telegram: (
      <path
        d="M21.8 4.2 L2.7 11.6 C2 11.85 2.05 12.5 2.7 12.7 L7.6 14.2 L9.4 19.7 C9.6 20.35 10.35 20.4 10.75 19.9 L13 17 L17.9 20.5 C18.45 20.85 19.1 20.55 19.25 19.9 L22.2 5.1 C22.4 4.25 21.8 3.9 21.8 4.2 Z M8.1 13.7 L16.8 8 L10.4 13.9 L10.15 17 Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    ),
    mastodon: (<>
      <path
        d="M19 13.2 c0 2.7 -2.7 3.5 -2.7 3.5 -1.8 0.7 -4.7 0.8 -7.4 0.2 l0 1.5 c1.9 0.5 4.3 0.4 6.8 0.1 0 0 -1.1 1.6 -3.6 2 -2.6 0.4 -5.4 0 -6.8 -1.3 C3.4 17.5 3 14.7 3 11.8 3 7 4.1 5.6 6.3 4.6 8 3.8 11 3.5 13.7 3.5 l0.1 0 C16.5 3.5 19.5 3.8 21.2 4.6 c2.2 1 3.3 2.4 3.3 7.2"
        transform="scale(0.92) translate(0.6,0.4)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 13.5 V9.7 c0 -1.1 1.4 -1.5 2 -0.4 l1 1.8 1 -1.8 c0.6 -1.1 2 -0.7 2 0.4 V13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>),
    bluesky: (
      <path
        d="M12 9.3 C10.2 6 6.6 3.4 4.6 4 C2.9 4.5 3 7 4 9 C4.9 10.8 6.7 11.7 8.6 12 C6.7 12.3 4.9 12.6 4 14 C2.7 16.1 5 18.2 7.2 17.2 C9.4 16.2 11 13.4 12 11.9 C13 13.4 14.6 16.2 16.8 17.2 C19 18.2 21.3 16.1 20 14 C19.1 12.6 17.3 12.3 15.4 12 C17.3 11.7 19.1 10.8 20 9 C21 7 21.1 4.5 19.4 4 C17.4 3.4 13.8 6 12 9.3 Z"
        fill="currentColor"
      />
    ),
    x: (<path d="M4 4 L20 20 M20 4 L4 20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />),
    threads: (
      <path
        d="M16.5 8.3 C16 5.6 14.2 4 12 4 C8.2 4 6 7 6 12 C6 17 8.4 20 12.3 20 C15.6 20 17.4 17.8 17.4 15 C17.4 12.2 15.4 10.7 13 10.7 C11 10.7 9.7 12 9.7 13.6 C9.7 14.9 10.7 15.8 11.9 15.8 C13.1 15.8 14 15 14.1 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    instagram: (<>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.3" cy="6.7" r="1.3" fill="currentColor" />
    </>),
    facebook: (
      <path
        d="M14.6 8 H17 V4.6 H14.2 C11.8 4.6 10.3 6.1 10.3 8.4 V10.6 H8 V14 H10.3 V21 H13.7 V14 H16.3 L16.9 10.6 H13.7 V8.7 C13.7 8.2 14 8 14.6 8 Z"
        fill="currentColor"
      />
    ),
  }[platform]

  if (!inner) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {inner}
    </svg>
  )
}

function socialAge(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function decodeEntities(s) {
  if (!s) return ''
  const t = document.createElement('textarea')
  t.innerHTML = s
  return t.value
}

async function fetchAccount(account) {
  const url = PLATFORMS[account.platform].feedUrl(account.value)
  if (!url) throw new Error('bad_url')
  const res = await fetch(`/api/rss?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(15000) })
  const json = await res.json().catch(() => null)
  if (res.status === 429 || json?.status === 'rate_limited') throw new Error('rate_limited')
  if (!json || json.status !== 'ok') throw new Error('rss error')
  const label = PLATFORMS[account.platform].labelFor(account.value, json.source?.title)
  const avatar = json.source?.image || ''
  return {
    accId: account.id,
    label,
    avatar,
    items: (json.items || []).map(it => ({
      ...it,
      _accId: account.id,
      _platform: account.platform,
      _accLabel: label,
      _avatar: avatar,
    })),
  }
}

function accountLabel(acc, metaByAccount) {
  return metaByAccount[acc.id]?.label || PLATFORMS[acc.platform].labelFor(acc.value)
}

export default function SocialFeedWidget({ paused, config, onSaveConfig, setActions }) {
  const accounts = config.accounts ?? (
    config.subs
      ? config.subs.map(s => ({ id: s.id, platform: 'reddit', value: s.name, enabled: s.enabled }))
      : DEFAULT_ACCOUNTS
  )
  const sidebarOpen = config.sidebarOpen ?? true
  const accountsSig = accounts.map(a => `${a.id}:${a.platform}:${a.value}:${a.enabled ? 1 : 0}`).join('|')

  const [posts, setPosts] = useState([])
  const [errorByAccount, setErrorByAccount] = useState({})
  const [metaByAccount, setMetaByAccount] = useState({})
  const [loading, setLoading] = useState(true)
  const [filterInput, setFilterInput] = useState('')
  const [filter, setFilter] = useState('')
  const [hiddenAccounts, setHiddenAccounts] = useState(new Set())
  const [addingAccount, setAddingAccount] = useState(false)
  const [selectedPlatform, setSelectedPlatform] = useState('reddit')
  const [newAccountInput, setNewAccountInput] = useState('')
  const [addError, setAddError] = useState('')

  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const filterTimerRef = useRef(null)
  const isVisible = usePageVisibility()
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const didMountRef = useRef(false)
  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

  function patch(p) { onSaveConfigRef.current({ ...configRef.current, ...p }) }
  function saveAccounts(next) { patch({ accounts: next }) }

  const fetchAll = useCallback(async () => {
    const enabled = accountsRef.current.filter(a => a.enabled)
    if (!enabled.length) {
      setLoading(false)
      setPosts([])
      return
    }
    setLoading(true)
    const results = await Promise.allSettled(enabled.map(a => fetchAccount(a)))
    const newErrors = {}
    const allPosts = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') allPosts.push(...r.value.items)
      else newErrors[enabled[i].id] = true
    })
    allPosts.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    setPosts(allPosts)
    setErrorByAccount(newErrors)
    setMetaByAccount(prev => {
      const next = { ...prev }
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          next[r.value.accId] = { label: r.value.label, avatar: r.value.avatar }
        }
      })
      return next
    })
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [accountsSig]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleRefresh() {
    if (loading || paused) return
    setPosts([])
    fetchAll()
  }

  useEffect(() => {
    setActions?.(
      <button type="button" className="widget-btn" onClick={handleRefresh} title="Refresh" disabled={paused}>
        <span style={loading ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>↻</span>
      </button>
    )
  }, [setActions, paused, loading])

  usePolling(fetchAll, 10 * 60_000, { isLive: !paused })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (isVisible && !pausedRef.current) fetchAll()
  }, [isVisible])

  function closeAddForm() {
    setAddingAccount(false)
    setNewAccountInput('')
    setAddError('')
  }

  function addAccount() {
    const raw = newAccountInput
    const value = PLATFORMS[selectedPlatform].normalize(raw)
    if (!value) return
    if (selectedPlatform === 'youtube' && !buildYouTubeFeedUrl(value)) {
      setAddError('Use a channel ID or youtube.com/channel/… URL — an @handle won\'t work yet')
      return
    }
    if (accounts.some(a => a.platform === selectedPlatform && a.value.toLowerCase() === value.toLowerCase())) {
      closeAddForm()
      return
    }
    saveAccounts([...accounts, {
      id: `acc-${Date.now()}`,
      platform: selectedPlatform,
      value,
      enabled: true,
    }])
    closeAddForm()
  }

  function removeAccount(id) {
    saveAccounts(accounts.filter(a => a.id !== id))
    setHiddenAccounts(prev => { const next = new Set(prev); next.delete(id); return next })
    setErrorByAccount(prev => { const next = { ...prev }; delete next[id]; return next })
    setMetaByAccount(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  function toggleAccountEnabled(id) {
    saveAccounts(accounts.map(a => (a.id === id ? { ...a, enabled: !a.enabled } : a)))
  }

  function toggleAccountVisible(id) {
    setHiddenAccounts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const enabledAccounts = accounts.filter(a => a.enabled)
  const displayPosts = posts.filter(p => {
    if (hiddenAccounts.has(p._accId)) return false
    if (filter) {
      const hay = `${p.title || ''} ${p.description || ''}`.toLowerCase()
      if (!hay.includes(filter.toLowerCase())) return false
    }
    return true
  })
  const isFirstLoad = loading && posts.length === 0

  return (
    <div className="rss-body" style={{ flex: 1, minHeight: 0 }}>
      {sidebarOpen ? (
        <div className="rss-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div className="ns-sidebar-header">
            <span className="ns-sidebar-title">ACCOUNTS</span>
            <button
              type="button"
              className="ns-sidebar-toggle"
              onClick={() => patch({ sidebarOpen: false })}
              title="Collapse"
            >
              ‹
            </button>
          </div>
          <div className="rss-source-list">
            {accounts.map(acc => (
              <div
                key={acc.id}
                className={`rss-source-item${!acc.enabled ? ' rss-source-off' : ''}`}
              >
                <PlatformIcon platform={acc.platform} size={14} />
                <span className="rss-source-name" dir="auto">
                  {accountLabel(acc, metaByAccount)}
                </span>
                {errorByAccount[acc.id] && (
                  <span className="rss-source-err" title="Could not load">⚠</span>
                )}
                <span
                  className={`rss-source-toggle${acc.enabled ? ' on' : ''}`}
                  title={acc.enabled ? 'Disable account' : 'Enable account'}
                  onClick={e => {
                    e.stopPropagation()
                    toggleAccountEnabled(acc.id)
                  }}
                />
                <button
                  type="button"
                  className="rss-source-del"
                  onClick={() => removeAccount(acc.id)}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}

            {addingAccount && (
              <div
                className="rss-add-source-form"
                onPointerDownCapture={e => e.stopPropagation()}
                style={{ padding: '6px 8px', borderTop: '1px solid var(--color-border)' }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {ACTIVE_PLATFORMS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { setSelectedPlatform(p); setAddError('') }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        fontSize: 10,
                        border: `1px solid ${selectedPlatform === p ? 'var(--color-brand)' : 'var(--color-border)'}`,
                        borderRadius: 3,
                        background: selectedPlatform === p ? 'var(--color-brand-tint)' : 'transparent',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <PlatformIcon platform={p} size={16} />
                      {PLATFORMS[p].label}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  className="rss-add-source-input"
                  value={newAccountInput}
                  onChange={e => { setNewAccountInput(e.target.value); setAddError('') }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addAccount()
                    if (e.key === 'Escape') closeAddForm()
                  }}
                  placeholder={PLATFORMS[selectedPlatform].placeholder}
                />
                {addError && (
                  <span style={{ fontSize: 9, color: 'var(--color-error)', display: 'block', marginTop: 4 }}>
                    {addError}
                  </span>
                )}
                <div className="rss-add-source-actions">
                  <button type="button" className="rss-add-source-add" onClick={addAccount}>ADD</button>
                  <button type="button" className="rss-add-source-cancel" onClick={closeAddForm}>Cancel</button>
                </div>
                <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
                  <div style={{ fontSize: 8, letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                    SOON
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {TEASERS.map(t => (
                      <span
                        key={t.platform}
                        title="Coming with the premium layer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 10,
                          color: 'var(--color-text-muted)',
                          opacity: 0.5,
                          cursor: 'default',
                        }}
                      >
                        <PlatformIcon platform={t.platform} size={16} />
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="rss-add-source-btn"
              style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
              onClick={() => setAddingAccount(v => !v)}
            >
              ＋ Add
            </button>
          </div>
        </div>
      ) : (
        <div
          className="rss-slim-strip"
          onClick={() => patch({ sidebarOpen: true })}
          title="Expand"
        >
          <span className="rss-slim-chevron">›</span>
        </div>
      )}

      <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {enabledAccounts.length > 0 && (
          <div className="rss-filters-strip" onPointerDownCapture={e => e.stopPropagation()}>
            <div className="rss-filters-chips">
              {enabledAccounts.map(acc => (
                <div
                  key={acc.id}
                  className={`rss-filter-chip${!hiddenAccounts.has(acc.id) ? ' active' : ''}`}
                  onClick={() => toggleAccountVisible(acc.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <PlatformIcon platform={acc.platform} size={12} />
                  <span className="rss-filter-chip-text" dir="auto">
                    {accountLabel(acc, metaByAccount)}
                  </span>
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
            <button
              type="button"
              className="rss-filter-clear"
              onClick={() => { setFilterInput(''); setFilter('') }}
              title="Clear"
            >
              ×
            </button>
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
                : accounts.length === 0
                  ? 'Add accounts to follow'
                  : 'No posts yet'}
            </div>
          ) : (
            displayPosts.map((post, i) => {
              const bodyText = decodeEntities(post.title || post.description)
              return (
                <a
                  key={`${post.link}-${i}`}
                  className="rss-article rss-comfortable"
                  href={post.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}
                >
                  <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0, marginTop: 2 }}>
                    {post._avatar ? (
                      <img
                        src={post._avatar}
                        width={28}
                        height={28}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--color-brand-tint)',
                          color: 'var(--color-brand)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {(post._accLabel || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        right: -2,
                        bottom: -2,
                        width: 15,
                        height: 15,
                        borderRadius: '50%',
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      <PlatformIcon platform={post._platform} size={10} />
                    </div>
                  </div>
                  <div className="rss-art-body" style={{ flex: 1, minWidth: 0 }}>
                    <div className="rss-art-meta">
                      <span className="rss-art-source" style={{ fontWeight: 'bold' }} dir="auto">
                        {post._accLabel}
                      </span>
                      <span className="rss-art-time"> · {socialAge(post.pubDate)}</span>
                    </div>
                    <div
                      className="rss-art-title"
                      dir="auto"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {bodyText}
                    </div>
                  </div>
                  <span className="rss-art-ext">→</span>
                </a>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

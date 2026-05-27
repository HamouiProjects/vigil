import { useState, useEffect, useCallback } from 'react'
import { SkeletonFeedItems } from '../shared/SkeletonLoader'
import { LiveBtn } from '../shared/WHeader'

const SOCIAL_DEFAULT_FOLLOWS = [
  { id: 'sf-1', platform: 'reddit',   type: 'subreddit', value: 'worldnews',        label: 'r/worldnews' },
  { id: 'sf-2', platform: 'reddit',   type: 'subreddit', value: 'ukraine',           label: 'r/ukraine' },
  { id: 'sf-3', platform: 'twitter',  type: 'keyword',   value: 'Iran war',          label: 'Iran war' },
  { id: 'sf-4', platform: 'telegram', type: 'channel',   value: 'ukrainianmilitary', label: '@ukrainianmilitary' },
]
const SOCIAL_PLAT_ORDER = ['twitter', 'reddit', 'telegram']
const SOCIAL_PLAT_LABEL = { twitter: 'X / TWITTER', reddit: 'REDDIT', telegram: 'TELEGRAM' }

function socialIcon(p) {
  if (p === 'twitter') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#E7E9EA" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.738l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
  if (p === 'reddit') return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#FF4500" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  )
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#2AABEE" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

function socialFmt(n)  { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }
function socialAge(utc) {
  const s = Math.floor(Date.now() / 1000) - utc
  if (s < 60) return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function SocialFeed({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const storageKey = `vigil_social_follows_${widgetId}`

  const [follows,      setFollows]      = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || 'null'); return Array.isArray(s) && s.length ? s : SOCIAL_DEFAULT_FOLLOWS } catch { return SOCIAL_DEFAULT_FOLLOWS }
  })
  const [activeId,     setActiveId]     = useState(() => follows[0]?.id ?? null)
  const [addingFollow, setAddingFollow] = useState(false)
  const [addPlatform,  setAddPlatform]  = useState('reddit')
  const [addValue,     setAddValue]     = useState('')
  const [posts,        setPosts]        = useState([])
  const [loading,      setLoading]      = useState(false)
  const [isLive,       setIsLive]       = useState(true)

  const activeFollow = follows.find(f => f.id === activeId) ?? null

  function saveFollows(next) {
    setFollows(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  function addFollow() {
    const v = addValue.trim(); if (!v) return
    let type, value, label
    if (addPlatform === 'reddit') {
      const clean = v.replace(/^r\//, '')
      const isSub = !/\s/.test(clean)
      type = isSub ? 'subreddit' : 'keyword'; value = isSub ? clean : v; label = isSub ? `r/${clean}` : v
    } else if (addPlatform === 'twitter') {
      const isHandle = /^@?[A-Za-z0-9_]+$/.test(v)
      type = isHandle ? 'account' : 'keyword'; value = v.replace(/^@/, ''); label = isHandle ? `@${value}` : v
    } else {
      type = 'channel'; value = v.replace(/^@/, ''); label = `@${value}`
    }
    const entry = { id: `sf-${Date.now()}`, platform: addPlatform, type, value, label }
    saveFollows([...follows, entry]); setActiveId(entry.id); setAddValue(''); setAddingFollow(false)
  }

  function removeFollow(id) {
    const next = follows.filter(f => f.id !== id)
    saveFollows(next)
    if (activeId === id) setActiveId(next[0]?.id ?? null)
  }

  const fetchReddit = useCallback(async (follow) => {
    if (!follow || follow.platform !== 'reddit') return
    setLoading(true)
    try {
      const url = follow.type === 'subreddit'
        ? `https://www.reddit.com/r/${follow.value}.json?limit=25`
        : `https://www.reddit.com/search.json?q=${encodeURIComponent(follow.value)}&sort=new&limit=25`
      const res  = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
      const json = await res.json()
      setPosts((json?.data?.children ?? []).map(c => c.data))
    } catch { setPosts([]) }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (activeFollow?.platform === 'reddit') { setPosts([]); fetchReddit(activeFollow) }
    else setPosts([])
  }, [activeFollow, fetchReddit])

  useEffect(() => {
    if (activeFollow?.platform !== 'reddit') return
    const id = setInterval(() => fetchReddit(activeFollow), 10 * 60_000)
    return () => clearInterval(id)
  }, [activeFollow, fetchReddit])

  const grouped = {}
  follows.forEach(f => { (grouped[f.platform] ??= []).push(f) })

  const addPlaceholder = addPlatform === 'twitter'  ? 'Username (e.g. @PakMilitary) or keyword'
                       : addPlatform === 'reddit'   ? 'Subreddit (e.g. ukraine) or keyword'
                       :                              'Channel (e.g. @ukrainianmilitary)'

  function renderRight() {
    if (!activeFollow) return <div className="empty-state">Select a source from the sidebar</div>

    if (activeFollow.platform === 'twitter') {
      const tUrl = activeFollow.type === 'account'
        ? `https://x.com/${activeFollow.value}`
        : `https://x.com/search?q=${encodeURIComponent(activeFollow.value)}`
      return (
        <div className="browser-blocked">
          <div className="browser-blocked-icon">🐦</div>
          <div className="browser-blocked-title">X / Twitter requires a paid API key</div>
          <div className="browser-blocked-sub">Open it in your browser to browse this account or search — Vigil stays open in the background.</div>
          <button className="browser-open-btn" onClick={() => window.open(tUrl, '_blank', 'noopener')}>↗ Open {activeFollow.label} on X</button>
        </div>
      )
    }

    if (activeFollow.platform === 'telegram') {
      return (
        <div className="browser-blocked">
          <div className="browser-blocked-icon">✈️</div>
          <div className="browser-blocked-title">Telegram channel</div>
          <div className="browser-blocked-sub">Open this channel in Telegram or your browser to read messages.</div>
          <button className="browser-open-btn" onClick={() => window.open(`https://t.me/${activeFollow.value}`, '_blank', 'noopener')}>↗ Open {activeFollow.label} on Telegram</button>
        </div>
      )
    }

    if (loading && posts.length === 0) return <SkeletonFeedItems count={6} />
    if (!loading && posts.length === 0) return (
      <div className="empty-state"><span className="empty-state-icon">🔍</span>No posts found for {activeFollow.label}</div>
    )
    return posts.map((post, i) => (
      <a key={i} className="social-post" href={`https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer">
        <div className="social-post-meta">🔴 r/{post.subreddit} · {socialAge(post.created_utc)}</div>
        <div className="social-post-title">{post.title}</div>
        <div className="social-post-score">▲ {socialFmt(post.score)} · 💬 {socialFmt(post.num_comments)}</div>
      </a>
    ))
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header widget-drag-handle">
        <span className="widget-title">SOCIAL FEED</span>
        <div className="widget-actions">
          <LiveBtn isLive={isLive} workspacePaused={workspacePaused} onToggle={() => setIsLive(v => !v)} />
          {onCollapse   && <button className="widget-btn" onClick={onCollapse}   title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose}      title="Close">✕</button>}
        </div>
      </div>

      <div className="rss-body">
        <div className="social-sidebar" onPointerDownCapture={e => e.stopPropagation()}>
          <div className="rss-sidebar-label">FOLLOWING</div>
          <div className="rss-source-list">
            {SOCIAL_PLAT_ORDER.filter(p => grouped[p]?.length).map(platform => (
              <div key={platform}>
                <div className="social-group-label">{SOCIAL_PLAT_LABEL[platform]}</div>
                {grouped[platform].map(f => (
                  <div key={f.id} className={`rss-source-item${activeId === f.id ? ' active' : ''}`} onClick={() => setActiveId(f.id)}>
                    <span className="social-plat-icon">{socialIcon(f.platform)}</span>
                    <span className="rss-source-name">{f.label}</span>
                    <button className="rss-source-del" onClick={e => { e.stopPropagation(); removeFollow(f.id) }}>×</button>
                  </div>
                ))}
              </div>
            ))}

            {addingFollow && (
              <div className="rss-add-source-form" onPointerDownCapture={e => e.stopPropagation()}
                style={{ padding: '6px 8px', borderTop: '1px solid #1a2535' }}>
                <div className="social-platform-btns">
                  {SOCIAL_PLAT_ORDER.map(p => (
                    <button key={p} className={`social-plat-btn${addPlatform === p ? ' active' : ''}`}
                      onClick={() => { setAddPlatform(p); setAddValue('') }}>{socialIcon(p)}</button>
                  ))}
                </div>
                <input autoFocus className="rss-add-source-input" value={addValue}
                  onChange={e => setAddValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addFollow(); if (e.key === 'Escape') { setAddingFollow(false); setAddValue('') } }}
                  placeholder={addPlaceholder} />
                <div className="rss-add-source-actions">
                  <button className="rss-add-source-add" onClick={addFollow}>ADD</button>
                  <button className="rss-add-source-cancel" onClick={() => { setAddingFollow(false); setAddValue('') }}>Cancel</button>
                </div>
              </div>
            )}
            <button className="rss-add-source-btn" style={{ margin: '4px 8px', width: 'calc(100% - 16px)' }}
              onClick={() => setAddingFollow(v => !v)}>＋ Add</button>
          </div>
        </div>

        <div className="rss-right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {renderRight()}
          </div>
        </div>
      </div>
    </div>
  )
}

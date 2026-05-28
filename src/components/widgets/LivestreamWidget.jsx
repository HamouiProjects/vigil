import { useState, useEffect, useRef } from 'react'
import usePageVisibility from '../../hooks/usePageVisibility'
import { getSettings, subscribeSettings } from '../../utils/settingsStore'
import WHeader from '../shared/WHeader'

const DEFAULT_STREAMS = [
  { name: 'Al Jazeera English', url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { name: 'DW News Live',       url: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg' },
  { name: 'France 24 English',  url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UGuXpkw' },
]

function toEmbedUrl(raw) {
  const s = raw.trim()
  try {
    const u = new URL(s)
    if (u.hostname.includes('youtube') && u.pathname.startsWith('/embed/')) return s
    if (u.searchParams.has('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    const parts = u.pathname.split('/').filter(Boolean)
    if (['live', 'v'].includes(parts[0]) && parts[1]) return `https://www.youtube.com/embed/${parts[1]}`
    return s
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return `https://www.youtube.com/embed/${s}`
    return null
  }
}

function withAutoplay(url) {
  if (!url) return ''
  try {
    const u = new URL(url)
    u.searchParams.set('autoplay', '1')
    u.searchParams.set('mute', '1')
    return u.toString()
  } catch { return url }
}

export default function Livestream({ widgetId = 'stream', onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const streamsKey = `vigil_stream_streams_${widgetId}`
  const activeKey  = `vigil_stream_active_${widgetId}`

  const [streams, setStreams] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(streamsKey) || 'null')
      if (Array.isArray(saved) && saved.length) return saved
    } catch {}
    return DEFAULT_STREAMS
  })

  const [activeUrl, setActiveUrl] = useState(() => {
    try {
      const saved = localStorage.getItem(activeKey)
      if (saved) return saved
    } catch {}
    return DEFAULT_STREAMS[0].url
  })

  const [editMode,  setEditMode]  = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newUrl,    setNewUrl]    = useState('')
  const [addError,  setAddError]  = useState('')
  const [globalLive, setGlobalLive] = useState(() => getSettings().globalLive)
  const [isLive,    setIsLive]    = useState(true)

  const isVisible = usePageVisibility()

  useEffect(() => subscribeSettings(s => setGlobalLive(s.globalLive)), [])

  const anyPaused = !globalLive || workspacePaused || !isLive

  function saveStreams(next) {
    setStreams(next)
    try { localStorage.setItem(streamsKey, JSON.stringify(next)) } catch {}
  }

  function selectStream(url) {
    setActiveUrl(url)
    try { localStorage.setItem(activeKey, url) } catch {}
  }

  function addStream(e) {
    e.preventDefault()
    const name = newName.trim()
    const raw  = newUrl.trim()
    if (!name || !raw) { setAddError('Name and URL required'); return }
    const url = toEmbedUrl(raw)
    if (!url) { setAddError('Invalid YouTube URL'); return }
    if (streams.some(s => s.url === url)) { setAddError('Already in list'); return }
    saveStreams([...streams, { name, url }])
    setNewName(''); setNewUrl(''); setAddError('')
  }

  function removeStream(idx) {
    const next = streams.filter((_, i) => i !== idx)
    saveStreams(next)
    if (activeUrl === streams[idx].url) selectStream(next[0]?.url ?? '')
  }

  const iframeSrc = isVisible && !anyPaused ? withAutoplay(activeUrl) : ''

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="LIVESTREAM" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={onFullscreen} isFullscreen={isFullscreen} onClose={onClose}>
        <button
          className="widget-btn"
          onClick={() => setEditMode(v => !v)}
          title={editMode ? 'Done editing' : 'Manage streams'}
          style={editMode ? { color: 'var(--accent)' } : undefined}
        >✏</button>
      </WHeader>

      {/* stream selector chips */}
      <div className="rss-filters-strip" style={{ flexShrink: 0 }} onPointerDownCapture={e => e.stopPropagation()}>
        <div className="rss-filters-chips">
          {streams.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <div
                className={`rss-filter-chip${activeUrl === s.url ? ' active' : ''}`}
                onClick={() => selectStream(s.url)}
              >
                <span className="rss-filter-chip-text">{s.name}</span>
              </div>
              {editMode && (
                <button
                  className="rss-filter-chip-del"
                  style={{ position: 'static', opacity: 1 }}
                  onClick={() => removeStream(i)}
                  title="Remove"
                >✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* add stream form — edit mode only */}
      {editMode && (
        <form
          className="rss-add-source-form"
          onSubmit={addStream}
          onPointerDownCapture={e => e.stopPropagation()}
          style={{ flexShrink: 0, padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              className="rss-add-source-input"
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError('') }}
              placeholder="Name…"
              style={{ flex: '0 0 30%' }}
            />
            <input
              className="rss-add-source-input"
              value={newUrl}
              onChange={e => { setNewUrl(e.target.value); setAddError('') }}
              placeholder="YouTube URL or embed link…"
              spellCheck={false}
              style={{ flex: 1 }}
            />
            <button className="rss-add-source-add" type="submit">ADD</button>
          </div>
          {addError && <span style={{ fontSize: '9px', color: '#ff4d4f' }}>{addError}</span>}
        </form>
      )}

      {/* iframe */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <iframe
          key={iframeSrc}
          src={iframeSrc}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Livestream"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        {anyPaused && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(10,12,16,0.93)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: 'var(--amber)', fontSize: 22 }}>⏸</span>
            <span style={{ color: 'var(--amber)', fontSize: 11, letterSpacing: '0.12em' }}>PAUSED</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>Live feed disabled</span>
          </div>
        )}
      </div>
    </div>
  )
}

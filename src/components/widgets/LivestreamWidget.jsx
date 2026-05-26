import { useState, useEffect } from 'react'
import usePageVisibility from '../../hooks/usePageVisibility'

export const AJ_EMBED = 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=0&mute=1'

function toEmbedUrl(raw) {
  const s = raw.trim()
  try {
    const u = new URL(s)
    if (u.hostname.includes('youtube') && u.pathname.startsWith('/embed/')) {
      u.searchParams.set('autoplay', '0'); u.searchParams.set('mute', '1')
      return u.toString()
    }
    if (u.searchParams.has('v'))
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}?autoplay=0&mute=1`
    if (u.hostname === 'youtu.be')
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=0&mute=1`
    const parts = u.pathname.split('/').filter(Boolean)
    if (['live', 'v'].includes(parts[0]) && parts[1])
      return `https://www.youtube.com/embed/${parts[1]}?autoplay=0&mute=1`
    return s
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(s))
      return `https://www.youtube.com/embed/${s}?autoplay=0&mute=1`
    return null
  }
}

export default function Livestream({ initialUrl = AJ_EMBED, onUrlChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const [embedUrl,   setEmbedUrl]   = useState(initialUrl)
  const [input,      setInput]      = useState(initialUrl)
  const [error,      setError]      = useState(null)
  const isVisibleLs = usePageVisibility()

  useEffect(() => { setEmbedUrl(initialUrl); setInput(initialUrl) }, [initialUrl])

  function handleSubmit(e) {
    e.preventDefault()
    const url = toEmbedUrl(input)
    if (url) { setEmbedUrl(url); setInput(url); setError(null); onUrlChange?.(url) }
    else setError('Invalid YouTube URL or video ID')
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header widget-drag-handle">
        <span className="widget-title">LIVESTREAM</span>
        <div className="widget-actions">
          <span className={`widget-badge${embedUrl ? '' : ' inactive'}`}>
            {embedUrl && <span className="badge-dot" />}
            {embedUrl ? 'LIVE' : 'STANDBY'}
          </span>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose} title="Close">✕</button>}
        </div>
      </div>
      <form className="rss-url-bar" onSubmit={handleSubmit} style={{ flexShrink: 0 }}>
        <input className="rss-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Paste any YouTube URL or embed link…" spellCheck={false} />
        <button className="rss-go-btn" type="submit">GO</button>
      </form>
      {error && <div className="feed-error" style={{ flexShrink: 0, height: 'auto', padding: '4px 12px' }}>{error}</div>}
      <iframe
        key={embedUrl}
        src={isVisibleLs ? embedUrl : ''}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="Livestream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}

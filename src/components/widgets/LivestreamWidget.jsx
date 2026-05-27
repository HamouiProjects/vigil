import { useState, useEffect, useRef } from 'react'
import usePageVisibility from '../../hooks/usePageVisibility'
import { getSettings, subscribeSettings } from '../../utils/settingsStore'
import WHeader from '../shared/WHeader'

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

export default function Livestream({ initialUrl = AJ_EMBED, onUrlChange, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const [embedUrl,   setEmbedUrl]   = useState(initialUrl)
  const [input,      setInput]      = useState(initialUrl)
  const [error,      setError]      = useState(null)
  const [globalLive, setGlobalLive] = useState(() => getSettings().globalLive)
  const [isLive,     setIsLive]     = useState(true)
  const savedUrlRef  = useRef(initialUrl)
  const isVisibleLs  = usePageVisibility()

  useEffect(() => subscribeSettings(s => setGlobalLive(s.globalLive)), [])

  const anyPaused = !globalLive || workspacePaused || !isLive

  useEffect(() => { setEmbedUrl(initialUrl); setInput(initialUrl) }, [initialUrl])

  function handleSubmit(e) {
    e.preventDefault()
    const url = toEmbedUrl(input)
    if (url) { savedUrlRef.current = url; setEmbedUrl(url); setInput(url); setError(null); onUrlChange?.(url) }
    else setError('Invalid YouTube URL or video ID')
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="LIVESTREAM" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={onFullscreen} isFullscreen={isFullscreen} onClose={onClose} />
      <form className="rss-url-bar" onSubmit={handleSubmit} style={{ flexShrink: 0 }}>
        <input className="rss-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Paste any YouTube URL or embed link…" spellCheck={false} />
        <button className="rss-go-btn" type="submit">GO</button>
      </form>
      {error && <div className="feed-error" style={{ flexShrink: 0, height: 'auto', padding: '4px 12px' }}>{error}</div>}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <iframe
          key={embedUrl}
          src={isVisibleLs && !anyPaused ? embedUrl : ''}
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

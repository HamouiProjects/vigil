import { useState } from 'react'
import Widget from './Widget'

// Al Jazeera English — stable live-stream video ID
const DEFAULT_URL = 'https://www.youtube.com/watch?v=h3MuIUNCCLI'

function parseYouTubeId(raw) {
  try {
    const url = new URL(raw.trim())
    // youtube.com/watch?v=ID
    if (url.searchParams.has('v')) return url.searchParams.get('v')
    // youtube.com/live/ID  or  youtube.com/embed/ID
    const parts = url.pathname.split('/').filter(Boolean)
    if (['live', 'embed', 'v'].includes(parts[0])) return parts[1]
    // youtu.be/ID
    if (url.hostname === 'youtu.be') return parts[0]
  } catch { /* not a URL */ }
  // bare ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw.trim())) return raw.trim()
  return null
}

function embedSrc(videoId) {
  return (
    `https://www.youtube.com/embed/${videoId}` +
    `?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1`
  )
}

export default function Livestream() {
  const [input,   setInput]   = useState(DEFAULT_URL)
  const [videoId, setVideoId] = useState(() => parseYouTubeId(DEFAULT_URL))
  const [error,   setError]   = useState(null)

  function handleSubmit(e) {
    e.preventDefault()
    const id = parseYouTubeId(input)
    if (id) { setVideoId(id); setError(null) }
    else setError('Unrecognised YouTube URL or ID')
  }

  const isLive = !!videoId

  return (
    <Widget
      title="Livestream"
      icon="📹"
      badge={isLive ? 'LIVE' : 'STANDBY'}
      badgeActive={isLive}
    >
      <div className="stream-container">
        <form className="stream-url-bar" onSubmit={handleSubmit}>
          <input
            className="rss-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="YouTube URL or video ID…"
            spellCheck={false}
          />
          <button className="rss-go-btn" type="submit">GO</button>
        </form>

        {error && <div className="feed-error" style={{ height: 'auto', padding: '6px 12px' }}>{error}</div>}

        {videoId ? (
          <iframe
            className="stream-iframe"
            src={embedSrc(videoId)}
            title="Livestream"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            frameBorder="0"
          />
        ) : (
          <div className="stream-body">
            <div className="stream-icon">📹</div>
            <div className="stream-label">Paste a YouTube URL above</div>
            <div className="stream-live-badge">STANDBY</div>
          </div>
        )}
      </div>
    </Widget>
  )
}

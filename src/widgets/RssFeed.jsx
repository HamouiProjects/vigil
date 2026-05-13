import { useState, useEffect, useCallback, useRef } from 'react'
import Widget from './Widget'

const DEFAULT_RSS = 'https://feeds.bbci.co.uk/news/world/rss.xml'
const RSS2JSON    = (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`

function relTime(pubDate) {
  try {
    const diff = Math.floor((Date.now() - new Date(pubDate).getTime()) / 60_000)
    if (diff < 1)   return 'now'
    if (diff < 60)  return `${diff}m`
    if (diff < 1440) return `${Math.floor(diff / 60)}h`
    return `${Math.floor(diff / 1440)}d`
  } catch { return '—' }
}

export default function RssFeed() {
  const [url,     setUrl]     = useState(DEFAULT_RSS)
  const [input,   setInput]   = useState(DEFAULT_RSS)
  const [feed,    setFeed]    = useState(null)
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const inputRef = useRef(null)

  const fetch_ = useCallback(async (targetUrl) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(RSS2JSON(targetUrl))
      const json = await res.json()
      if (json.status !== 'ok') throw new Error(json.message || 'Bad response')
      setFeed(json.feed)
      setItems(json.items ?? [])
    } catch (e) {
      setError(e.message || 'Failed to fetch feed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch_(url) }, [url, fetch_])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = input.trim()
    if (trimmed) setUrl(trimmed)
  }

  const badge = loading ? 'LOADING…' : error ? 'ERROR' : feed ? feed.title?.slice(0, 18) : 'RSS'

  return (
    <Widget
      title="RSS Feed"
      icon="📰"
      badge={badge}
      badgeActive={!error && !loading}
      onRefresh={() => fetch_(url)}
    >
      <div className="rss-container">
        <form className="rss-url-bar" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="rss-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste RSS URL…"
            spellCheck={false}
          />
          <button className="rss-go-btn" type="submit">GO</button>
        </form>

        {error ? (
          <div className="feed-error">{error}</div>
        ) : loading ? (
          <div className="feed-loading">Fetching feed…</div>
        ) : (
          <div className="feed-list">
            {items.map((item, i) => (
              <a
                key={i}
                className="feed-item feed-item-link"
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="feed-dot blue" />
                <span className="feed-text">{item.title}</span>
                <span className="feed-time">{relTime(item.pubDate)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Widget>
  )
}

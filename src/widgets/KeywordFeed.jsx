import { useState, useEffect, useCallback } from 'react'
import Widget from './Widget'

const GDELT_URL =
  'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict+war+crisis+attack&mode=artlist&maxrecords=15&format=json'

const REFRESH_MS = 60_000

function dotColor(title = '') {
  const t = title.toLowerCase()
  if (/war|attack|kill|bomb|shoot|explo|missil|airst/i.test(t))  return 'red'
  if (/crisis|sanction|tension|protest|riot|unrest/i.test(t))    return 'yellow'
  if (/deal|agree|peace|ceasefire|accord/i.test(t))              return 'green'
  return 'blue'
}

function relativeTime(seendate) {
  // seendate format: "20240513T120000Z"
  try {
    const s = seendate.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z'
    )
    const diff = Math.floor((Date.now() - new Date(s).getTime()) / 60_000)
    if (diff < 1)  return 'now'
    if (diff < 60) return `${diff}m`
    return `${Math.floor(diff / 60)}h`
  } catch { return '—' }
}

export default function KeywordFeed() {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetch_ = useCallback(async () => {
    try {
      const res  = await fetch(GDELT_URL)
      const json = await res.json()
      setArticles(json.articles ?? [])
      setError(null)
      setLastUpdate(new Date())
    } catch (e) {
      setError('GDELT unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetch_])

  const badge = loading ? 'LOADING…'
    : error   ? 'ERROR'
    : `${articles.length} ITEMS`
  const badgeActive = !error && !loading

  return (
    <Widget title="Keyword Feed" icon="📡" badge={badge} badgeActive={badgeActive} onRefresh={fetch_}>
      {error ? (
        <div className="feed-error">{error}</div>
      ) : loading ? (
        <div className="feed-loading">Fetching GDELT…</div>
      ) : (
        <div className="feed-list">
          {articles.map((a, i) => (
            <a
              key={i}
              className="feed-item feed-item-link"
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className={`feed-dot ${dotColor(a.title)}`} />
              <span className="feed-text">
                <span className="feed-source">{a.domain}</span>
                {a.title}
              </span>
              <span className="feed-time">{relativeTime(a.seendate)}</span>
            </a>
          ))}
        </div>
      )}
    </Widget>
  )
}

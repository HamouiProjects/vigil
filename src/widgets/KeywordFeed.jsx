import { useState, useEffect, useCallback, useRef } from 'react'
import Widget from './Widget'

const DEFAULT_QUERY = 'conflict OR war OR crisis OR attack'
const REFRESH_MS    = 60_000

function gdeltUrl(query) {
  return (
    'https://api.gdeltproject.org/api/v2/doc/doc' +
    `?query=${encodeURIComponent(query + ' sourcelang:english')}` +
    '&mode=artlist&maxrecords=20&format=json'
  )
}

function dotColor(title = '') {
  if (/war|attack|kill|bomb|shoot|explo|missil|airst/i.test(title)) return 'red'
  if (/crisis|sanction|tension|protest|riot|unrest/i.test(title))   return 'yellow'
  if (/deal|agree|peace|ceasefire|accord/i.test(title))             return 'green'
  return 'blue'
}

function relativeTime(seendate) {
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
  const [query,    setQuery]    = useState(DEFAULT_QUERY)
  const [input,    setInput]    = useState(DEFAULT_QUERY)
  const [articles, setArticles] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const fetch_ = useCallback(async (q) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(gdeltUrl(q))
      const json = await res.json()
      setArticles(json.articles ?? [])
    } catch {
      setError('GDELT unreachable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_(query)
    const id = setInterval(() => fetch_(query), REFRESH_MS)
    return () => clearInterval(id)
  }, [query, fetch_])

  function handleSubmit(e) {
    e.preventDefault()
    const q = input.trim()
    if (q) setQuery(q)
  }

  const badge = loading ? 'LOADING…' : error ? 'ERROR' : `${articles.length} ENG`
  const badgeActive = !error && !loading

  return (
    <Widget title="Keyword Feed" icon="📡" badge={badge} badgeActive={badgeActive} onRefresh={() => fetch_(query)}>
      <div className="rss-container">
        <form className="rss-url-bar" onSubmit={handleSubmit}>
          <input
            className="rss-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Search keywords…"
            spellCheck={false}
          />
          <button className="rss-go-btn" type="submit">GO</button>
        </form>

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
      </div>
    </Widget>
  )
}

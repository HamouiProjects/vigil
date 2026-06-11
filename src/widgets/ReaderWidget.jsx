import { useState, useEffect, useRef } from 'react'

export default function ReaderWidget({ config, onSaveConfig, setActions }) {
  const initUrl = config.url ?? ''
  const [input, setInput] = useState(initUrl)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [article, setArticle] = useState(null)
  const [error, setError] = useState(null)
  const [devOffline, setDevOffline] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const saved = config.saved ?? []

  const configRef = useRef(config); configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig); onSaveConfigRef.current = onSaveConfig
  function patch(p) { onSaveConfigRef.current({ ...configRef.current, ...p }) }

  function toggleSave() {
    if (!url || !article) return
    if (saved.some(s => s.url === url)) { patch({ saved: saved.filter(s => s.url !== url) }); return }
    let hostname = ''
    try { hostname = new URL(url).hostname.replace(/^www\./, '') } catch { hostname = '' }
    patch({ saved: [...saved, { url, title: article.title || url, source: article.siteName || hostname }] })
  }

  function removeSaved(targetUrl) { patch({ saved: saved.filter(s => s.url !== targetUrl) }) }

  async function doFetch(rawUrl) {
    let u = rawUrl.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    setUrl(u); setInput(u); setLoading(true); setError(null); setArticle(null); setDevOffline(false)
    patch({ url: u })
    try {
      const res = await fetch(`/api/fetch-article?url=${encodeURIComponent(u)}`)
      let data
      try { data = await res.json() } catch { setDevOffline(true); return }
      if (!res.ok) setError(data.error || `HTTP ${res.status}`)
      else setArticle(data)
    } catch {
      setDevOffline(true)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(str) {
    if (!str) return null
    try { return new Date(str).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return str }
  }

  const isSaved = saved.some(s => s.url === url)

  useEffect(() => {
    setActions?.(
      <>
        {article && (
          <button type="button" className="widget-btn" onClick={toggleSave} title={isSaved ? 'Remove from saved' : 'Save article'} style={isSaved ? { color: 'var(--accent)' } : undefined}>{isSaved ? '★' : '☆'}</button>
        )}
        {saved.length > 0 && (
          <button type="button" className="widget-btn" onClick={() => setEditMode(v => !v)} title={editMode ? 'Done editing' : 'Manage saved'} style={editMode ? { color: 'var(--accent)' } : undefined}>✏</button>
        )}
        {url && (
          <button type="button" className="widget-btn" onClick={() => window.open(url, '_blank', 'noopener')} title="Open in new tab">↗</button>
        )}
      </>
    )
  }, [setActions, saved, article, editMode, url])

  return (
    <div className="widget" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <form className="browser-bar" onSubmit={e => { e.preventDefault(); doFetch(input) }} onPointerDownCapture={e => e.stopPropagation()}>
        <input className="rss-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Paste article URL…" spellCheck={false} />
        <button className="rss-go-btn" type="submit" disabled={loading}>{loading ? '…' : 'GO'}</button>
      </form>

      {saved.length > 0 && (
        <div className="rss-filters-strip" style={{ flexShrink: 0 }} onPointerDownCapture={e => e.stopPropagation()}>
          <div className="rss-filters-chips">
            {saved.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <div className={`rss-filter-chip${s.url === url ? ' active' : ''}`} onClick={() => doFetch(s.url)}>
                  <span className="rss-filter-chip-text">{s.source || s.title}</span>
                </div>
                {editMode && (
                  <button className="rss-filter-chip-del" style={{ position: 'static', opacity: 1 }} onClick={() => removeSaved(s.url)} title="Remove">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="article-reader-body">
        {loading && (
          <div className="article-state-center"><span className="article-loading-text">FETCHING ARTICLE</span></div>
        )}
        {!loading && devOffline && (
          <div className="article-state-center">
            <div className="article-dev-offline">
              <span className="article-dev-offline-icon">ℹ</span>
              Reader requires <code>vercel dev</code> in local development. Article fetching works on the deployed site.
            </div>
          </div>
        )}
        {!loading && !devOffline && error && (
          <div className="article-state-center">
            <div className="article-error-line">
              Could not fetch article.{' '}
              {url && <button className="article-error-open" onClick={() => window.open(url, '_blank', 'noopener')}>Try opening it directly ↗</button>}
            </div>
          </div>
        )}
        {!loading && !devOffline && !error && !article && (
          <div className="article-state-center article-state-empty">
            <div className="article-empty-glyph">[ ]</div>
            <div className="article-empty-label">Paste any article URL above</div>
          </div>
        )}
        {!loading && !error && article && (
          <div className="article-content-wrap">
            {article.siteName && <div className="article-source">{article.siteName}</div>}
            <h1 className="article-headline">{article.title}</h1>
            {(article.byline || article.publishedTime) && (
              <div className="article-meta">
                {article.byline && <span>{article.byline}</span>}
                {article.byline && article.publishedTime && <span className="article-meta-dot">·</span>}
                {article.publishedTime && <span>{formatDate(article.publishedTime)}</span>}
              </div>
            )}
            <div className="article-hr" />
            {article.leadImage && <img className="article-lead-img" src={article.leadImage} alt="" loading="lazy" />}
            {Array.isArray(article.paragraphs) && article.paragraphs.length > 0 && (
              <div className="article-body">
                {article.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

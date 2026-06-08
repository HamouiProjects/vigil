import { useState, useEffect, useRef } from 'react'
import usePageVisibility from '../hooks/usePageVisibility'

const DEFAULT_STREAMS = [
  { name: 'Al Jazeera English', url: 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { name: 'DW News Live',       url: 'https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg' },
  { name: 'France 24 English',  url: 'https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5VrQ8yKZ-UGuXpkw' },
]

const YT_ID = /^[a-zA-Z0-9_-]{11}$/
function toEmbedUrl(raw) {
  const s = (raw || '').trim()
  if (YT_ID.test(s)) return `https://www.youtube.com/embed/${s}`
  let u
  try { u = new URL(s) } catch { return null }
  if (!['http:', 'https:'].includes(u.protocol)) return null
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
  const isYT = host === 'youtube.com' || host === 'youtube-nocookie.com'
  const isShort = host === 'youtu.be'
  if (isYT && u.pathname.startsWith('/embed/')) return `https://www.youtube.com${u.pathname}${u.search}`
  if (isYT && u.searchParams.has('v')) { const id = u.searchParams.get('v'); return YT_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null }
  if (isShort) { const id = u.pathname.slice(1).split('/')[0]; return YT_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null }
  if (isYT) { const p = u.pathname.split('/').filter(Boolean); if (['live','v'].includes(p[0]) && YT_ID.test(p[1] || '')) return `https://www.youtube.com/embed/${p[1]}` }
  return null
}

export default function LivestreamWidget({ paused, config, onSaveConfig, setActions }) {
  const streams = config.streams ?? DEFAULT_STREAMS
  const activeUrl = config.activeUrl ?? streams[0]?.url ?? ''

  const [editMode, setEditMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [addError, setAddError] = useState('')

  const isVisible = usePageVisibility()
  const configRef = useRef(config); configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig); onSaveConfigRef.current = onSaveConfig

  function patch(p) { onSaveConfigRef.current({ ...configRef.current, ...p }) }
  function selectStream(url) { patch({ activeUrl: url }) }

  function addStream(e) {
    e.preventDefault()
    const name = newName.trim(); const raw = newUrl.trim()
    if (!name || !raw) { setAddError('Name and URL required'); return }
    const url = toEmbedUrl(raw)
    if (!url) { setAddError('Invalid YouTube URL'); return }
    if (streams.some(s => s.url === url)) { setAddError('Already in list'); return }
    patch({ streams: [...streams, { name, url }] })
    setNewName(''); setNewUrl(''); setAddError('')
  }

  function removeStream(idx) {
    const next = streams.filter((_, i) => i !== idx)
    const wasActive = activeUrl === streams[idx].url
    onSaveConfigRef.current({ ...configRef.current, streams: next, ...(wasActive ? { activeUrl: next[0]?.url ?? '' } : {}) })
  }

  useEffect(() => {
    setActions?.(
      <button
        type="button"
        className="widget-btn"
        onClick={() => setEditMode(v => !v)}
        title={editMode ? 'Done editing' : 'Manage streams'}
        style={editMode ? { color: 'var(--accent)' } : undefined}
      >✏</button>
    )
  }, [setActions, editMode])

  const off = paused || !isVisible
  const embedSrc = toEmbedUrl(activeUrl) || ''   // re-validate at render: neutralizes any legacy/cloned non-YouTube url
  const iframeSrc = off ? '' : embedSrc

  return (
    <>
      <div className="rss-filters-strip" style={{ flexShrink: 0 }} onPointerDownCapture={e => e.stopPropagation()}>
        <div className="rss-filters-chips">
          {streams.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <div className={`rss-filter-chip${activeUrl === s.url ? ' active' : ''}`} onClick={() => selectStream(s.url)}>
                <span className="rss-filter-chip-text">{s.name}</span>
              </div>
              {editMode && (
                <button className="rss-filter-chip-del" style={{ position: 'static', opacity: 1 }} onClick={() => removeStream(i)} title="Remove">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {editMode && (
        <form className="rss-add-source-form" onSubmit={addStream} onPointerDownCapture={e => e.stopPropagation()} style={{ flexShrink: 0, padding: '6px 8px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input className="rss-add-source-input" value={newName} onChange={e => { setNewName(e.target.value); setAddError('') }} placeholder="Name…" style={{ flex: '0 0 30%' }} />
            <input className="rss-add-source-input" value={newUrl} onChange={e => { setNewUrl(e.target.value); setAddError('') }} placeholder="YouTube URL or embed link…" spellCheck={false} style={{ flex: 1 }} />
            <button className="rss-add-source-add" type="submit">ADD</button>
          </div>
          {addError && <span style={{ fontSize: '9px', color: '#ff4d4f' }}>{addError}</span>}
        </form>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {embedSrc ? (
          <iframe key={iframeSrc} src={iframeSrc} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="Livestream" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em' }}>No stream — YouTube links only</div>
        )}
        {off && embedSrc && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,12,16,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--amber)', fontSize: 22 }}>⏸</span>
            <span style={{ color: 'var(--amber)', fontSize: 11, letterSpacing: '0.12em' }}>PAUSED</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em' }}>Live feed disabled</span>
          </div>
        )}
      </div>
    </>
  )
}

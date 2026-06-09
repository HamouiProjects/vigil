import { useState, useEffect, useRef } from 'react'
import usePageVisibility from '../hooks/usePageVisibility'

const LOADER_SRC = 'https://ssl.gstatic.com/trends_nrtr/3620_RC01/embed_loader.js'

const TIME_OPTIONS = [
  { label: '7d', value: 'now 7-d' },
  { label: '30d', value: 'today 1-m' },
  { label: '12m', value: 'today 12-m' },
  { label: '5y', value: 'today 5-y' },
]

let loaderPromise = null

function loadTrendsLoader() {
  if (window.trends?.embed) return Promise.resolve()
  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-vigil-trends-loader]')
      if (existing) {
        const done = () => {
          if (window.trends?.embed) resolve()
          else reject(new Error('Trends loader failed'))
        }
        if (window.trends?.embed) {
          resolve()
          return
        }
        existing.addEventListener('load', done, { once: true })
        existing.addEventListener('error', () => reject(new Error('Trends loader failed')), { once: true })
        return
      }
      const script = document.createElement('script')
      script.src = LOADER_SRC
      script.setAttribute('data-vigil-trends-loader', '1')
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Trends loader failed'))
      document.head.appendChild(script)
    })
  }
  return loaderPromise
}

export default function TrendsWidget({ paused, config, onSaveConfig, setActions, setTitle }) {
  const keyword = config.keyword ?? ''
  const time = config.time ?? 'today 12-m'

  const [draft, setDraft] = useState(keyword)
  const [status, setStatus] = useState('idle')

  const containerRef = useRef(null)
  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig
  const fallbackTimerRef = useRef(null)

  const isVisible = usePageVisibility()
  const off = paused || !isVisible

  function patch(p) {
    onSaveConfigRef.current({ ...configRef.current, ...p })
  }

  useEffect(() => {
    setTitle?.('Search Interest')
  }, [setTitle])

  useEffect(() => {
    setDraft(keyword)
  }, [keyword])

  useEffect(() => {
    if (!keyword) {
      setStatus('idle')
      return undefined
    }
    let cancelled = false
    setStatus('loading')
    loadTrendsLoader()
      .then(() => {
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''
        window.trends.embed.renderExploreWidgetTo(
          containerRef.current,
          'TIMESERIES',
          { comparisonItem: [{ keyword, geo: '', time }], category: 0, property: '' },
          {
            exploreQuery: `date=${time}&geo=&q=${encodeURIComponent(keyword)}&hl=en`,
            guestPath: 'https://trends.google.com:443/trends/embed/',
          },
        )
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = setTimeout(() => {
          if (cancelled) return
          setStatus(containerRef.current?.querySelector('iframe') ? 'ok' : 'failed')
        }, 4500)
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })
    return () => {
      cancelled = true
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current)
    }
  }, [keyword, time])

  function handleSubmit(e) {
    e.preventDefault()
    patch({ keyword: draft.trim() })
  }

  return (
    <>
      <div
        className="rss-filters-strip"
        style={{ flexShrink: 0 }}
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}
        >
          <input
            className="rss-add-source-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search term, e.g. inflation"
            spellCheck={false}
            style={{ flex: '1 1 140px', minWidth: 0 }}
          />
        </form>
        <div className="rss-filters-chips">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`rss-filter-chip${time === opt.value ? ' active' : ''}`}
              onClick={() => patch({ time: opt.value })}
            >
              <span className="rss-filter-chip-text">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <p
        style={{
          flexShrink: 0,
          margin: 0,
          padding: '0 8px 6px',
          fontSize: '9px',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Relative Google search interest, not volume.
      </p>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {!keyword ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              textAlign: 'center',
              padding: 16,
            }}
          >
            Enter a search term to see relative search interest.
          </div>
        ) : (
          <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'auto' }} />
        )}

        {status === 'failed' && keyword && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--color-surface-1)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 16,
              textAlign: 'center',
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>Couldn&apos;t load the Trends embed. Your browser may block cross-site content.</span>
            <a
              href={`https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}&date=${encodeURIComponent(time)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-brand)', fontSize: 10 }}
            >
              Open on Google Trends
            </a>
          </div>
        )}

        {off && keyword && (
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

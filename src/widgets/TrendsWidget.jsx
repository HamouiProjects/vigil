import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

const TIME_OPTIONS = [
  { label: '7d', value: 'now 7-d' },
  { label: '30d', value: 'today 1-m' },
  { label: '12m', value: 'today 12-m' },
  { label: '5y', value: 'today 5-y' },
]

const COLORS = [
  'var(--color-brand)',
  'var(--color-info)',
  'var(--color-warning)',
  'var(--color-error)',
  'var(--color-success)',
]

const CHART_W = 600
const CHART_H = 200
const CHART_PAD = 6
const Y_AXIS_W = 30
const Y_LABELS = [100, 75, 50, 25, 0]

function chartY(v) {
  return CHART_PAD + (CHART_H - 2 * CHART_PAD) * (1 - v / 100)
}

function resolveKeywords(config) {
  if (Array.isArray(config.keywords) && config.keywords.length) return config.keywords
  if (config.keyword) return [config.keyword]
  return []
}

function TrendsChart({ points, keywords }) {
  const n = points.length
  const firstLabel = points[0]?.label ?? ''
  const lastLabel = points[n - 1]?.label ?? ''

  const polylines = useMemo(() => {
    return keywords.map((_, ki) => {
      const coords = []
      points.forEach((p, idx) => {
        const v = p.values?.[ki]
        if (v == null) return
        const x = n <= 1 ? CHART_W / 2 : (idx / (n - 1)) * CHART_W
        coords.push(`${x},${chartY(v)}`)
      })
      return coords.join(' ')
    })
  }, [points, keywords, n])

  const gridYs = useMemo(() => Y_LABELS.map(chartY), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div
        style={{
          flexShrink: 0,
          padding: '6px 10px 2px',
          fontFamily: 'var(--font-sans)',
          fontSize: 9,
          color: 'var(--color-text-muted)',
        }}
      >
        {firstLabel && lastLabel ? `${firstLabel} → ${lastLabel}` : ''}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row' }}>
          <div
            style={{
              width: Y_AXIS_W,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: `${CHART_PAD}px 4px ${CHART_PAD}px 0`,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--color-text-muted)',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {Y_LABELS.map((v) => (
              <span key={v}>{v}</span>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              style={{ display: 'block', width: '100%', height: '100%' }}
              aria-hidden
            >
              {gridYs.map((y) => (
                <line
                  key={y}
                  x1={0}
                  y1={y}
                  x2={CHART_W}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {polylines.map((pts, ki) => (
                pts ? (
                  <polyline
                    key={keywords[ki] ?? ki}
                    points={pts}
                    fill="none"
                    stroke={COLORS[ki]}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null
              ))}
            </svg>
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: 'space-between',
            paddingLeft: Y_AXIS_W,
            padding: `2px 0 4px ${Y_AXIS_W}px`,
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--color-text-muted)',
          }}
        >
          <span>{firstLabel}</span>
          <span>{lastLabel}</span>
        </div>
      </div>
    </div>
  )
}

export default function TrendsWidget({ paused, config, onSaveConfig, setActions, setTitle }) {
  const keywords = useMemo(() => resolveKeywords(config), [config.keywords, config.keyword])
  const time = config.time ?? 'today 12-m'

  const [draftAdd, setDraftAdd] = useState('')
  const [status, setStatus] = useState('idle')
  const [points, setPoints] = useState([])
  const [chartKeywords, setChartKeywords] = useState([])
  const [showInfo, setShowInfo] = useState(false)

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig
  const fetchGenRef = useRef(0)
  const bodyRef = useRef(null)

  function patch(p) {
    onSaveConfigRef.current({ ...configRef.current, ...p })
  }

  const loadData = useCallback((fresh) => {
    const kws = resolveKeywords(configRef.current)
    if (!kws.length) return

    const gen = ++fetchGenRef.current
    setStatus('loading')

    const url = `/api/trends?keyword=${encodeURIComponent(kws.join(','))}&date=${encodeURIComponent(configRef.current.time ?? 'today 12-m')}${fresh ? '&fresh=1' : ''}`

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (gen !== fetchGenRef.current) return
        if (json.error === 'TRENDS_NOT_CONFIGURED') {
          setStatus('unconfigured')
          setPoints([])
          setChartKeywords([])
          return
        }
        if (json.error === 'TRENDS_UNAVAILABLE' || !json.points?.length) {
          setStatus('error')
          setPoints([])
          setChartKeywords([])
          return
        }
        setPoints(json.points)
        setChartKeywords(json.keywords ?? kws)
        setStatus('ok')
      })
      .catch(() => {
        if (gen !== fetchGenRef.current) return
        setStatus('error')
        setPoints([])
        setChartKeywords([])
      })
  }, [])

  const latestValues = useMemo(() => {
    const last = points[points.length - 1]
    if (!last?.values) return []
    return chartKeywords.map((_, i) => last.values[i] ?? null)
  }, [points, chartKeywords])

  useEffect(() => {
    setTitle?.('Search Interest')
  }, [setTitle])

  useEffect(() => {
    if (!keywords.length) {
      setStatus('idle')
      setPoints([])
      setChartKeywords([])
      return undefined
    }
    if (paused) return undefined
    loadData(false)
    return undefined
  }, [keywords, time, paused, loadData])

  useEffect(() => {
    setActions?.(
      <>
        <button
          type="button"
          className="widget-btn"
          onClick={() => setShowInfo((v) => !v)}
          title="About this data"
          style={showInfo ? { color: 'var(--accent)' } : undefined}
        >
          ?
        </button>
        <button
          type="button"
          className="widget-btn"
          onClick={() => loadData(true)}
          title="Refresh"
          disabled={paused || !keywords.length}
        >
          <span style={status === 'loading' ? { display: 'inline-block', animation: 'ns-spin 0.8s linear infinite' } : undefined}>
            ↻
          </span>
        </button>
      </>
    )
  }, [setActions, paused, keywords.length, status, showInfo, loadData])

  useEffect(() => {
    if (!showInfo) return undefined
    function onDoc(e) {
      if (bodyRef.current?.contains(e.target)) return
      setShowInfo(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showInfo])

  function handleAddTerm(e) {
    e.preventDefault()
    const term = draftAdd.trim()
    if (!term || keywords.includes(term) || keywords.length >= 5) return
    patch({ keywords: [...keywords, term] })
    setDraftAdd('')
  }

  function removeKeyword(kw) {
    patch({ keywords: keywords.filter((k) => k !== kw) })
  }

  const trendsUrl = `https://trends.google.com/trends/explore?q=${encodeURIComponent(keywords.join(','))}&date=${encodeURIComponent(time)}`

  return (
    <>
      <div
        className="rss-filters-strip"
        style={{ flexShrink: 0 }}
        onPointerDownCapture={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          {keywords.map((kw, i) => (
            <div
              key={kw}
              className="rss-filter-chip active"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'default' }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: COLORS[i],
                  flexShrink: 0,
                }}
              />
              <span className="rss-filter-chip-text">{kw}</span>
              {latestValues[i] != null && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {latestValues[i]}
                </span>
              )}
              <button
                type="button"
                className="rss-filter-chip-del"
                style={{ position: 'static', opacity: 1 }}
                onClick={() => removeKeyword(kw)}
                title={`Remove ${kw}`}
              >
                ×
              </button>
            </div>
          ))}
          {keywords.length < 5 && (
            <form onSubmit={handleAddTerm} style={{ display: 'inline-flex', minWidth: 0, flex: '1 1 100px' }}>
              <input
                className="rss-add-source-input"
                value={draftAdd}
                onChange={(e) => setDraftAdd(e.target.value)}
                placeholder="Add term…"
                spellCheck={false}
                style={{ width: '100%', minWidth: 80 }}
              />
            </form>
          )}
        </div>
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

      <div
        ref={bodyRef}
        style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}
      >
        {showInfo && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              maxWidth: 240,
              padding: 10,
              background: 'var(--color-surface-1)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--font-sans)',
              fontSize: 10,
              lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
              zIndex: 5,
              boxShadow: '0 4px 12px color-mix(in srgb, var(--color-bg) 40%, transparent)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: 10 }}>About</span>
              <button
                type="button"
                className="widget-btn widget-btn-close"
                onClick={() => setShowInfo(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            Source: Google Trends (via SerpApi). Values are relative search interest on a 0 to 100 scale within the chosen period and region, not absolute search volume. Data may be cached up to 12 hours.
          </div>
        )}

        {!keywords.length && (
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
            Add a search term to compare relative search interest.
          </div>
        )}

        {keywords.length > 0 && status === 'loading' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
            }}
          >
            Loading…
          </div>
        )}

        {keywords.length > 0 && status === 'ok' && points.length > 0 && (
          <TrendsChart points={points} keywords={chartKeywords} />
        )}

        {keywords.length > 0 && status === 'error' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              textAlign: 'center',
              padding: 16,
            }}
          >
            Couldn&apos;t load search interest right now.
          </div>
        )}

        {keywords.length > 0 && status === 'unconfigured' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              textAlign: 'center',
              padding: 16,
            }}
          >
            Search data source not configured.
          </div>
        )}
      </div>

      {keywords.length > 0 && (
        <div style={{ flexShrink: 0, padding: '6px 10px 8px', borderTop: '1px solid var(--color-border)' }}>
          <a
            href={trendsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 10,
              color: 'var(--color-brand)',
              textDecoration: 'none',
            }}
          >
            View on Google Trends ↗
          </a>
        </div>
      )}
    </>
  )
}

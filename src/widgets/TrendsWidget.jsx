import { useState, useEffect, useRef, useMemo } from 'react'

const TIME_OPTIONS = [
  { label: '7d', value: 'now 7-d' },
  { label: '30d', value: 'today 1-m' },
  { label: '12m', value: 'today 12-m' },
  { label: '5y', value: 'today 5-y' },
]

const CHART_W = 600
const CHART_H = 200
const CHART_PAD = 10

function chartY(value) {
  const plotH = CHART_H - 2 * CHART_PAD
  return CHART_PAD + plotH - (value / 100) * plotH
}

function TrendsChart({ points }) {
  const { polyline, areaPath, gridYs } = useMemo(() => {
    const n = points.length
    const plotH = CHART_H - 2 * CHART_PAD
    const xs = points.map((_, i) => (n <= 1 ? CHART_W / 2 : (i / (n - 1)) * CHART_W))
    const ys = points.map((p) => chartY(p.value))
    const poly = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
    const baseY = CHART_PAD + plotH
    const area = n
      ? `M ${xs[0]},${baseY} ${xs.map((x, i) => `L ${x},${ys[i]}`).join(' ')} L ${xs[n - 1]},${baseY} Z`
      : ''
    return {
      polyline: poly,
      areaPath: area,
      gridYs: [0, 50, 100].map(chartY),
    }
  }, [points])

  const latest = points[points.length - 1]
  const firstLabel = points[0]?.label ?? ''
  const lastLabel = latest?.label ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0, padding: '8px 10px 4px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {latest?.value ?? ''}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, color: 'var(--color-text-muted)' }}>
          {firstLabel && lastLabel ? `${firstLabel} → ${lastLabel}` : ''}
        </span>
      </div>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        style={{ display: 'block', flex: 1, minHeight: 0 }}
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
          />
        ))}
        {areaPath && (
          <path
            d={areaPath}
            fill="color-mix(in srgb, var(--color-brand) 18%, transparent)"
            stroke="none"
          />
        )}
        {polyline && (
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </svg>
    </div>
  )
}

export default function TrendsWidget({ paused, config, onSaveConfig, setActions, setTitle }) {
  const keyword = config.keyword ?? ''
  const time = config.time ?? 'today 12-m'

  const [draft, setDraft] = useState(keyword)
  const [status, setStatus] = useState('idle')
  const [points, setPoints] = useState([])

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

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
      setPoints([])
      return undefined
    }
    if (paused) return undefined

    let cancelled = false
    setStatus('loading')

    fetch(`/api/trends?keyword=${encodeURIComponent(keyword)}&date=${encodeURIComponent(time)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return
        if (json.error === 'TRENDS_NOT_CONFIGURED') {
          setStatus('unconfigured')
          setPoints([])
          return
        }
        if (json.error === 'TRENDS_UNAVAILABLE' || !json.points?.length) {
          setStatus('error')
          setPoints([])
          return
        }
        setPoints(json.points)
        setStatus('ok')
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
          setPoints([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [keyword, time, paused])

  function handleSubmit(e) {
    e.preventDefault()
    patch({ keyword: draft.trim() })
  }

  const trendsUrl = `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword || '')}&date=${encodeURIComponent(time)}`

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

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {!keyword && (
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
        )}

        {keyword && status === 'loading' && (
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

        {keyword && status === 'ok' && points.length > 0 && (
          <TrendsChart points={points} />
        )}

        {keyword && status === 'error' && (
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

        {keyword && status === 'unconfigured' && (
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

      {keyword && (
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

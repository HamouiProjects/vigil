import { useMemo } from 'react'
import '../shell/brief.css'

export const COLORS = [
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

// Shared Search Interest chart. Used by the Trends widget and the brief panel.
// Renders a Y axis (100 to 0), gridlines, and one color mapped polyline per keyword.
// chartRef forwards to the inner svg so the brief PDF path can rasterize it.
export function TrendsChart({ points, keywords, chartRef }) {
  const n = points.length
  const firstLabel = points[0]?.label ?? ''
  const lastLabel = points[n - 1]?.label ?? ''
  const hasDateLabels = Boolean(firstLabel || lastLabel)

  const polylines = useMemo(() => {
    return keywords.map((_, ki) => {
      const coords = []
      points.forEach((p, idx) => {
        const v = p.values?.[ki]
        if (v == null) return
        const x = n <= 1 ? CHART_W / 2 : (idx / (n - 1)) * CHART_W
        coords.push(`${x},${chartY(v)}`)
      })
      // Need at least two points to draw a line. Keeps polyline index aligned with the PDF stroke overrides.
      return coords.length >= 2 ? coords.join(' ') : ''
    })
  }, [points, keywords, n])

  const gridYs = useMemo(() => Y_LABELS.map(chartY), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {hasDateLabels && (
        <div
          style={{
            flexShrink: 0,
            padding: '6px 10px 2px',
            fontFamily: 'var(--font-sans)',
            fontSize: 9,
            color: 'var(--color-text-muted)',
          }}
        >
          {`${firstLabel} \u2192 ${lastLabel}`}
        </div>
      )}
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
              ref={chartRef}
              width={CHART_W}
              height={CHART_H}
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
                    stroke={COLORS[ki % COLORS.length]}
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
        {hasDateLabels && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              justifyContent: 'space-between',
              padding: `2px 0 4px ${Y_AXIS_W}px`,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--color-text-muted)',
            }}
          >
            <span>{firstLabel}</span>
            <span>{lastLabel}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Read only legend. A color swatch, the term, and its latest value per keyword.
// Mirrors the widget chip style (rss-filter-chip) without the edit controls.
export function TrendsLegend({ keywords, values, colors }) {
  const palette = colors ?? COLORS
  if (!keywords?.length) return null
  return (
    <div className="brief-trends-legend">
      {keywords.map((kw, i) => (
        <span
          key={kw}
          className="rss-filter-chip active"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'default' }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: palette[i % palette.length],
              flexShrink: 0,
            }}
          />
          <span className="rss-filter-chip-text">{kw}</span>
          {values?.[i] != null && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text-secondary)',
              }}
            >
              {values[i]}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

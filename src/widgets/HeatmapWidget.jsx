import { useState, useEffect, useRef } from 'react'

// Confirmed TradingView stock-heatmap field IDs.
const COLOR_OPTIONS = [
  { id: 'change',   label: '1D'  },
  { id: 'Perf.W',   label: '1W'  },
  { id: 'Perf.1M',  label: '1M'  },
  { id: 'Perf.3M',  label: '3M'  },
  { id: 'Perf.YTD', label: 'YTD' },
  { id: 'Perf.Y',   label: '1Y'  },
]
const GROUP_OPTIONS = [
  { id: 'sector',   label: 'Sector' },
  { id: 'no_group', label: 'Flat'   },
]
const DEFAULT_COLOR = 'change'
const DEFAULT_GROUP = 'sector'

const mono = 'var(--font-mono, "JetBrains Mono", monospace)'

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

function buildHeatmapUrl({ colorBy, group, theme }) {
  const cfg = {
    exchanges: [],
    dataSource: 'SPX500',
    grouping: group,
    blockSize: 'market_cap_basic',
    blockColor: colorBy,
    locale: 'en',
    symbolUrl: '',
    colorTheme: theme,
    hasTopBar: false,
    isDataSetEnabled: false,
    isZoomEnabled: true,
    hasSymbolTooltip: true,
    isMonoSize: false,
    width: '100%',
    height: '100%',
  }
  return `https://s.tradingview.com/embed-widget/stock-heatmap/?locale=en#${encodeURIComponent(JSON.stringify(cfg))}`
}

const labelStyle = {
  fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--color-text-muted)', flexShrink: 0,
}
function chipStyle(active) {
  return {
    fontFamily: mono, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
    padding: '2px 7px', borderRadius: 3, cursor: 'pointer', border: 'none',
    color: active ? 'var(--color-on-brand)' : 'var(--color-text-secondary)',
    background: active ? 'var(--color-brand)' : 'transparent',
  }
}

export default function HeatmapWidget({ paused, config, onSaveConfig, setTitle, setActions }) {
  const colorBy = config.colorBy ?? DEFAULT_COLOR
  const group = config.group ?? DEFAULT_GROUP

  // Theme-follow: track data-theme and re-mount the embed on change (same approach as AtlasWorldGlobe).
  const [theme, setTheme] = useState(currentTheme())
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Refresh: bump a nonce to force a clean re-mount of the iframe.
  const [nonce, setNonce] = useState(0)

  const configRef = useRef(config); configRef.current = config
  const onSaveRef = useRef(onSaveConfig); onSaveRef.current = onSaveConfig
  function setConfig(patch) { onSaveRef.current?.({ ...configRef.current, ...patch }) }

  useEffect(() => {
    const lbl = COLOR_OPTIONS.find(o => o.id === colorBy)?.label ?? '1D'
    setTitle?.(`Heatmap · S&P 500 · ${lbl}`)
  }, [setTitle, colorBy])

  useEffect(() => {
    setActions?.(
      <button className="widget-btn" type="button" onClick={() => setNonce(n => n + 1)} title="Refresh">↻</button>
    )
  }, [setActions])

  const url = buildHeatmapUrl({ colorBy, group, theme })

  return (
    <>
      <div
        className="tvchart-bar"
        onPointerDownCapture={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
      >
        <span style={labelStyle}>Color</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {COLOR_OPTIONS.map(o => (
            <button key={o.id} type="button" style={chipStyle(o.id === colorBy)} onClick={() => setConfig({ colorBy: o.id })}>{o.label}</button>
          ))}
        </div>
        <span style={labelStyle}>Group</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {GROUP_OPTIONS.map(o => (
            <button key={o.id} type="button" style={chipStyle(o.id === group)} onClick={() => setConfig({ group: o.id })}>{o.label}</button>
          ))}
        </div>
      </div>

      <iframe
        key={`${colorBy}|${group}|${theme}|${nonce}`}
        src={paused ? '' : url}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="Market Heatmap"
        allow="clipboard-write"
      />
    </>
  )
}

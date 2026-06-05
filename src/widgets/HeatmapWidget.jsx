import { useState, useEffect, useRef } from 'react'

// Verified TradingView heatmap presets (stock-heatmap + etf-heatmap + crypto-coins-heatmap).
const MARKETS = {
  sp500:  { label: 'S&P 500', widget: 'stock-heatmap',        dataSource: 'SPX500',   blockSize: 'market_cap_basic', groups: [{ id: 'sector', label: 'Sector' }, { id: 'no_group', label: 'Flat' }] },
  nasdaq: { label: 'Nasdaq',  widget: 'stock-heatmap',        dataSource: 'NASDAQ',   blockSize: 'market_cap_basic', groups: [{ id: 'sector', label: 'Sector' }, { id: 'no_group', label: 'Flat' }] },
  dow:    { label: 'Dow',     widget: 'stock-heatmap',        dataSource: 'DowJones', blockSize: 'market_cap_basic', groups: [{ id: 'sector', label: 'Sector' }, { id: 'no_group', label: 'Flat' }] },
  dax:    { label: 'DAX',     widget: 'stock-heatmap',        dataSource: 'DAX',      blockSize: 'market_cap_basic', groups: [{ id: 'sector', label: 'Sector' }, { id: 'no_group', label: 'Flat' }] },
  etf:    { label: 'ETFs',    widget: 'etf-heatmap',          dataSource: 'AllUSEtf', blockSize: 'volume',           groups: [{ id: 'asset_class', label: 'Asset class' }, { id: 'no_group', label: 'Flat' }] },
  crypto: { label: 'Crypto',  widget: 'crypto-coins-heatmap', dataSource: 'Crypto',   blockSize: 'market_cap_calc',  groups: [{ id: 'no_group', label: 'Flat' }] },
}
const MARKET_ORDER = ['sp500', 'nasdaq', 'dow', 'dax', 'etf', 'crypto']

const COLOR_OPTIONS = [
  { id: 'change',   label: '1D'  },
  { id: 'Perf.W',   label: '1W'  },
  { id: 'Perf.1M',  label: '1M'  },
  { id: 'Perf.3M',  label: '3M'  },
  { id: 'Perf.YTD', label: 'YTD' },
  { id: 'Perf.Y',   label: '1Y'  },
]
const DEFAULT_MARKET = 'sp500'
const DEFAULT_COLOR = 'change'

const mono = 'var(--font-mono, "JetBrains Mono", monospace)'

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

function buildUrl(m, colorBy, group, theme) {
  const cfg = {
    exchanges: [],
    dataSource: m.dataSource,
    grouping: group,
    blockSize: m.blockSize,
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
  return `https://s.tradingview.com/embed-widget/${m.widget}/?locale=en#${encodeURIComponent(JSON.stringify(cfg))}`
}

const labelStyle = {
  fontFamily: mono, fontSize: 10, fontWeight: 500, letterSpacing: '0.12em',
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
const selectStyle = {
  fontFamily: mono, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
  color: 'var(--color-text-primary)', background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)', cursor: 'pointer', flexShrink: 0,
}

export default function HeatmapWidget({ paused, config, onSaveConfig, setTitle, setActions }) {
  const marketKey = MARKETS[config.market] ? config.market : DEFAULT_MARKET
  const m = MARKETS[marketKey]
  const colorBy = COLOR_OPTIONS.some(o => o.id === config.colorBy) ? config.colorBy : DEFAULT_COLOR
  // Effective grouping: keep the saved value if valid for this market, else this market's first option.
  const group = m.groups.some(g => g.id === config.group) ? config.group : m.groups[0].id

  // Theme-follow: track data-theme and re-mount the embed on change (same approach as AtlasWorldGlobe).
  const [theme, setTheme] = useState(currentTheme())
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Refresh: bump a nonce to force a clean re-mount of the iframe.
  const [nonce, setNonce] = useState(0)

  // Loading shimmer: the embed reads its config from the URL only at mount, so every
  // market/color/group/theme/refresh change re-mounts the iframe and shows a grey skeleton for a few
  // seconds. Mask that with a clean "Updating…" overlay so the controls feel responsive, not frozen.
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (paused) { setLoading(false); return }
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 2800)
    return () => clearTimeout(t)
  }, [marketKey, colorBy, group, theme, nonce, paused])

  const configRef = useRef(config); configRef.current = config
  const onSaveRef = useRef(onSaveConfig); onSaveRef.current = onSaveConfig
  function setConfig(patch) { onSaveRef.current?.({ ...configRef.current, ...patch }) }

  useEffect(() => {
    const lbl = COLOR_OPTIONS.find(o => o.id === colorBy)?.label ?? '1D'
    setTitle?.(`Heatmap · ${m.label} · ${lbl}`)
  }, [setTitle, m.label, colorBy])

  useEffect(() => {
    setActions?.(
      <button className="widget-btn" type="button" onClick={() => setNonce(n => n + 1)} title="Refresh">↻</button>
    )
  }, [setActions])

  const url = buildUrl(m, colorBy, group, theme)

  return (
    <>
      <div
        className="tvchart-bar"
        onPointerDownCapture={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
      >
        <select value={marketKey} onChange={e => setConfig({ market: e.target.value })} style={selectStyle} aria-label="Market">
          {MARKET_ORDER.map(k => (<option key={k} value={k}>{MARKETS[k].label}</option>))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={labelStyle}>Color</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {COLOR_OPTIONS.map(o => (
              <button key={o.id} type="button" style={chipStyle(o.id === colorBy)} onClick={() => setConfig({ colorBy: o.id })}>{o.label}</button>
            ))}
          </div>
        </div>

        {m.groups.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={labelStyle}>Group</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {m.groups.map(g => (
                <button key={g.id} type="button" style={chipStyle(g.id === group)} onClick={() => setConfig({ group: g.id })}>{g.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
        <iframe
          key={`${marketKey}|${colorBy}|${group}|${theme}|${nonce}`}
          src={paused ? '' : url}
          style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
          title="Market Heatmap"
          allow="clipboard-write"
        />
        {!paused && loading && (
          <div
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-surface-1)', pointerEvents: 'none', zIndex: 2,
            }}
          >
            <span
              style={{
                fontFamily: mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--color-text-muted)',
                animation: 'vigilHeatmapPulse 1.1s ease-in-out infinite',
              }}
            >
              Updating…
            </span>
          </div>
        )}
        <style>{`@keyframes vigilHeatmapPulse { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }`}</style>
      </div>
    </>
  )
}

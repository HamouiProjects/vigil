import { useState, useEffect, useRef } from 'react'

const DEFAULT_SYMBOL = 'BINANCE:BTCUSDT'

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

// Pull the app background from the live semantic token so the chart pane matches the room in both
// themes (the TradingView iframe can't read CSS vars, so we read the computed value and pass a literal).
function bgHex(theme) {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim().replace('#', '')
  return v || (theme === 'light' ? 'E6E1D6' : '0a0c10')
}

function buildUrl(symbol, theme) {
  const bg = bgHex(theme)
  return `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_vigil&symbol=${encodeURIComponent(symbol)}&interval=D&theme=${theme}&style=1&locale=en&toolbar_bg=${bg}&bg_color=${bg}&enable_publishing=0&hide_side_toolbar=0&allow_symbol_change=1&save_image=0`
}

export default function ChartWidget({ id, paused, config, onSaveConfig, setTitle, setActions }) {
  const symbol = config.symbol ?? DEFAULT_SYMBOL
  const [inputSymbol, setInputSymbol] = useState(symbol)
  const displayTicker = symbol.includes(':') ? symbol.split(':')[1] : symbol

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

  useEffect(() => {
    setInputSymbol(symbol)
  }, [symbol, id])

  // Theme-follow: track data-theme and re-mount the embed on change (same approach as the Heatmap/Atlas).
  const [theme, setTheme] = useState(currentTheme())
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Refresh: bump a nonce to force a clean re-mount of the iframe.
  const [nonce, setNonce] = useState(0)

  // Reactive host-bar title (the loaded symbol), mirroring the Heatmap's "Heatmap · <market> · <tf>".
  useEffect(() => {
    setTitle?.(`Chart · ${displayTicker}`)
  }, [setTitle, displayTicker])

  // Refresh ↻ in the host header (a setActions ghost icon button — the Heatmap pattern).
  useEffect(() => {
    setActions?.(
      <button className="widget-btn" type="button" onClick={() => setNonce(n => n + 1)} title="Refresh">↻</button>
    )
  }, [setActions])

  function go(raw) {
    const sym = raw.trim().toUpperCase()
    if (!sym) return
    setInputSymbol(sym)
    onSaveConfigRef.current({ ...configRef.current, symbol: sym })
  }

  const tvUrl = buildUrl(symbol, theme)

  return (
    <>
      <form
        className="tvchart-bar"
        onPointerDownCapture={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); go(inputSymbol) }}
      >
        <input
          className="rss-input tvchart-input"
          value={inputSymbol}
          onChange={e => setInputSymbol(e.target.value)}
          placeholder="Symbol (e.g. BTCUSDT, AAPL, EURUSD)"
          spellCheck={false}
        />
        <button className="rss-go-btn" type="submit">GO</button>
      </form>

      <iframe
        key={`${symbol}|${theme}|${nonce}`}
        src={paused ? '' : tvUrl}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="TradingView Chart"
        allow="clipboard-write"
      />
    </>
  )
}

import { useState, useEffect } from 'react'

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

export default function ChartWidget({ paused, config, setTitle, setActions }) {
  // Boot symbol only (a previously saved config.symbol still opens here). The symbol is changed live
  // inside TradingView's own toolbar — its in-iframe changes can't be read back cross-origin.
  const symbol = config.symbol ?? DEFAULT_SYMBOL

  // Theme-follow: re-mount the embed when data-theme changes (the Heatmap/Atlas pattern).
  const [theme, setTheme] = useState(currentTheme())
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Refresh: bump a nonce to force a clean re-mount of the iframe.
  const [nonce, setNonce] = useState(0)

  useEffect(() => { setTitle?.('Chart') }, [setTitle])

  useEffect(() => {
    setActions?.(
      <button className="widget-btn" type="button" onClick={() => setNonce(n => n + 1)} title="Refresh">↻</button>
    )
  }, [setActions])

  const tvUrl = buildUrl(symbol, theme)

  return (
    <iframe
      key={`${symbol}|${theme}|${nonce}`}
      src={paused ? '' : tvUrl}
      style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
      title="TradingView Chart"
      allow="clipboard-write"
    />
  )
}

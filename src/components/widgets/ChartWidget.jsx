import { useState } from 'react'
import WHeader from '../shared/WHeader'

const TV_DEFAULT_SYMBOL = 'BINANCE:BTCUSDT'

export default function ChartWidget({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed }) {
  const storageKey = `vigil_tvchart_symbol_${widgetId ?? 'default'}`
  const [activeSymbol, setActiveSymbol] = useState(() => {
    try { return localStorage.getItem(storageKey) || TV_DEFAULT_SYMBOL } catch { return TV_DEFAULT_SYMBOL }
  })
  const [inputSymbol, setInputSymbol] = useState(activeSymbol)

  function go(raw) {
    const sym = raw.trim().toUpperCase()
    if (!sym) return
    setActiveSymbol(sym)
    setInputSymbol(sym)
    try { localStorage.setItem(storageKey, sym) } catch {}
  }

  const displayTicker = activeSymbol.includes(':') ? activeSymbol.split(':')[1] : activeSymbol
  const tvUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_vigil&symbol=${encodeURIComponent(activeSymbol)}&interval=D&theme=dark&style=1&locale=en&toolbar_bg=0a0c10&bg_color=0a0c10&enable_publishing=0&hide_side_toolbar=0&allow_symbol_change=1&save_image=0`

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title={<>CHART<span className="chart-tv-credit">powered by TradingView</span></>} onCollapse={onCollapse} collapsed={collapsed} onClose={onClose} onFullscreen={onFullscreen} isFullscreen={isFullscreen} />
      <form
        className="tvchart-bar"
        onSubmit={e => { e.preventDefault(); go(inputSymbol) }}
        onPointerDownCapture={e => e.stopPropagation()}
      >
        <span className="tvchart-symbol-dot">●</span>
        <span className="tvchart-symbol-label">{displayTicker}</span>
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
        key={activeSymbol}
        src={tvUrl}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="TradingView Chart"
        allow="clipboard-write"
      />
    </div>
  )
}

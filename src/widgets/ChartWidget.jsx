import { useState, useEffect, useRef } from 'react'

const DEFAULT_SYMBOL = 'BINANCE:BTCUSDT'

export default function ChartWidget({ id, paused, config, onSaveConfig }) {
  const symbol = config.symbol ?? DEFAULT_SYMBOL
  const [inputSymbol, setInputSymbol] = useState(symbol)

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig

  useEffect(() => {
    setInputSymbol(symbol)
  }, [symbol, id])

  const tvUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_vigil&symbol=${encodeURIComponent(symbol)}&interval=D&theme=dark&style=1&locale=en&toolbar_bg=0a0c10&bg_color=0a0c10&enable_publishing=0&hide_side_toolbar=0&allow_symbol_change=1&save_image=0`
  const displayTicker = symbol.includes(':') ? symbol.split(':')[1] : symbol

  function go(raw) {
    const sym = raw.trim().toUpperCase()
    if (!sym) return
    setInputSymbol(sym)
    onSaveConfigRef.current({ ...configRef.current, symbol: sym })
  }

  return (
    <div className="widget" data-widget-id={id}>
      <div className="widget-header widget-drag-handle" style={{ cursor: 'default' }}>
        <div className="widget-title-group">
          <span className="widget-title">CHART</span>
        </div>
        {paused && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            PAUSED
          </span>
        )}
      </div>

      <form
        className="tvchart-bar"
        onPointerDownCapture={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); go(inputSymbol) }}
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
        key={symbol}
        src={paused ? '' : tvUrl}
        style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
        title="TradingView Chart"
        allow="clipboard-write"
      />

      <div className="attr-line">powered by TradingView</div>
    </div>
  )
}

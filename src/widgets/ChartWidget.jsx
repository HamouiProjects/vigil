import { useState, useEffect, useRef } from 'react'

const DEFAULT_SYMBOL = 'BINANCE:BTCUSDT'

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

// Read the app background from the live token so the chart pane matches the room in both themes.
function bgHex(theme) {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim().replace('#', '')
  return v || (theme === 'light' ? 'E6E1D6' : '0a0c10')
}

function buildUrl(symbol, theme) {
  const bg = bgHex(theme)
  return `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_vigil&symbol=${encodeURIComponent(symbol)}&interval=D&theme=${theme}&style=1&locale=en&toolbar_bg=${bg}&bg_color=${bg}&enable_publishing=0&hide_side_toolbar=0&allow_symbol_change=1&save_image=0`
}

// Title shows just the ticker (strip TradingView's exchange prefix, e.g. "BATS_DLY:NVDA" -> "NVDA").
function shortSym(s) { return String(s || '').split(':').pop() || String(s || '') }

export default function ChartWidget({ paused, config, onSaveConfig, setTitle, setActions }) {
  const bootSymbol = config.symbol ?? DEFAULT_SYMBOL

  const configRef = useRef(config); configRef.current = config
  const onSaveRef = useRef(onSaveConfig); onSaveRef.current = onSaveConfig
  const symRef = useRef(bootSymbol)    // latest symbol shown in TV (no re-render)
  const savedRef = useRef(bootSymbol)  // last value we persisted (dedupe)

  // What the iframe is mounted with. Changes ONLY on theme change or refresh — never on symbol
  // capture — so picking a symbol inside TradingView's UI does not reload the chart.
  const [mount, setMount] = useState({ symbol: bootSymbol, theme: currentTheme(), nonce: 0 })
  const [liveSym, setLiveSym] = useState(bootSymbol) // drives the reactive title

  // Theme-follow: on data-theme change, re-mount with the CURRENT symbol + the new theme.
  useEffect(() => {
    const obs = new MutationObserver(() => {
      const t = currentTheme()
      setMount(m => (m.theme === t ? m : { symbol: symRef.current, theme: t, nonce: m.nonce }))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Persist the symbol the user picks inside TradingView's own search. The embed posts JSON-string
  // "quoteUpdate" messages whose data.original_name is the active symbol; capture it and save to
  // config.symbol when it changes so the chart reopens on the same symbol after a reload.
  useEffect(() => {
    function onMsg(e) {
      if (!String(e.origin).includes('tradingview') || typeof e.data !== 'string') return
      let m; try { m = JSON.parse(e.data) } catch { return }
      const sym = m && m.name === 'quoteUpdate' && m.data && m.data.original_name
      if (typeof sym === 'string' && sym && sym !== symRef.current) {
        symRef.current = sym
        setLiveSym(sym)
        if (sym !== savedRef.current) {
          savedRef.current = sym
          onSaveRef.current?.({ ...configRef.current, symbol: sym })
        }
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => { setTitle?.('Chart · ' + shortSym(liveSym)) }, [setTitle, liveSym])

  useEffect(() => {
    setActions?.(
      <button className="widget-btn" type="button" title="Refresh"
        onClick={() => setMount(m => ({ symbol: symRef.current, theme: m.theme, nonce: m.nonce + 1 }))}>↻</button>
    )
  }, [setActions])

  const url = buildUrl(mount.symbol, mount.theme)

  return (
    <iframe
      key={`${mount.symbol}|${mount.theme}|${mount.nonce}`}
      src={paused ? '' : url}
      style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
      title="TradingView Chart"
      allow="clipboard-write"
    />
  )
}

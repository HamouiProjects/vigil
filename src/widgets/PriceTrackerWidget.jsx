import { useState, useEffect, useRef } from 'react'

const DEFAULT_SYMBOLS = [
  { tvSymbol: 'NASDAQ:AAPL', display: 'AAPL', description: 'Apple' },
  { tvSymbol: 'NASDAQ:MSFT', display: 'MSFT', description: 'Microsoft' },
  { tvSymbol: 'NASDAQ:NVDA', display: 'NVDA', description: 'NVIDIA' },
  { tvSymbol: 'BINANCE:BTCUSDT', display: 'BTCUSDT', description: 'Bitcoin' },
  { tvSymbol: 'FX:EURUSD', display: 'EURUSD', description: 'Euro / US Dollar' },
  { tvSymbol: 'XETR:DAX', display: 'DAX', description: 'DAX Index' },
]

const mono = 'var(--font-mono, "JetBrains Mono", monospace)'

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

function normalizeSymbols(raw) {
  if (raw == null) return DEFAULT_SYMBOLS
  if (!Array.isArray(raw)) return []
  if (raw.length && typeof raw[0] !== 'object') return DEFAULT_SYMBOLS
  return raw.filter(s => s && s.tvSymbol)
}

function buildUrl(symbols, theme) {
  const cfg = {
    width: '100%',
    height: '100%',
    symbolsGroups: [
      {
        name: 'Watchlist',
        symbols: symbols.map(s => ({ name: s.tvSymbol, displayName: s.display })),
      },
    ],
    showSymbolLogo: false,
    isTransparent: true,
    colorTheme: theme,
    locale: 'en',
  }
  return `https://s.tradingview.com/embed-widget/market-quotes/?locale=en#${encodeURIComponent(JSON.stringify(cfg))}`
}

export default function PriceTrackerWidget({ id, paused, config, onSaveConfig, setTitle, setActions }) {
  const symbols = normalizeSymbols(config.symbols)
  const sidebarOpen = config.sidebarOpen ?? true

  const configRef = useRef(config)
  configRef.current = config
  const onSaveRef = useRef(onSaveConfig)
  onSaveRef.current = onSaveConfig

  function patch(p) {
    onSaveRef.current?.({ ...configRef.current, ...p })
  }

  useEffect(() => {
    const raw = configRef.current.symbols
    if (raw == null) {
      onSaveRef.current?.({ ...configRef.current, symbols: DEFAULT_SYMBOLS })
    } else if (Array.isArray(raw) && raw.length && typeof raw[0] !== 'object') {
      onSaveRef.current?.({ ...configRef.current, symbols: DEFAULT_SYMBOLS })
    }
  }, [])

  const [theme, setTheme] = useState(currentTheme())
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(currentTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const [nonce, setNonce] = useState(0)
  const symbolsKey = symbols.map(s => s.tvSymbol).join(',')

  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (paused || !symbols.length) {
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(() => setLoading(false), 2800)
    return () => clearTimeout(t)
  }, [symbolsKey, theme, nonce, paused, symbols.length])

  useEffect(() => {
    setTitle?.(`Prices · ${symbols.length}`)
  }, [setTitle, symbols.length])

  useEffect(() => {
    setActions?.(
      <button className="widget-btn" type="button" onClick={() => setNonce(n => n + 1)} title="Refresh">↻</button>
    )
  }, [setActions])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchTimerRef = useRef(null)
  const searchAbortRef = useRef(null)

  useEffect(() => {
    clearTimeout(searchTimerRef.current)
    searchAbortRef.current?.abort()

    const q = query.trim()
    if (q.length < 1) {
      setResults([])
      setSearching(false)
      setSearchError('')
      return
    }

    setSearching(true)
    setSearchError('')
    searchTimerRef.current = setTimeout(async () => {
      const ac = new AbortController()
      searchAbortRef.current = ac
      try {
        const r = await fetch(`/api/symbol-search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        const data = await r.json()
        if (data.error) {
          setResults([])
          setSearchError(data.error)
        } else {
          setResults(Array.isArray(data.results) ? data.results : [])
          setSearchError('')
        }
      } catch (e) {
        if (e.name === 'AbortError') return
        setResults([])
        setSearchError('Search unavailable')
      } finally {
        setSearching(false)
      }
    }, 250)

    return () => {
      clearTimeout(searchTimerRef.current)
      searchAbortRef.current?.abort()
    }
  }, [query])

  function addSymbol(item) {
    const entry = { tvSymbol: item.tvSymbol, display: item.display, description: item.description }
    const current = normalizeSymbols(configRef.current.symbols)
    if (current.some(s => s.tvSymbol === entry.tvSymbol)) return
    patch({ symbols: [...current, entry] })
    setQuery('')
    setResults([])
    setSearchError('')
  }

  function removeSymbol(tvSymbol) {
    const current = normalizeSymbols(configRef.current.symbols)
    patch({ symbols: current.filter(s => s.tvSymbol !== tvSymbol) })
  }

  const tvUrl = buildUrl(symbols, theme)
  const existingTv = new Set(symbols.map(s => s.tvSymbol))
  const showSearchMsg = query.trim().length >= 1

  return (
    <div className="rss-body" style={{ flex: 1, minHeight: 0 }}>
      <div className="rss-right" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {symbols.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              fontFamily: mono,
              fontSize: 11,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
            }}
          >
            No instruments yet — search on the right to add one.
          </div>
        ) : (
          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
            <iframe
              key={`${theme}|${nonce}|${symbolsKey}`}
              src={paused ? '' : tvUrl}
              style={{ flex: 1, width: '100%', minHeight: 0, border: 'none', display: 'block' }}
              title="Market Quotes"
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
                    animation: 'vigilPricesPulse 1.1s ease-in-out infinite',
                  }}
                >
                  Updating…
                </span>
              </div>
            )}
            <style>{`@keyframes vigilPricesPulse { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }`}</style>
          </div>
        )}
      </div>

      {sidebarOpen ? (
        <div
          className="rss-sidebar"
          onPointerDownCapture={e => e.stopPropagation()}
          style={{ borderRight: 'none', borderLeft: '1px solid var(--color-border)' }}
        >
          <div className="ns-sidebar-header">
            <span className="ns-sidebar-title">INSTRUMENTS</span>
            <button
              type="button"
              className="ns-sidebar-toggle"
              onClick={() => patch({ sidebarOpen: false })}
              title="Collapse"
            >
              ›
            </button>
          </div>

          <div style={{ flexShrink: 0, padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
            <input
              className="rss-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Add symbol — e.g. Apple, BTC, DAX"
              spellCheck={false}
              onPointerDownCapture={e => e.stopPropagation()}
            />
            {showSearchMsg && (
              <div
                style={{
                  marginTop: 4,
                  border: '1px solid var(--color-border)',
                  borderRadius: 3,
                  maxHeight: 180,
                  overflowY: 'auto',
                  background: 'var(--color-surface-2)',
                }}
              >
                {searching && !results.length && !searchError && (
                  <div style={{ padding: '8px 10px', fontSize: 10, fontFamily: mono, color: 'var(--color-text-muted)' }}>
                    Searching…
                  </div>
                )}
                {searchError && (
                  <div style={{ padding: '8px 10px', fontSize: 10, fontFamily: mono, color: 'var(--color-text-muted)' }}>
                    Search unavailable
                  </div>
                )}
                {!searching && !searchError && results.length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: 10, fontFamily: mono, color: 'var(--color-text-muted)' }}>
                    No matches
                  </div>
                )}
                {results.map(item => {
                  const added = existingTv.has(item.tvSymbol)
                  const tag = item.exchange || item.type || ''
                  return (
                    <button
                      key={item.tvSymbol}
                      type="button"
                      disabled={added}
                      onClick={() => addSymbol(item)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 10px',
                        border: 'none',
                        borderBottom: '1px solid var(--color-border)',
                        background: 'none',
                        cursor: added ? 'default' : 'pointer',
                        opacity: added ? 0.4 : 1,
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 52, flexShrink: 0 }}>
                        {item.display}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.description}
                      </span>
                      {tag && (
                        <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                          {tag}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rss-source-list">
            {symbols.map(s => (
              <div key={s.tvSymbol} className="rss-source-item">
                <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', minWidth: 52, flexShrink: 0 }}>
                  {s.display}
                </span>
                <span className="rss-source-name" style={{ color: 'var(--color-text-secondary)' }} dir="auto">
                  {s.description}
                </span>
                <button
                  type="button"
                  className="rss-source-del"
                  onClick={e => { e.stopPropagation(); removeSymbol(s.tvSymbol) }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="rss-slim-strip"
          onClick={() => patch({ sidebarOpen: true })}
          title="Expand instruments"
          style={{ borderRight: 'none', borderLeft: '1px solid var(--color-border)' }}
        >
          <span className="rss-slim-chevron">‹</span>
        </div>
      )}
    </div>
  )
}

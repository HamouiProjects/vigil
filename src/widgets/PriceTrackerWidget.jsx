import { useState, useEffect, useCallback, useRef } from 'react'
import { usePolling } from '../hooks/usePolling'
import { SkeletonLine } from '../components/shared/SkeletonLoader'

const DEFAULT_SYMBOLS = ['BTC-USD', 'ETH-USD', '^GSPC', 'GC=F', 'AAPL']
const mono = 'var(--font-mono, JetBrains Mono, monospace)'

const ptEdit = {
  panel: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--surface)',
  },
  searchWrap: {
    flexShrink: 0,
    position: 'relative',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
  },
  input: {
    width: '100%',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text-primary)',
    fontFamily: mono,
    fontSize: 10,
    padding: '5px 8px',
    outline: 'none',
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% - 2px)',
    left: 8,
    right: 8,
    zIndex: 200,
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    maxHeight: 220,
    overflowY: 'auto',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  },
  dropItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 10px',
    border: 'none',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: 10,
    cursor: 'pointer',
    textAlign: 'left',
    borderBottom: '1px solid var(--border)',
  },
  dropSym: {
    fontFamily: mono,
    fontWeight: 700,
    color: 'var(--accent)',
    minWidth: 52,
    flexShrink: 0,
    fontSize: 10,
  },
  dropName: {
    flex: 1,
    minWidth: 0,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dropExchange: {
    fontFamily: mono,
    fontSize: 9,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  dropMsg: {
    padding: '8px 10px',
    color: 'var(--text-muted)',
    fontSize: 10,
    fontFamily: mono,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
  },
  rowSym: {
    fontFamily: mono,
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-primary)',
    minWidth: 64,
    flexShrink: 0,
  },
  rowActions: {
    display: 'flex',
    gap: 2,
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
  },
  delBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: 11,
    width: 20,
    height: 20,
    padding: 0,
    borderRadius: 3,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}

function formatPrice(price) {
  if (price == null) return '—'
  const n = Number(price)
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) < 0.01) return n.toFixed(6)
  if (Math.abs(n) < 1) return n.toFixed(4)
  if (Math.abs(n) < 100) return n.toFixed(2)
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatChangePct(pct) {
  if (pct == null) return '—'
  const n = Number(pct)
  if (!Number.isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function SymbolSearch({ existingSyms, onAdd }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    clearTimeout(timerRef.current)
    abortRef.current?.abort()

    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setBusy(false)
      setFailed(false)
      return
    }

    setBusy(true)
    setFailed(false)
    timerRef.current = setTimeout(async () => {
      const ac = new AbortController()
      abortRef.current = ac
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        if (!r.ok) throw new Error('search failed')
        const data = await r.json()
        if (!Array.isArray(data.results)) throw new Error('bad response')
        setResults(data.results)
        setFailed(false)
      } catch (e) {
        if (e.name === 'AbortError') return
        setResults([])
        setFailed(true)
      } finally {
        setBusy(false)
      }
    }, 300)

    return () => {
      clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [query])

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  function pick(item) {
    const sym = item.symbol.toUpperCase()
    if (existingSyms.includes(sym)) return
    onAdd(sym)
    setQuery('')
    setResults([])
    setFailed(false)
    setOpen(false)
  }

  const showDropdown = open && query.trim().length >= 2

  return (
    <div style={ptEdit.searchWrap} ref={wrapRef}>
      <input
        style={ptEdit.input}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search symbols…"
        spellCheck={false}
      />
      {showDropdown && (
        <div style={ptEdit.dropdown}>
          {busy && !results.length && !failed && (
            <div style={ptEdit.dropMsg}>Searching…</div>
          )}
          {failed && (
            <div style={ptEdit.dropMsg}>Search unavailable</div>
          )}
          {!busy && !failed && results.length === 0 && (
            <div style={ptEdit.dropMsg}>No matches</div>
          )}
          {results.map(item => {
            const added = existingSyms.includes(item.symbol.toUpperCase())
            return (
              <button
                key={item.symbol}
                type="button"
                style={{ ...ptEdit.dropItem, opacity: added ? 0.4 : 1, cursor: added ? 'default' : 'pointer' }}
                onClick={() => pick(item)}
                disabled={added}
              >
                <span style={ptEdit.dropSym}>{item.symbol}</span>
                <span style={ptEdit.dropName}>{item.name}</span>
                <span style={ptEdit.dropExchange}>{item.exchange}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PriceTrackerWidget({ id, paused, config, onSaveConfig }) {
  const symbols = config.symbols ?? []
  const [editMode, setEditMode] = useState(false)
  const [quotesBySymbol, setQuotesBySymbol] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const configRef = useRef(config)
  configRef.current = config
  const onSaveConfigRef = useRef(onSaveConfig)
  onSaveConfigRef.current = onSaveConfig
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const symbolsChangeMountedRef = useRef(false)

  useEffect(() => {
    if (configRef.current.symbols == null) {
      onSaveConfigRef.current({ ...configRef.current, symbols: DEFAULT_SYMBOLS })
    }
  }, [])

  const fetchQuotes = useCallback(async () => {
    if (pausedRef.current) return
    const syms = configRef.current.symbols ?? []
    if (!syms.length) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const csv = syms.join(',')
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(csv)}`, {
        signal: AbortSignal.timeout(8000),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
      const map = {}
      for (const q of json.quotes ?? []) map[q.symbol] = q
      setQuotesBySymbol(map)
    } catch (e) {
      setError(e.message || 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [])

  usePolling(fetchQuotes, 60_000, { isLive: !paused })

  const symbolsKey = symbols.join(',')
  useEffect(() => {
    if (!symbolsChangeMountedRef.current) {
      symbolsChangeMountedRef.current = true
      return
    }
    if (!paused) fetchQuotes()
  }, [symbolsKey, paused, fetchQuotes])

  function saveSymbols(next) {
    onSaveConfigRef.current({ ...configRef.current, symbols: next })
  }

  function handleAddSymbol(sym) {
    const s = sym.trim().toUpperCase()
    if (!s) return
    const current = configRef.current.symbols ?? []
    if (current.includes(s)) return
    saveSymbols([...current, s])
  }

  function handleRemoveSymbol(sym) {
    const current = configRef.current.symbols ?? []
    if (current.length <= 1) return
    saveSymbols(current.filter(x => x !== sym))
  }

  function moveSymbol(from, to) {
    const current = configRef.current.symbols ?? []
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return
    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    saveSymbols(next)
  }

  const hasData = symbols.length > 0 && Object.keys(quotesBySymbol).length > 0
  const isInitialLoad = loading && !hasData && !error && symbols.length > 0

  return (
    <div className="widget" data-widget-id={id}>
      <div className="widget-header widget-drag-handle" style={{ cursor: 'default' }}>
        <div className="widget-title-group">
          <span className="widget-title">PRICES</span>
        </div>
        {paused && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            PAUSED
          </span>
        )}
        <button
          type="button"
          className="widget-btn"
          onClick={() => setEditMode(v => !v)}
          title={editMode ? 'Done editing' : 'Edit watchlist'}
        >
          {editMode ? '✓' : '⚙'}
        </button>
      </div>

      <div className="widget-body" style={{ flexDirection: 'column', alignItems: 'stretch', padding: 0 }}>
        {editMode ? (
          <div style={ptEdit.panel} onPointerDownCapture={e => e.stopPropagation()}>
            <SymbolSearch
              existingSyms={(config.symbols ?? []).map(s => s.toUpperCase())}
              onAdd={handleAddSymbol}
            />
            <div style={ptEdit.list}>
              {(config.symbols ?? []).map((sym, i, arr) => (
                <div key={sym} style={ptEdit.row}>
                  <span style={ptEdit.rowSym}>{sym}</span>
                  <div style={ptEdit.rowActions}>
                    <button
                      type="button"
                      className="widget-btn"
                      disabled={i === 0}
                      onClick={() => moveSymbol(i, i - 1)}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="widget-btn"
                      disabled={i === arr.length - 1}
                      onClick={() => moveSymbol(i, i + 1)}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      style={{ ...ptEdit.delBtn, opacity: arr.length <= 1 ? 0.3 : 1 }}
                      onClick={() => handleRemoveSymbol(sym)}
                      title="Remove"
                      disabled={arr.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : symbols.length === 0 ? (
          <div
            className="empty-state"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            Add symbols with ⚙
          </div>
        ) : error ? (
          <div className="widget-error">
            <span className="widget-error-icon">⚠</span>
            {error}
            <button
              type="button"
              className="widget-error-retry"
              onClick={() => { setError(null); fetchQuotes() }}
            >
              Retry
            </button>
          </div>
        ) : isInitialLoad ? (
          <div className="skel-block" style={{ width: '100%', padding: '8px 10px' }}>
            {symbols.map(sym => (
              <div key={sym} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <SkeletonLine w="64px" h={12} />
                <SkeletonLine w="40%" h={12} />
                <SkeletonLine w="56px" h={12} />
                <SkeletonLine w="48px" h={12} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {symbols.map(sym => {
              const q = quotesBySymbol[sym]
              const pct = q?.change_pct
              const pctColor = pct == null
                ? 'var(--text-muted)'
                : (pct >= 0 ? 'var(--green, #00C96B)' : 'var(--red, #F85149)')
              return (
                <div
                  key={sym}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--border)',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--accent)',
                      minWidth: 64,
                      flexShrink: 0,
                    }}
                  >
                    {sym}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      color: 'var(--text-secondary)',
                      fontSize: 10,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {q?.name ?? '—'}
                  </span>
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      textAlign: 'right',
                      minWidth: 72,
                      flexShrink: 0,
                    }}
                  >
                    {formatPrice(q?.price)}
                  </span>
                  <span
                    style={{
                      fontFamily: mono,
                      fontSize: 10,
                      textAlign: 'right',
                      minWidth: 56,
                      flexShrink: 0,
                      color: pctColor,
                    }}
                  >
                    {formatChangePct(pct)}
                  </span>
                  {q?.stale && (
                    <span
                      title="Data may be delayed"
                      style={{ fontSize: 9, color: 'var(--amber, #D29922)', flexShrink: 0 }}
                    >
                      ⚠
                    </span>
                  )}
                </div>
              )
            })}
            <div className="attr-line">via Yahoo Finance</div>
          </div>
        )}
      </div>
    </div>
  )
}

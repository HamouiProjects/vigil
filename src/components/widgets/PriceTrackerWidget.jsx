import { useState, useEffect, useRef, useCallback } from 'react'
import WHeader from '../shared/WHeader'

const TV_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js'

const DEFAULT_SYMBOLS = [
  { sym: 'BINANCE:BTCUSDT', label: 'BTC' },
  { sym: 'BINANCE:ETHUSDT', label: 'ETH' },
  { sym: 'BINANCE:SOLUSDT', label: 'SOL' },
  { sym: 'TVC:GOLD',        label: 'Gold' },
  { sym: 'SP:SPX',          label: 'S&P 500' },
]

function loadSymbols(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    if (!Array.isArray(saved) || !saved.length) return DEFAULT_SYMBOLS
    const seen = new Set()
    const valid = saved
      .filter(s => typeof s.sym === 'string' && s.sym.trim() && typeof s.label === 'string')
      .map(s => ({ sym: s.sym.trim().toUpperCase(), label: s.label.trim() }))
      .filter(s => { if (seen.has(s.sym)) return false; seen.add(s.sym); return true })
    return valid.length ? valid : DEFAULT_SYMBOLS
  } catch {
    return DEFAULT_SYMBOLS
  }
}

function buildTvConfig(symbols) {
  return {
    colorTheme: 'dark',
    dateRange: '1D',
    showChart: false,
    locale: 'en',
    width: '100%',
    height: '100%',
    isTransparent: true,
    tabs: [{
      title: 'Watchlist',
      symbols: symbols.map(({ sym, label }) => ({ s: sym, d: label })),
    }],
  }
}

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
  dropName: {
    fontFamily: mono,
    fontWeight: 700,
    color: 'var(--accent)',
    minWidth: 52,
    flexShrink: 0,
    fontSize: 10,
  },
  dropDesc: {
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
  row: (dragging, dragOver) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    background: dragOver ? 'var(--surface-hover)' : 'var(--surface)',
    opacity: dragging ? 0.45 : 1,
    cursor: 'grab',
    flexShrink: 0,
  }),
  rowLabel: {
    fontFamily: mono,
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-primary)',
    minWidth: 48,
    flexShrink: 0,
  },
  rowSym: {
    flex: 1,
    minWidth: 0,
    fontFamily: mono,
    fontSize: 10,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowActions: {
    display: 'flex',
    gap: 2,
    alignItems: 'center',
    flexShrink: 0,
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

function SymbolSearch({ existingSyms, onAdd }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy]       = useState(false)
  const [failed, setFailed]   = useState(false)
  const [open, setOpen]       = useState(false)
  const timerRef  = useRef(null)
  const abortRef  = useRef(null)
  const wrapRef   = useRef(null)

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
        const r = await fetch(`/api/tvsearch?text=${encodeURIComponent(q)}`, { signal: ac.signal })
        if (!r.ok) throw new Error('search failed')
        const data = await r.json()
        if (!Array.isArray(data)) throw new Error('bad response')
        setResults(data)
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
    if (existingSyms.includes(item.sym.toUpperCase())) return
    onAdd(item.sym, item.name)
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
            const added = existingSyms.includes(item.sym.toUpperCase())
            return (
              <button
                key={item.sym}
                type="button"
                style={{ ...ptEdit.dropItem, opacity: added ? 0.4 : 1, cursor: added ? 'default' : 'pointer' }}
                onClick={() => pick(item)}
                disabled={added}
              >
                <span style={ptEdit.dropName}>{item.name}</span>
                <span style={ptEdit.dropDesc}>{item.description}</span>
                <span style={ptEdit.dropExchange}>{item.exchange}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SymbolRow({ item, index, total, onRemove, onMoveUp, onMoveDown, dragHandlers, isDragging, isDragOver }) {
  return (
    <div style={ptEdit.row(isDragging, isDragOver)} draggable {...dragHandlers}>
      <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0, userSelect: 'none' }}>⠿</span>
      <span style={ptEdit.rowLabel}>{item.label}</span>
      <span style={ptEdit.rowSym}>{item.sym}</span>
      <div style={ptEdit.rowActions} onPointerDownCapture={e => e.stopPropagation()}>
        <button type="button" className="widget-btn" disabled={index === 0} onClick={() => onMoveUp(index)} title="Move up">↑</button>
        <button type="button" className="widget-btn" disabled={index === total - 1} onClick={() => onMoveDown(index)} title="Move down">↓</button>
        <button
          type="button"
          style={{ ...ptEdit.delBtn, opacity: total <= 1 ? 0.3 : 1 }}
          onClick={() => onRemove(item.sym)}
          title="Remove"
          disabled={total <= 1}
        >✕</button>
      </div>
    </div>
  )
}

function EditPanel({ symbols, onAdd, onRemove, onMoveUp, onMoveDown, dragIdx, dragOverIdx, makeDragHandlers }) {
  const existingSyms = symbols.map(s => s.sym.toUpperCase())

  return (
    <div style={ptEdit.panel} onPointerDownCapture={e => e.stopPropagation()}>
      <SymbolSearch existingSyms={existingSyms} onAdd={onAdd} />

      <div style={ptEdit.list}>
        {symbols.map((item, i) => (
          <SymbolRow
            key={item.sym}
            item={item}
            index={i}
            total={symbols.length}
            onRemove={onRemove}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            dragHandlers={makeDragHandlers(i)}
            isDragging={dragIdx === i}
            isDragOver={dragOverIdx === i}
          />
        ))}
      </div>
    </div>
  )
}

export default function PriceTracker({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const symbolsKey = `vigil_prices_tvsymbols_${widgetId ?? 'default'}`

  const [symbols, setSymbols] = useState(() => loadSymbols(symbolsKey))
  const [editMode, setEditMode]   = useState(false)
  const [isLive, setIsLive]       = useState(true)
  const [dragIdx, setDragIdx]     = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const embedRef    = useRef(null)
  const injectGenRef = useRef(0)

  const effectiveLive = isLive && !workspacePaused

  const persist = useCallback((list) => {
    setSymbols(list)
    try { localStorage.setItem(symbolsKey, JSON.stringify(list)) } catch {}
  }, [symbolsKey])

  useEffect(() => {
    if (editMode || !effectiveLive) return

    const mount = embedRef.current
    if (!mount) return

    const gen = ++injectGenRef.current
    mount.replaceChildren()

    const wrapper = document.createElement('div')
    wrapper.className = 'tradingview-widget-container'
    wrapper.style.cssText = 'width:100%;height:100%;'

    const widgetSlot = document.createElement('div')
    widgetSlot.className = 'tradingview-widget-container__widget'
    widgetSlot.style.cssText = 'width:100%;height:100%;'

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = TV_SCRIPT
    script.async = true
    script.textContent = JSON.stringify(buildTvConfig(symbols))

    wrapper.appendChild(widgetSlot)
    wrapper.appendChild(script)
    mount.appendChild(wrapper)

    return () => {
      if (injectGenRef.current === gen && mount) mount.replaceChildren()
    }
  }, [symbols, editMode, effectiveLive])

  function handleAdd(sym, label) {
    const s = sym.trim().toUpperCase()
    if (!s || symbols.some(x => x.sym === s)) return
    persist([...symbols, { sym: s, label: (label || s).trim() }])
  }

  function handleRemove(sym) {
    if (symbols.length <= 1) return
    persist(symbols.filter(s => s.sym !== sym))
  }

  function moveItem(from, to) {
    if (from === to || from < 0 || to < 0 || from >= symbols.length || to >= symbols.length) return
    const next = [...symbols]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persist(next)
  }

  function makeDragHandlers(i) {
    return {
      onDragStart: e => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' },
      onDragOver:  e => { e.preventDefault(); setDragOverIdx(i) },
      onDragLeave: () => setDragOverIdx(null),
      onDrop: e => {
        e.preventDefault()
        if (dragIdx == null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return }
        moveItem(dragIdx, i)
        setDragIdx(null)
        setDragOverIdx(null)
      },
      onDragEnd: () => { setDragIdx(null); setDragOverIdx(null) },
    }
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader
        title="PRICES"
        onToggleLive={() => setIsLive(v => !v)}
        isLive={isLive}
        workspacePaused={workspacePaused}
        onCollapse={onCollapse}
        collapsed={collapsed}
        onFullscreen={onFullscreen}
        isFullscreen={isFullscreen}
        onClose={onClose}
      >
        <button
          type="button"
          className="widget-btn"
          onClick={() => setEditMode(v => !v)}
          title={editMode ? 'Done editing' : 'Edit watchlist'}
        >{editMode ? '✓' : '⚙'}</button>
      </WHeader>

      <div className="widget-body" style={{ flexDirection: 'column', alignItems: 'stretch', padding: 0, position: 'relative' }}>
        {editMode ? (
          <EditPanel
            symbols={symbols}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onMoveUp={idx => moveItem(idx, idx - 1)}
            onMoveDown={idx => moveItem(idx, idx + 1)}
            dragIdx={dragIdx}
            dragOverIdx={dragOverIdx}
            makeDragHandlers={makeDragHandlers}
          />
        ) : (
          <div
            ref={embedRef}
            style={{ flex: 1, width: '100%', minHeight: 0, overflow: 'hidden' }}
          />
        )}
      </div>
    </div>
  )
}

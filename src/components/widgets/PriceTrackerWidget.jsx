import { useState, useEffect, useCallback, useRef } from 'react'
import { TickerTape } from 'react-ts-tradingview-widgets'
import usePageVisibility from '../../hooks/usePageVisibility'
import { usePolling } from '../../hooks/usePolling'
import { SkeletonLine, SkeletonFeedItems } from '../shared/SkeletonLoader'
import WHeader from '../shared/WHeader'

let cgCache = {}

const COINGECKO_TO_TV = {
  'bitcoin':     'BINANCE:BTCUSDT',
  'ethereum':    'BINANCE:ETHUSDT',
  'solana':      'BINANCE:SOLUSDT',
  'cardano':     'BINANCE:ADAUSDT',
  'pax-gold':    'OANDA:XAUUSD',
  'tether-gold': 'OANDA:XAUUSD',
}
const PT_ASSET_COLORS = {
  'bitcoin':  '#f7931a',
  'ethereum': '#627eea',
  'solana':   '#9945ff',
  'pax-gold': '#d4af37',
}

const PT_DEFAULT_ASSETS = [
  { id: 'bitcoin',  ticker: 'BTC' },
  { id: 'ethereum', ticker: 'ETH' },
  { id: 'solana',   ticker: 'SOL' },
  { id: 'pax-gold', ticker: 'XAU' },
]

const PT_TAPE_SYMBOLS = [
  { proName: 'COINBASE:BTCUSD',    title: 'BTC/USD' },
  { proName: 'COINBASE:ETHUSD',    title: 'ETH/USD' },
  { proName: 'COINBASE:SOLUSD',    title: 'SOL/USD' },
  { proName: 'TVC:GOLD',           title: 'Gold' },
  { proName: 'FX_IDC:EURUSD',      title: 'EUR/USD' },
  { proName: 'FOREXCOM:SPXUSD',    title: 'S&P 500' },
  { proName: 'NASDAQ:AAPL',        title: 'AAPL' },
  { proName: 'TVC:USOIL',          title: 'Oil' },
]

function ptFmtPrice(v) {
  if (v == null) return '—'
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 100)   return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v >= 1)     return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function Sparkline({ points, isUp }) {
  if (!points?.length) return <div style={{ height: '40px' }} />
  const vals = points.map(p => p[1])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const W = 100, H = 40, pad = 2
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2)
    const y = pad + (1 - (v - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = isUp ? '#00ff88' : '#ff4444'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: '40px', display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function AssetSearch({ existingIds, onAdd }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const timerRef = useRef(null)
  const wrapRef  = useRef(null)
  const inputRef = useRef(null)

  function search(q) {
    clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
          { signal: AbortSignal.timeout(6000) }
        )
        const j = await r.json()
        setResults((j.coins ?? []).slice(0, 8).map(c => ({
          id:     c.id,
          ticker: c.symbol?.toUpperCase() ?? c.id.slice(0, 6).toUpperCase(),
          label:  c.name,
        })))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  function pick(item) {
    if (existingIds.includes(item.id)) return
    onAdd(item)
    setQuery('')
    setResults([])
    setOpen(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  return (
    <div className="pt-asset-search" ref={wrapRef} onPointerDownCapture={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="rss-input pt-search-input"
        value={query}
        onChange={e => { setQuery(e.target.value); search(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search to add asset…"
        spellCheck={false}
      />
      {open && query.trim() && (
        <div className="pt-search-dropdown">
          {loading && results.length === 0 && (
            <div className="pt-search-item pt-search-loading">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="pt-search-item pt-search-empty">No results</div>
          )}
          {results.map(item => {
            const already = existingIds.includes(item.id)
            return (
              <button key={item.id}
                className={`pt-search-item${already ? ' pt-search-added' : ''}`}
                onClick={() => pick(item)}
                disabled={already}>
                <span className="pt-search-ticker">{item.ticker}</span>
                <span className="pt-search-label">{item.label} ({item.ticker})</span>
                {already && <span className="pt-search-badge">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AssetCard({ asset, priceData, onRemove, onChartClick }) {
  const isNonCg = asset.source === 'tv' || asset.source === 'metals'
  const sym     = asset.symbol ?? asset.ticker ?? asset.id.slice(0, 6).toUpperCase()
  const d       = priceData[asset.id]
  const loading = !isNonCg && !d
  const price   = d?.price ?? null
  const chg     = d?.change24h ?? null
  const isUp    = (chg ?? 0) >= 0
  const stale   = d?.stale ?? false
  const accent  = PT_ASSET_COLORS[asset.id] ?? '#ffffff'
  const [flash, setFlash] = useState(null)
  const prevRef = useRef(null)

  useEffect(() => {
    if (price == null) return
    if (prevRef.current != null && prevRef.current !== price) {
      const dir = price > prevRef.current ? 'up' : 'down'
      setFlash(dir)
      const t = setTimeout(() => setFlash(null), 700)
      prevRef.current = price
      return () => clearTimeout(t)
    }
    prevRef.current = price
  }, [price])

  return (
    <div
      className={`asset-card${stale && !isNonCg ? ' asset-stale' : ''}${flash ? ` asset-flash-${flash}` : ''}${loading ? ' asset-loading' : ''}`}
      onClick={() => onChartClick?.(asset)}
    >
      <button className="asset-remove-btn" onClick={e => { e.stopPropagation(); onRemove(asset.id) }} title="Remove">×</button>
      <div className="asset-symbol" style={{ color: accent }}>{sym}</div>
      {isNonCg ? (
        <>
          <div className="asset-price">—</div>
          <div className="asset-change" style={{ color: '#2a3a4a' }}>—</div>
          <div style={{ minHeight: '40px' }} />
        </>
      ) : loading ? (
        <>
          <div className="asset-price asset-skel">&nbsp;</div>
          <div className="asset-change asset-skel" style={{ width: '60%' }}>&nbsp;</div>
          <div style={{ height: '40px' }} />
        </>
      ) : (
        <>
          <div className="asset-price">{price == null ? '—' : `$${ptFmtPrice(price)}`}</div>
          <div className={`asset-change ${isUp ? 'up' : 'down'}`}>
            {chg == null ? '—' : `${isUp ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%`}
          </div>
          {stale && <div className="asset-stale-label">⚠ stale</div>}
          <Sparkline points={d?.sparkline ?? null} isUp={isUp} />
        </>
      )}
    </div>
  )
}

export default function PriceTracker({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  const assetsKey = `vigil_prices_assets_${widgetId ?? 'default'}`
  const isVisiblePt = usePageVisibility()

  const [assets,      setAssets]      = useState(() => {
    const PT_ID_BLOCKLIST = ['sp500', 'gold', 'spx', 'pxspx']
    try {
      const saved = JSON.parse(localStorage.getItem(assetsKey) || 'null')
      if (!Array.isArray(saved) || !saved.length) return PT_DEFAULT_ASSETS
      const seenTickers = new Set()
      const valid = saved
        .filter(a => typeof a.id === 'string' && a.id && !a.source && !PT_ID_BLOCKLIST.includes(a.id))
        .map(a => ({ id: a.id, ticker: a.ticker ?? a.symbol ?? a.id.slice(0, 6).toUpperCase() }))
        .filter(a => { if (seenTickers.has(a.ticker)) return false; seenTickers.add(a.ticker); return true })
      return valid.length > 0 ? valid : PT_DEFAULT_ASSETS
    } catch { return PT_DEFAULT_ASSETS }
  })
  const [mode,        setMode]        = useState('grid')
  const [priceData,   setPriceData]   = useState({})
  const [loading,     setLoading]     = useState(true)
  const [fetchError,  setFetchError]  = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [timeAgo,     setTimeAgo]     = useState('')
  const [ptStale,       setPtStale]       = useState(false)
  const [ptRetryIn,     setPtRetryIn]     = useState(null)
  const [toast,         setToast]         = useState(null)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [chartOpen,     setChartOpen]     = useState(false)
  const [isLive,        setIsLive]        = useState(true)
  const toastKeyRef = useRef(0)
  const bodyRef     = useRef(null)
  const assetsRef   = useRef(assets)
  assetsRef.current = assets

  const effectiveLive    = isLive && !workspacePaused
  const effectiveLiveRef = useRef(effectiveLive)
  effectiveLiveRef.current = effectiveLive

  async function fetchSparkline(id) {
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1&interval=hourly`,
        { signal: AbortSignal.timeout(10000) }
      )
      const j = await r.json()
      return j.prices ?? null
    } catch { return null }
  }

  const fetchAll = useCallback(async (withSpark = false) => {
    const list   = assetsRef.current
    const cgList = list.filter(a => a.source !== 'tv' && a.source !== 'metals')
    if (!cgList.length) { setLoading(false); return }
    const ids = cgList.map(a => a.id).join(',')
    let cg = null
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      cg = await r.json()
      cgList.forEach(a => { if (cg[a.id]) cgCache[a.id] = cg[a.id] })
    } catch {
      const fallback = cgList.some(a => cgCache[a.id])
      if (fallback) {
        cg = {}
        cgList.forEach(a => { if (cgCache[a.id]) cg[a.id] = cgCache[a.id] })
        setPtStale(true)
        setPtRetryIn(60)
      } else {
        setFetchError('CoinGecko unavailable')
      }
      setPriceData(prev => {
        const next = { ...prev }
        cgList.forEach(a => { if (next[a.id]) next[a.id] = { ...next[a.id], stale: true } })
        return next
      })
      setLoading(false)
      if (!fallback) return
    }
    if (cg === null) return
    setPtStale(false)
    setFetchError(null)

    const updates = {}
    for (const a of cgList) {
      const d = cg[a.id]
      updates[a.id] = {
        price:       d?.usd ?? null,
        change24h:   d?.usd_24h_change ?? null,
        sparkline:   withSpark ? null : null,
        stale:       !d,
        lastUpdated: Date.now(),
      }
    }

    if (withSpark) {
      const sparks = await Promise.allSettled(cgList.map(a => fetchSparkline(a.id)))
      cgList.forEach((a, i) => {
        if (sparks[i].status === 'fulfilled') updates[a.id].sparkline = sparks[i].value
      })
    } else {
      setPriceData(prev => {
        cgList.forEach(a => { updates[a.id].sparkline = prev[a.id]?.sparkline ?? null })
        return { ...prev, ...updates }
      })
      setLastRefresh(Date.now())
      setLoading(false)
      return
    }

    setPriceData(prev => ({ ...prev, ...updates }))
    setLastRefresh(Date.now())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!ptRetryIn || ptRetryIn <= 0) return
    const t = setTimeout(() => {
      setPtRetryIn(v => (v != null && v > 1 ? v - 1 : null))
      if (ptRetryIn === 1) { setPtStale(false); fetchAll(false) }
    }, 1000)
    return () => clearTimeout(t)
  }, [ptRetryIn, fetchAll])

  usePolling(useCallback(() => fetchAll(false), [fetchAll]), 60_000,        { isLive: effectiveLive })
  usePolling(useCallback(() => fetchAll(true),  [fetchAll]), 5 * 60_000,   { isLive: effectiveLive })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isVisiblePt && effectiveLiveRef.current) fetchAll(false) }, [isVisiblePt])

  function saveAssets(list) {
    const clean = list.map(a => ({ id: a.id, ticker: a.ticker ?? a.symbol ?? a.id.slice(0, 6).toUpperCase() }))
    setAssets(clean)
    try { localStorage.setItem(assetsKey, JSON.stringify(clean)) } catch {}
  }

  function showToast(msg) {
    const key = ++toastKeyRef.current
    setToast({ msg, key })
    setTimeout(() => setToast(t => t?.key === key ? null : t), 1800)
  }

  function handleAdd(item) {
    if (assets.find(a => a.id === item.id)) return
    saveAssets([...assets, { id: item.id, ticker: item.ticker ?? item.symbol ?? item.id.slice(0, 6).toUpperCase() }])
    showToast(`+ Added: ${item.ticker ?? item.id}`)
    fetchAll(false)
  }

  function handleRemove(id) {
    saveAssets(assets.filter(a => a.id !== id))
    showToast('Removed')
  }

  function handleChartClick(asset) {
    const tvSym = COINGECKO_TO_TV[asset.id] ?? `BINANCE:${asset.ticker}USDT`
    setSelectedAsset({ ...asset, tvSym })
    setChartOpen(true)
  }

  function closeChart() {
    setChartOpen(false)
    setTimeout(() => setSelectedAsset(null), 260)
  }

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <WHeader title="PRICE TRACKER" onToggleLive={() => setIsLive(v => !v)} isLive={isLive} workspacePaused={workspacePaused} onCollapse={onCollapse} collapsed={collapsed} onFullscreen={onFullscreen} isFullscreen={isFullscreen} onClose={onClose}>
        <button className={`widget-btn pt-mode-btn${mode === 'grid' ? ' pt-mode-active' : ''}`} onClick={() => setMode('grid')} title="Grid">⊞</button>
        <button className={`widget-btn pt-mode-btn${mode === 'tape' ? ' pt-mode-active' : ''}`} onClick={() => setMode('tape')} title="Tape">≡</button>
      </WHeader>

      <div className="widget-body" ref={bodyRef} style={{ flexDirection: 'column', alignItems: 'stretch', position: 'relative' }}>
        {toast && <div key={toast.key} className="pt-toast">{toast.msg}</div>}
        {mode === 'tape' ? (
          <TickerTape
            symbols={PT_TAPE_SYMBOLS}
            colorTheme="dark"
            isTransparent
            displayMode="adaptive"
            locale="en"
          />
        ) : loading && Object.keys(priceData).length === 0 ? (
          <div className="pt-scroll">
            <div className="pt-grid">
              {PT_DEFAULT_ASSETS.map((_, i) => (
                <div key={i} className="asset-card">
                  <div className="skel-block" style={{ padding: 0, gap: 8 }}>
                    <SkeletonLine w="40%" h={10} />
                    <SkeletonLine w="70%" h={18} />
                    <SkeletonLine w="50%" h={9} />
                    <SkeletonLine w="100%" h={36} />
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-footer"><span></span><span>via CoinGecko</span></div>
          </div>
        ) : fetchError && Object.keys(priceData).length === 0 ? (
          <div className="widget-error">
            <span className="widget-error-icon">⚠</span>
            {fetchError}
            <button className="widget-error-retry" onClick={() => { setFetchError(null); fetchAll(true) }}>↻ Retry</button>
          </div>
        ) : (
          <>
            <div className="pt-scroll">
              {assets.length === 0
                ? <div className="empty-state"><span className="empty-state-icon">📈</span>Search below to add assets</div>
                : <div className="pt-grid">
                    {assets.map(asset => (
                      <AssetCard key={asset.id} asset={asset} priceData={priceData} onRemove={handleRemove} onChartClick={handleChartClick} />
                    ))}
                  </div>
              }
              <AssetSearch existingIds={assets.map(a => a.id)} onAdd={handleAdd} />
              <div className="pt-footer">
                <span>
                  {ptStale
                    ? <span style={{ color: 'var(--amber)' }}>⚠ stale{ptRetryIn ? ` · Retrying in ${ptRetryIn}s…` : ''}</span>
                    : lastRefresh ? `Updated ${timeAgo}` : ''
                  }
                </span>
                <span>via CoinGecko</span>
              </div>
            </div>
            <div className={`pt-chart-panel${chartOpen ? ' open' : ''}`}>
              {selectedAsset && (
                <>
                  <div className="pt-chart-header" onPointerDownCapture={e => e.stopPropagation()}>
                    <span className="pt-chart-ticker">● {selectedAsset.tvSym.includes(':') ? selectedAsset.tvSym.split(':')[1] : selectedAsset.tvSym}</span>
                    <button className="pt-chart-close" onClick={closeChart}>✕</button>
                  </div>
                  <iframe
                    key={selectedAsset.tvSym}
                    src={`https://s.tradingview.com/widgetembed/?frameElementId=tv_pt&symbol=${encodeURIComponent(selectedAsset.tvSym)}&interval=D&theme=dark&style=1&locale=en&toolbar_bg=0d1421&enable_publishing=0&hide_side_toolbar=0&allow_symbol_change=0&save_image=0`}
                    style={{ display: 'block', width: '100%', height: '270px', border: 'none', flexShrink: 0 }}
                    title="Asset Chart"
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

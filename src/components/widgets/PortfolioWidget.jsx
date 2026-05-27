import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LiveBtn } from '../shared/WHeader'

let cgCache = {}

const PORTFOLIO_TICKER_MAP = {
  BTC: 'bitcoin',    ETH: 'ethereum',       SOL: 'solana',        BNB: 'binancecoin',
  XRP: 'ripple',     ADA: 'cardano',        DOGE: 'dogecoin',     DOT: 'polkadot',
  AVAX: 'avalanche-2', MATIC: 'matic-network', LINK: 'chainlink', UNI: 'uniswap',
  ATOM: 'cosmos',    LTC: 'litecoin',       BCH: 'bitcoin-cash',
}

const PORTFOLIO_TYPE_COLORS = {
  Crypto: '#00D4FF', Stock: '#00C96B', Commodity: '#D29922', Cash: '#8B949E', Other: '#484F58',
}

const EXCH_IDS = ['binance', 'kraken', 'coinbase', 'okx', 'kucoin']

const EXCH_INSTRUCTIONS = {
  binance:  'Go to Binance → Profile → API Management. Create a key with Read Only permissions. IP restriction recommended.',
  kraken:   'Go to Kraken → Settings → API. Create a key with Query Funds permission only. No trade or withdrawal permissions.',
  coinbase: "Go to Coinbase → Settings → API. Create a legacy API key with 'wallet:accounts:read' permission only.",
  okx:      'Go to OKX → Profile → API Management. Create a key with Read permissions only. You must set a passphrase during creation.',
  kucoin:   'Go to KuCoin → Profile → API Management. Create a key with General permissions (read only). You must set a passphrase.',
}

const SNAPTRADE_BROKER_IDS = { t212: 'TRADING212', etoro: 'ETORO', ibkr: 'IBKR', degiro: 'DEGIRO' }

const BROKERS = [
  { id: 'bybit',    name: 'Bybit',    icon: '⚡', active: true },
  { id: 'binance',  name: 'Binance',  icon: '🔶', active: true },
  { id: 'kraken',   name: 'Kraken',   icon: '🐙', active: true },
  { id: 'coinbase', name: 'Coinbase', icon: '🔵', active: true },
  { id: 'okx',      name: 'OKX',      icon: '⭕', active: true, hasPassphrase: true },
  { id: 'kucoin',   name: 'KuCoin',   icon: '🟢', active: true, hasPassphrase: true },
]

function pfFmt(v, currency = 'USD') {
  if (v == null || isNaN(v)) return '—'
  const sym = currency === 'EUR' ? '€' : '$'
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000)     return `${sym}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `${sym}${Math.abs(v) < 0.01 ? v.toFixed(6) : v.toFixed(2)}`
}

function pfFmtSmall(v) {
  if (v == null) return '—'
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 100)   return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v >= 1)     return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function BrokerLogo({ url, name }) {
  const [err, setErr] = useState(false)
  if (!url || err) return (
    <svg className="pf-broker-card-logo-fb" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="8" width="20" height="13" rx="1" stroke="#6e8098" strokeWidth="1.5"/>
      <path d="M6 8V6a6 6 0 0 1 12 0v2" stroke="#6e8098" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  return <img src={url} alt={name} className="pf-broker-card-logo" onError={() => setErr(true)} />
}

export default function PortfolioWidget({ widgetId, onClose, onFullscreen, isFullscreen, onCollapse, collapsed, workspacePaused = false }) {
  // SECURITY: apiSecret is held in React state only for the duration of the session.
  // It is sent to our Vercel proxy for signing and never stored in localStorage.
  // Only the apiKey (non-secret) is persisted for UI display purposes.
  // Full encryption layer will be added in Session 7e with Supabase auth.

  const storageKey    = `vigil_portfolio_assets_${widgetId}`
  const currencyKey   = `vigil_portfolio_currency_${widgetId}`
  const bybitKeyStore = `vigil_portfolio_bybit_key_${widgetId}`

  const [activeTab,       setActiveTab]       = useState('overview')
  const [assets,          setAssets]          = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || 'null'); return Array.isArray(s) ? s : [] } catch { return [] }
  })
  const [currency,        setCurrency]        = useState(() => {
    try { return localStorage.getItem(currencyKey) || 'USD' } catch { return 'USD' }
  })
  const [prices,          setPrices]          = useState({})
  const [pricesLoading,   setPricesLoading]   = useState(false)
  const [lastUpdated,     setLastUpdated]     = useState(null)
  const [pfStale,         setPfStale]         = useState(false)
  const [pfRetryIn,       setPfRetryIn]       = useState(null)
  const [showAddModal,    setShowAddModal]    = useState(false)
  const [showBrokerModal,    setShowBrokerModal]    = useState(false)
  const [showBybitModal,     setShowBybitModal]     = useState(false)
  const [snapBrokers,        setSnapBrokers]        = useState([])
  const [snapBrokersLoading, setSnapBrokersLoading] = useState(false)
  const [snapBrokersError,   setSnapBrokersError]   = useState(null)
  const [snapBrokerSearch,   setSnapBrokerSearch]   = useState('')

  // Bybit connection — apiSecret session-only
  const [bybitConn,     setBybitConn]     = useState(() => {
    try {
      const key = localStorage.getItem(bybitKeyStore)
      return key ? { apiKey: key, apiSecret: null, status: 'key-only', ts: null, error: null } : null
    } catch { return null }
  })
  const [bybitBalances, setBybitBalances] = useState([])
  const [bybitLoading,  setBybitLoading]  = useState(false)

  // Generic exchange connections (Binance, Kraken, Coinbase, OKX, KuCoin)
  const [exchConnections, setExchConnections] = useState(() => {
    const result = {}
    for (const id of EXCH_IDS) {
      try {
        const key = localStorage.getItem(`vigil_portfolio_${id}_key_${widgetId}`)
        if (key) result[id] = { apiKey: key, apiSecret: null, passphrase: null, status: 'key-only', ts: null, error: null }
      } catch {}
    }
    return result
  })
  const [exchBalances, setExchBalances] = useState({})  // { [id]: [{ticker, qty, usdValue}] }
  const [exchLoading,  setExchLoading]  = useState({})  // { [id]: bool }
  const [exchModal,    setExchModal]    = useState(null) // shared generic connect modal state

  // SnapTrade OAuth integration
  const snaptradeStoreKey = `vigil_portfolio_snaptrade_${widgetId}`
  const [snaptradeUserId,      setSnaptradeUserId]      = useState(() => {
    try { return localStorage.getItem(`${snaptradeStoreKey}_userId`) || null } catch { return null }
  })
  const [snaptradeUserSecret,  setSnaptradeUserSecret]  = useState(() => {
    try { return localStorage.getItem(`${snaptradeStoreKey}_userSecret`) || null } catch { return null }
  })
  const [snaptradeHoldings,    setSnaptradeHoldings]    = useState([])
  const [snaptradeAccounts,    setSnaptradeAccounts]    = useState([])
  const [snaptradeLoading,     setSnaptradeLoading]     = useState(false)
  const [showSnaptradeModal,   setShowSnaptradeModal]   = useState(false)
  const [snaptradeModalBroker, setSnaptradeModalBroker] = useState(null)
  const [snaptradeStep,        setSnaptradeStep]        = useState(1)
  const [snaptradeError,       setSnaptradeError]       = useState(null)

  // Bybit connect form
  const [bbApiKey,     setBbApiKey]     = useState('')
  const [bbApiSecret,  setBbApiSecret]  = useState('')
  const [bbReadOnly,   setBbReadOnly]   = useState(true)
  const [bbError,      setBbError]      = useState(null)
  const [bbConnecting, setBbConnecting] = useState(false)

  // Add asset form
  const [addName,     setAddName]     = useState('')
  const [addTicker,   setAddTicker]   = useState('')
  const [addType,     setAddType]     = useState('Crypto')
  const [addQty,      setAddQty]      = useState('')
  const [addBuyPrice, setAddBuyPrice] = useState('')
  const [addCurrency, setAddCurrency] = useState('USD')

  const [isLive, setIsLive] = useState(true)
  const assetsRef     = useRef(assets)
  const bybitBalRef   = useRef(bybitBalances)
  const exchBalRef    = useRef(exchBalances)
  assetsRef.current   = assets
  bybitBalRef.current = bybitBalances
  exchBalRef.current  = exchBalances

  function saveAssets(next) {
    setAssets(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  const fetchPrices = useCallback(async () => {
    const manualCryptos  = assetsRef.current.filter(a => a.type === 'Crypto')
    const bybitTickers   = bybitBalRef.current.map(b => b.ticker)
    const exchAllTickers = Object.values(exchBalRef.current).flat().map(b => b.ticker)
    const allTickers = [
      ...manualCryptos.map(a => (a.ticker ?? '').toUpperCase()),
      ...bybitTickers,
      ...exchAllTickers,
    ]
    if (!allTickers.length) return
    setPricesLoading(true)
    const ids = [...new Set(allTickers.map(t => PORTFOLIO_TICKER_MAP[t] ?? t.toLowerCase()))]
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd,eur&include_24hr_change=true`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      ids.forEach(id => { if (data[id]) cgCache[id] = data[id] })
      setPrices(data)
      setLastUpdated(Date.now())
      setPfStale(false)
      setPfRetryIn(null)
    } catch {
      const hasCached = ids.some(id => cgCache[id])
      if (hasCached) {
        const fallback = {}
        ids.forEach(id => { if (cgCache[id]) fallback[id] = cgCache[id] })
        setPrices(prev => ({ ...prev, ...fallback }))
        setPfStale(true)
        setPfRetryIn(60)
      }
    }
    setPricesLoading(false)
  }, [])

  useEffect(() => {
    fetchPrices()
    const id = setInterval(() => { if (!document.hidden) fetchPrices() }, 60_000)
    return () => clearInterval(id)
  }, [fetchPrices, assets, bybitBalances, exchBalances])

  useEffect(() => {
    if (!pfRetryIn || pfRetryIn <= 0) return
    const t = setTimeout(() => {
      setPfRetryIn(v => (v != null && v > 1 ? v - 1 : null))
      if (pfRetryIn === 1) fetchPrices()
    }, 1000)
    return () => clearTimeout(t)
  }, [pfRetryIn, fetchPrices])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (snaptradeUserId && snaptradeUserSecret) fetchSnaptradeHoldings() }, [])

  // ── Bybit fetch ───────────────────────────────────────────────────────────────
  async function fetchBybit(apiKey, apiSecret) {
    setBybitLoading(true)
    try {
      const [walletRes] = await Promise.all([
        fetch('/api/bybit-portfolio', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, apiSecret }), signal: AbortSignal.timeout(12000),
        }),
        fetch('/api/bybit-positions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, apiSecret }), signal: AbortSignal.timeout(12000),
        }),
      ])
      if (walletRes.status === 429) {
        setBybitConn(c => ({ ...c, status: 'error', error: 'rate-limit' }))
        setBybitLoading(false); return { ok: false, error: 'rate-limit' }
      }
      const walletJson = await walletRes.json()
      if (!walletRes.ok) {
        const msg = walletJson.retCode === 10003 || walletJson.retCode === 10004
          ? 'invalid-key' : walletJson.error || 'Bybit error'
        setBybitConn(c => ({ ...c, status: 'error', error: msg }))
        setBybitLoading(false); return { ok: false, error: msg }
      }
      const coins = walletJson.result?.list?.[0]?.coin ?? []
      const bals  = coins
        .filter(c => parseFloat(c.walletBalance) > 0)
        .map(c => ({ ticker: c.coin.toUpperCase(), qty: parseFloat(c.walletBalance), usdValue: parseFloat(c.usdValue) || 0 }))
      setBybitBalances(bals)
      setBybitConn({ apiKey, apiSecret, status: 'connected', ts: Date.now(), error: null })
      try { localStorage.setItem(bybitKeyStore, apiKey) } catch {}
      setBybitLoading(false); return { ok: true }
    } catch {
      setBybitConn(c => c ? { ...c, status: 'error', error: 'network' } : null)
      setBybitLoading(false); return { ok: false, error: 'network' }
    }
  }

  async function handleBybitConnect() {
    const key = bbApiKey.trim(); const sec = bbApiSecret.trim()
    if (!key || !sec) return
    setBbError(null); setBbConnecting(true)
    const result = await fetchBybit(key, sec)
    setBbConnecting(false)
    if (result.ok) { setShowBybitModal(false); setBbApiKey(''); setBbApiSecret('') }
    else setBbError(result.error)
  }

  function openBybitModal() {
    setBbApiKey(bybitConn?.apiKey ?? ''); setBbApiSecret(''); setBbError(null)
    setShowBybitModal(true); setShowBrokerModal(false)
  }

  function disconnectBybit() {
    setBybitConn(null); setBybitBalances([])
    try { localStorage.removeItem(bybitKeyStore) } catch {}
  }

  function refreshBybit() {
    if (!bybitConn?.apiSecret) { openBybitModal(); return }
    fetchBybit(bybitConn.apiKey, bybitConn.apiSecret)
  }

  // ── Generic exchange fetch ────────────────────────────────────────────────────
  function openExchModal(broker) {
    const existing = exchConnections[broker.id]
    setExchModal({
      id: broker.id, name: broker.name,
      hasPassphrase: broker.hasPassphrase ?? false,
      apiKey: existing?.apiKey ?? '', apiSecret: '', passphrase: '',
      readOnly: true, error: null, connecting: false,
    })
    setShowBrokerModal(false)
  }

  async function handleExchConnect() {
    const { id, hasPassphrase, apiKey, apiSecret, passphrase } = exchModal
    if (!apiKey.trim() || !apiSecret.trim()) return
    if (hasPassphrase && !passphrase.trim()) return
    setExchModal(m => ({ ...m, error: null, connecting: true }))
    try {
      const body = { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() }
      if (hasPassphrase) body.passphrase = passphrase.trim()
      const res = await fetch(`/api/${id}-portfolio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
      })
      if (res.status === 429) { setExchModal(m => ({ ...m, connecting: false, error: 'rate-limit' })); return }
      const json = await res.json()
      if (!res.ok) {
        const errCode = res.status === 401 || res.status === 403 ? 'invalid-key' : (json.error || 'error')
        setExchModal(m => ({ ...m, connecting: false, error: errCode })); return
      }
      const bals = (json.balances ?? []).map(b => ({
        ticker: b.coin.toUpperCase(), qty: parseFloat(b.walletBalance) || 0, usdValue: 0,
      }))
      setExchBalances(prev => ({ ...prev, [id]: bals }))
      setExchConnections(prev => ({ ...prev, [id]: {
        apiKey: apiKey.trim(), apiSecret: apiSecret.trim(),
        passphrase: hasPassphrase ? passphrase.trim() : null,
        status: 'connected', ts: Date.now(), error: null,
      }}))
      try { localStorage.setItem(`vigil_portfolio_${id}_key_${widgetId}`, apiKey.trim()) } catch {}
      setExchModal(null)
    } catch {
      setExchModal(m => ({ ...m, connecting: false, error: 'network' }))
    }
  }

  function disconnectExch(id) {
    setExchConnections(prev => { const n = { ...prev }; delete n[id]; return n })
    setExchBalances(prev => { const n = { ...prev }; delete n[id]; return n })
    try { localStorage.removeItem(`vigil_portfolio_${id}_key_${widgetId}`) } catch {}
  }

  async function refreshExch(id) {
    const conn = exchConnections[id]
    if (!conn) return
    if (!conn.apiSecret) { const b = BROKERS.find(x => x.id === id); if (b) openExchModal(b); return }
    setExchLoading(prev => ({ ...prev, [id]: true }))
    try {
      const body = { apiKey: conn.apiKey, apiSecret: conn.apiSecret }
      if (conn.passphrase) body.passphrase = conn.passphrase
      const res  = await fetch(`/api/${id}-portfolio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
      })
      const json = await res.json()
      if (res.ok) {
        const bals = (json.balances ?? []).map(b => ({
          ticker: b.coin.toUpperCase(), qty: parseFloat(b.walletBalance) || 0, usdValue: 0,
        }))
        setExchBalances(prev => ({ ...prev, [id]: bals }))
        setExchConnections(prev => ({ ...prev, [id]: { ...prev[id], status: 'connected', ts: Date.now(), error: null } }))
      } else {
        setExchConnections(prev => ({ ...prev, [id]: { ...prev[id], status: 'error', error: json.error || 'error' } }))
      }
    } catch {
      setExchConnections(prev => ({ ...prev, [id]: { ...prev[id], status: 'error', error: 'network' } }))
    }
    setExchLoading(prev => ({ ...prev, [id]: false }))
  }

  // ── SnapTrade OAuth ───────────────────────────────────────────────────────────
  const fetchSnapBrokers = useCallback(async () => {
    setSnapBrokersLoading(true)
    setSnapBrokersError(null)
    try {
      const r = await fetch('/api/snaptrade-brokers')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed')
      setSnapBrokers(j.brokers ?? [])
    } catch {
      setSnapBrokersError('Could not load brokers. Check your connection.')
    }
    setSnapBrokersLoading(false)
  }, [])

  useEffect(() => {
    if (!showBrokerModal) return
    setSnapBrokerSearch('')
    fetchSnapBrokers()
  }, [showBrokerModal, fetchSnapBrokers])

  function openSnaptradeModal(broker) {
    setSnaptradeModalBroker(broker)
    setSnaptradeStep(1)
    setSnaptradeError(null)
    setShowSnaptradeModal(true)
    setShowBrokerModal(false)
  }

  async function handleSnaptradeConnect() {
    setSnaptradeError(null)
    setSnaptradeLoading(true)
    let userId     = snaptradeUserId
    let userSecret = snaptradeUserSecret
    if (!userId) {
      const newId = `vigil-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      try {
        const res  = await fetch('/api/snaptrade-register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: newId }), signal: AbortSignal.timeout(12000),
        })
        const json = await res.json()
        if (!res.ok) { setSnaptradeError(json.error || 'Registration failed'); setSnaptradeLoading(false); return }
        userId = json.userId; userSecret = json.userSecret
        setSnaptradeUserId(userId); setSnaptradeUserSecret(userSecret)
        try { localStorage.setItem(`${snaptradeStoreKey}_userId`,     userId)     } catch {}
        try { localStorage.setItem(`${snaptradeStoreKey}_userSecret`, userSecret) } catch {}
      } catch { setSnaptradeError('Network error. Could not reach SnapTrade.'); setSnaptradeLoading(false); return }
    }
    try {
      const brokerId = snaptradeModalBroker.slug ?? SNAPTRADE_BROKER_IDS[snaptradeModalBroker.id]
      const res      = await fetch('/api/snaptrade-connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userSecret, broker: brokerId }), signal: AbortSignal.timeout(12000),
      })
      const json = await res.json()
      if (!res.ok) { setSnaptradeError(json.error || 'Could not get connection link'); setSnaptradeLoading(false); return }
      window.open(json.redirectURI, '_blank', 'noopener,noreferrer')
      setSnaptradeStep(2)
    } catch { setSnaptradeError('Network error. Could not reach SnapTrade.') }
    setSnaptradeLoading(false)
  }

  async function fetchSnaptradeHoldings(closeModal = false) {
    if (!snaptradeUserId || !snaptradeUserSecret) return
    setSnaptradeError(null)
    setSnaptradeLoading(true)
    try {
      const res  = await fetch('/api/snaptrade-holdings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: snaptradeUserId, userSecret: snaptradeUserSecret }),
        signal: AbortSignal.timeout(15000),
      })
      const json = await res.json()
      if (res.ok) {
        setSnaptradeHoldings(json.holdings ?? [])
        setSnaptradeAccounts(json.accounts ?? [])
        if (closeModal) setShowSnaptradeModal(false)
      } else {
        setSnaptradeError(json.error || 'Could not load holdings')
      }
    } catch { setSnaptradeError('Network error loading holdings') }
    setSnaptradeLoading(false)
  }

  function disconnectSnaptrade() {
    setSnaptradeUserId(null); setSnaptradeUserSecret(null)
    setSnaptradeHoldings([]); setSnaptradeAccounts([])
    try { localStorage.removeItem(`${snaptradeStoreKey}_userId`)     } catch {}
    try { localStorage.removeItem(`${snaptradeStoreKey}_userSecret`) } catch {}
  }

  // ── Price helpers ─────────────────────────────────────────────────────────────
  function cgId(ticker) {
    return PORTFOLIO_TICKER_MAP[(ticker ?? '').toUpperCase()] ?? (ticker ?? '').toLowerCase()
  }

  function getPrice(asset) {
    if (asset.type !== 'Crypto') return null
    const cur = currency === 'EUR' ? 'eur' : 'usd'
    return prices[cgId(asset.ticker)]?.[cur] ?? null
  }

  function get24h(asset) {
    if (asset.type !== 'Crypto') return null
    return prices[cgId(asset.ticker)]?.usd_24h_change ?? null
  }

  function getValue(asset) {
    const qty = parseFloat(asset.quantity) || 0
    const p   = getPrice(asset)
    return qty * (p ?? parseFloat(asset.avgBuyPrice) ?? 0)
  }

  function getCoinPrice(ticker) {
    const cur = currency === 'EUR' ? 'eur' : 'usd'
    return prices[cgId(ticker)]?.[cur] ?? null
  }

  function getCoinValue(bal) {
    const p = getCoinPrice(bal.ticker)
    if (p != null) return bal.qty * p
    return (bal.usdValue ?? 0) * (currency === 'EUR' ? 0.92 : 1)
  }

  // ── Totals ────────────────────────────────────────────────────────────────────
  const manualTotal    = assets.reduce((s, a) => s + getValue(a), 0)
  const bybitTotal     = bybitBalances.reduce((s, b) => s + getCoinValue(b), 0)
  const exchTotal      = Object.values(exchBalances).flat().reduce((s, b) => s + getCoinValue(b), 0)
  const snaptradeTotal = snaptradeHoldings.reduce((s, h) => s + (h.value ?? 0) * (currency === 'EUR' ? 0.92 : 1), 0)
  const totalValue     = manualTotal + bybitTotal + exchTotal + snaptradeTotal

  const total24hChange = [
    ...assets.map(a => {
      const p = getPrice(a); const chg = get24h(a)
      if (p == null || chg == null) return 0
      return (parseFloat(a.quantity) || 0) * p * (chg / 100)
    }),
    ...[...bybitBalances, ...Object.values(exchBalances).flat()].map(b => {
      const cur = currency === 'EUR' ? 'eur' : 'usd'
      const p   = prices[cgId(b.ticker)]?.[cur]
      const chg = prices[cgId(b.ticker)]?.usd_24h_change
      if (p == null || chg == null) return 0
      return b.qty * p * (chg / 100)
    }),
  ].reduce((s, v) => s + v, 0)
  const total24hChangePct = totalValue > 0 ? (total24hChange / (totalValue - total24hChange)) * 100 : 0

  const allocationByType = {}
  assets.forEach(a => { allocationByType[a.type] = (allocationByType[a.type] ?? 0) + getValue(a) })
  if (bybitTotal     > 0) allocationByType['Crypto'] = (allocationByType['Crypto'] ?? 0) + bybitTotal
  if (exchTotal      > 0) allocationByType['Crypto'] = (allocationByType['Crypto'] ?? 0) + exchTotal
  if (snaptradeTotal > 0) allocationByType['Stock']  = (allocationByType['Stock']  ?? 0) + snaptradeTotal
  const allocTypes = Object.keys(allocationByType)

  function addAsset() {
    const name   = addName.trim()
    const ticker = addTicker.trim().toUpperCase()
    if (!name || !ticker) return
    const qty      = parseFloat(addQty)
    const buyPrice = parseFloat(addBuyPrice)
    if (isNaN(qty) || qty <= 0 || isNaN(buyPrice) || buyPrice < 0) return
    saveAssets([...assets, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name, ticker, type: addType, quantity: qty, avgBuyPrice: buyPrice, currency: addCurrency,
    }])
    setAddName(''); setAddTicker(''); setAddType('Crypto'); setAddQty(''); setAddBuyPrice(''); setAddCurrency('USD')
    setShowAddModal(false)
  }

  function fmtUpdated() {
    if (!lastUpdated) return ''
    const s = Math.floor((Date.now() - lastUpdated) / 1000)
    if (s < 10) return 'just now'
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  function fmtTs(ts) {
    if (!ts) return ''
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 10) return 'just now'
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  function exchErrorMsg(id, e) {
    const name = BROKERS.find(b => b.id === id)?.name ?? id
    if (e === 'invalid-key') return `Invalid API key. Check permissions in your ${name} account.`
    if (e === 'rate-limit')  return `Rate limited by ${name}. Wait a moment and try again.`
    if (e === 'network')     return `Could not reach ${name}. Check your connection.`
    if (e === 'passphrase')  return `Invalid passphrase. Check your API settings.`
    return e ?? `Unknown error connecting to ${name}.`
  }

  function bbErrorMsg(e) {
    if (e === 'invalid-key') return 'Invalid API key or secret. Check your Bybit API credentials.'
    if (e === 'rate-limit')  return 'Rate limited by Bybit. Wait a moment and try again.'
    if (e === 'network')     return 'Network error. Could not reach Bybit — check your connection.'
    return e ?? 'Unknown error connecting to Bybit.'
  }

  const currSym         = currency === 'EUR' ? '€' : '$'
  const SNAP_FALLBACK = [
    { id: 't212',   name: 'Trading 212', icon: '📊', slug: 'TRADING212' },
    { id: 'etoro',  name: 'eToro',       icon: '🌿', slug: 'ETORO'      },
    { id: 'ibkr',   name: 'IBKR',        icon: '🏦', slug: 'IBKR'       },
    { id: 'degiro', name: 'DEGIRO',       icon: '🏛', slug: 'DEGIRO'     },
  ]
  const snapSource          = snapBrokers.length > 0 ? snapBrokers : SNAP_FALLBACK
  const snapBrokersFiltered = snapSource.filter(b =>
    !snapBrokerSearch.trim() || b.name.toLowerCase().includes(snapBrokerSearch.toLowerCase())
  )
  const pxCell = (price) => price != null
    ? pfStale
      ? <><span style={{ color: 'var(--amber)', fontSize: '9px' }}>⚠ </span>{currSym}{pfFmtSmall(price)}</>
      : `${currSym}${pfFmtSmall(price)}`
    : '—'
  const allExchBalFlat  = Object.values(exchBalances).flat()
  const isEmpty         = assets.length === 0 && bybitBalances.length === 0 && allExchBalFlat.length === 0 && snaptradeHoldings.length === 0
  const hasConn         = bybitConn != null || Object.keys(exchConnections).length > 0 || snaptradeUserId != null
  const totalAssetCount = assets.length + bybitBalances.length + allExchBalFlat.length + snaptradeHoldings.length
  const anyLoading      = bybitLoading || Object.values(exchLoading).some(Boolean) || snaptradeLoading

  return (
    <div className="widget" data-collapsed={collapsed || undefined}>
      <div className="widget-header widget-drag-handle">
        <span className="widget-title">PORTFOLIO</span>
        <div className="widget-actions">
          <LiveBtn isLive={isLive} workspacePaused={workspacePaused} onToggle={() => setIsLive(v => !v)} />
          <button className="pf-add-asset-btn" onPointerDownCapture={e => e.stopPropagation()} onClick={() => setShowAddModal(true)}>+ Add Asset</button>
          {onCollapse   && <button className="widget-btn" onClick={onCollapse}   title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '+' : '—'}</button>}
          {onFullscreen && <button className="widget-btn" onClick={onFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤡' : '⤢'}</button>}
          {onClose      && <button className="widget-btn" onClick={onClose}      title="Close">✕</button>}
        </div>
      </div>

      {/* Tab bar + currency picker */}
      <div className="pf-tab-bar" onPointerDownCapture={e => e.stopPropagation()}>
        <button className={`pf-tab${activeTab === 'overview' ? ' active' : ''}`}  onClick={() => setActiveTab('overview')}>OVERVIEW</button>
        <button className={`pf-tab${activeTab === 'holdings' ? ' active' : ''}`} onClick={() => setActiveTab('holdings')}>HOLDINGS</button>
        <div className="pf-tab-spacer" />
        <select
          className="pf-currency-select"
          value={currency}
          onChange={e => { setCurrency(e.target.value); try { localStorage.setItem(currencyKey, e.target.value) } catch {} }}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </div>

      {/* Accounts strip */}
      <div className="pf-accounts-strip" onPointerDownCapture={e => e.stopPropagation()}>
        <span className="pf-accounts-label">ACCOUNTS</span>
        {!hasConn && <span className="pf-accounts-empty">No brokers connected</span>}
        {bybitConn && (
          <div className="pf-account-chip">
            <span className={`pf-account-dot${bybitLoading ? ' loading' : bybitConn.status === 'error' ? ' error' : ''}`} />
            <span className="pf-account-name">BYBIT</span>
            {bybitConn.ts && <span className="pf-account-ts">{fmtTs(bybitConn.ts)}</span>}
            <button className="pf-account-refresh" title="Refresh" onClick={refreshBybit}>↻</button>
            <button className="pf-account-disconnect" title="Disconnect" onClick={disconnectBybit}>✕</button>
          </div>
        )}
        {Object.entries(exchConnections).map(([id, conn]) => (
          <div key={id} className="pf-account-chip">
            <span className={`pf-account-dot${exchLoading[id] ? ' loading' : conn.status === 'error' ? ' error' : ''}`} />
            <span className="pf-account-name">{id.toUpperCase()}</span>
            {conn.ts && <span className="pf-account-ts">{fmtTs(conn.ts)}</span>}
            <button className="pf-account-refresh" title="Refresh" onClick={() => refreshExch(id)}>↻</button>
            <button className="pf-account-disconnect" title="Disconnect" onClick={() => disconnectExch(id)}>✕</button>
          </div>
        ))}
        {snaptradeUserId && (
          <div className="pf-account-chip">
            <span className={`pf-account-dot${snaptradeLoading ? ' loading' : ''}`} />
            <span className="pf-account-name">SNAPTRADE</span>
            {snaptradeAccounts.length > 0 && <span className="pf-account-ts">{snaptradeAccounts.length} acct{snaptradeAccounts.length !== 1 ? 's' : ''}</span>}
            <button className="pf-account-refresh" title="Refresh" onClick={() => fetchSnaptradeHoldings()}>↻</button>
            <button className="pf-account-disconnect" title="Disconnect" onClick={disconnectSnaptrade}>✕</button>
          </div>
        )}
        <button className="pf-connect-btn" onClick={() => setShowBrokerModal(true)}>+ Connect Broker</button>
      </div>

      {/* Error banners */}
      {bybitConn?.status === 'error' && (
        <div className="pf-bybit-error" style={{ margin: '0 8px 4px', fontSize: '10px' }}>
          {bbErrorMsg(bybitConn.error)}
        </div>
      )}
      {Object.entries(exchConnections).filter(([, c]) => c.status === 'error').map(([id, conn]) => (
        <div key={id} className={`pf-bybit-error${conn.error === 'rate-limit' || conn.error === 'network' ? ' amber' : ''}`}
          style={{ margin: '0 8px 4px', fontSize: '10px' }}>
          {exchErrorMsg(id, conn.error)}
        </div>
      ))}

      {/* Body */}
      <div className="pf-body">
        {isEmpty ? (
          <div className="pf-empty-state">
            <svg className="pf-empty-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="12" width="40" height="28" rx="2" stroke="#00D4FF" strokeWidth="1.5"/>
              <path d="M4 20h40" stroke="#00D4FF" strokeWidth="1.5"/>
              <rect x="10" y="26" width="8" height="8" rx="1" stroke="#00D4FF" strokeWidth="1.2"/>
              <rect x="22" y="26" width="8" height="8" rx="1" stroke="#00D4FF" strokeWidth="1.2"/>
              <rect x="34" y="26" width="6" height="8" rx="1" stroke="#00D4FF" strokeWidth="1.2" opacity="0.5"/>
              <path d="M16 8h16M20 8v4M28 8v4" stroke="#00D4FF" strokeWidth="1.2" opacity="0.6"/>
            </svg>
            <div className="pf-empty-title">No assets yet</div>
            <div className="pf-empty-sub">Add holdings manually or connect a broker</div>
            <button className="pf-empty-add-btn" onClick={() => setShowAddModal(true)}>+ Add Asset</button>
          </div>
        ) : activeTab === 'overview' ? (
          <div className="pf-overview">
            <div className="pf-total-section">
              <div className="pf-total-label">TOTAL VALUE</div>
              <div className="pf-total-value">
                {pfFmt(totalValue, currency)}
                {pfStale && <span style={{ color: 'var(--amber)', fontSize: '10px', marginLeft: '6px' }}>⚠ stale</span>}
              </div>
              {total24hChange !== 0 && (
                <div className="pf-total-change" style={{ color: total24hChange >= 0 ? '#00C96B' : '#F85149' }}>
                  {total24hChange >= 0 ? '▲' : '▼'} {pfFmt(Math.abs(total24hChange), currency)} ({Math.abs(total24hChangePct).toFixed(2)}%) 24h
                </div>
              )}
            </div>

            {allocTypes.length > 0 && (
              <div className="pf-alloc-section">
                <div className="pf-alloc-label">ALLOCATION</div>
                <div className="pf-alloc-bar">
                  {allocTypes.map(type => {
                    const pct = totalValue > 0 ? (allocationByType[type] / totalValue) * 100 : 0
                    return (
                      <div key={type} className="pf-alloc-segment"
                        style={{ width: `${pct}%`, background: PORTFOLIO_TYPE_COLORS[type] ?? '#484F58' }}
                        title={`${type}: ${pct.toFixed(1)}%`}
                      />
                    )
                  })}
                </div>
                <div className="pf-alloc-legend">
                  {allocTypes.map(type => {
                    const pct = totalValue > 0 ? (allocationByType[type] / totalValue) * 100 : 0
                    return (
                      <div key={type} className="pf-alloc-leg-item">
                        <span className="pf-alloc-leg-dot" style={{ background: PORTFOLIO_TYPE_COLORS[type] ?? '#484F58' }} />
                        <span className="pf-alloc-leg-label">{type}</span>
                        <span className="pf-alloc-leg-pct">{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="pf-overview-footer">
              <span>{totalAssetCount} asset{totalAssetCount !== 1 ? 's' : ''}</span>
              {lastUpdated && <span>Updated {fmtUpdated()}</span>}
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '10px' }}>via CoinGecko</span>
            </div>
          </div>
        ) : (
          <div className="pf-holdings">
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>NAME</th><th>TICKER</th><th>TYPE</th><th>QTY</th>
                    <th>AVG BUY</th><th>PRICE</th><th>VALUE</th><th>P&amp;L</th><th>P&amp;L %</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.length > 0 && (
                    <tr className="pf-section-row">
                      <td colSpan={10}><span className="pf-section-label">MANUAL</span></td>
                    </tr>
                  )}
                  {assets.map(asset => {
                    const price  = getPrice(asset)
                    const qty    = parseFloat(asset.quantity) || 0
                    const avg    = parseFloat(asset.avgBuyPrice) || 0
                    const value  = getValue(asset)
                    const pnl    = price != null ? value - qty * avg : null
                    const pnlPct = avg > 0 && price != null ? ((price - avg) / avg) * 100 : null
                    return (
                      <tr key={asset.id}>
                        <td className="pf-col-name">{asset.name}</td>
                        <td className="pf-col-ticker">{asset.ticker}</td>
                        <td>
                          <span className="pf-type-badge"
                            style={{ color: PORTFOLIO_TYPE_COLORS[asset.type] ?? '#484F58', borderColor: PORTFOLIO_TYPE_COLORS[asset.type] ?? '#484F58' }}>
                            {asset.type}
                          </span>
                        </td>
                        <td className="pf-col-mono">{qty}</td>
                        <td className="pf-col-mono">{currSym}{pfFmtSmall(avg)}</td>
                        <td className="pf-col-mono">
                          {asset.type === 'Crypto'
                            ? pxCell(price)
                            : <span className="pf-price-na" title="Price unavailable — update manually">—</span>
                          }
                        </td>
                        <td className="pf-col-mono">{pfFmt(value, currency)}</td>
                        <td className="pf-col-mono" style={{ color: pnl == null || pnl === 0 ? '#8B949E' : pnl > 0 ? '#00C96B' : '#F85149' }}>
                          {pnl == null ? '—' : `${pnl > 0 ? '+' : ''}${pfFmt(pnl, currency)}`}
                        </td>
                        <td className="pf-col-mono" style={{ color: pnlPct == null || pnlPct === 0 ? '#8B949E' : pnlPct > 0 ? '#00C96B' : '#F85149' }}>
                          {pnlPct == null ? '—' : `${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}
                        </td>
                        <td><button className="pf-row-del" onClick={() => saveAssets(assets.filter(a => a.id !== asset.id))}>✕</button></td>
                      </tr>
                    )
                  })}

                  {bybitBalances.length > 0 && (
                    <tr className="pf-section-row">
                      <td colSpan={10}><span className="pf-section-label">BYBIT</span></td>
                    </tr>
                  )}
                  {bybitBalances.map(bal => {
                    const price = getCoinPrice(bal.ticker)
                    const value = getCoinValue(bal)
                    return (
                      <tr key={`bybit-${bal.ticker}`}>
                        <td className="pf-col-name">{bal.ticker}</td>
                        <td className="pf-col-ticker">{bal.ticker}</td>
                        <td><span className="pf-type-badge" style={{ color: '#00D4FF', borderColor: '#00D4FF' }}>Crypto</span></td>
                        <td className="pf-col-mono">{pfFmtSmall(bal.qty)}</td>
                        <td className="pf-col-mono">—</td>
                        <td className="pf-col-mono">{pxCell(price)}</td>
                        <td className="pf-col-mono">{pfFmt(value, currency)}</td>
                        <td className="pf-col-mono">—</td>
                        <td className="pf-col-mono">—</td>
                        <td />
                      </tr>
                    )
                  })}

                  {Object.entries(exchBalances).flatMap(([exchId, bals]) => {
                    if (!bals.length) return []
                    return [
                      <tr key={`${exchId}-hdr`} className="pf-section-row">
                        <td colSpan={10}><span className="pf-section-label">{exchId.toUpperCase()}</span></td>
                      </tr>,
                      ...bals.map(bal => {
                        const price = getCoinPrice(bal.ticker)
                        const value = getCoinValue(bal)
                        return (
                          <tr key={`${exchId}-${bal.ticker}`}>
                            <td className="pf-col-name">{bal.ticker}</td>
                            <td className="pf-col-ticker">{bal.ticker}</td>
                            <td><span className="pf-type-badge" style={{ color: '#00D4FF', borderColor: '#00D4FF' }}>Crypto</span></td>
                            <td className="pf-col-mono">{pfFmtSmall(bal.qty)}</td>
                            <td className="pf-col-mono">—</td>
                            <td className="pf-col-mono">{pxCell(price)}</td>
                            <td className="pf-col-mono">{pfFmt(value, currency)}</td>
                            <td className="pf-col-mono">—</td>
                            <td className="pf-col-mono">—</td>
                            <td />
                          </tr>
                        )
                      }),
                    ]
                  })}

                  {snaptradeHoldings.length > 0 && (
                    <tr className="pf-section-row">
                      <td colSpan={10}><span className="pf-section-label">SNAPTRADE</span></td>
                    </tr>
                  )}
                  {snaptradeHoldings.map((h, i) => {
                    const val = (h.value ?? 0) * (currency === 'EUR' ? 0.92 : 1)
                    const pr  = (h.price ?? 0) * (currency === 'EUR' ? 0.92 : 1)
                    return (
                      <tr key={`snaptrade-${i}`}>
                        <td className="pf-col-name">{h.name || h.ticker}</td>
                        <td className="pf-col-ticker">{h.ticker}</td>
                        <td><span className="pf-type-badge" style={{ color: '#00C96B', borderColor: '#00C96B' }}>Stock</span></td>
                        <td className="pf-col-mono">{pfFmtSmall(h.qty)}</td>
                        <td className="pf-col-mono">—</td>
                        <td className="pf-col-mono">{pr > 0 ? `${currSym}${pfFmtSmall(pr)}` : '—'}</td>
                        <td className="pf-col-mono">{val > 0 ? pfFmt(val, currency) : '—'}</td>
                        <td className="pf-col-mono">—</td>
                        <td className="pf-col-mono">—</td>
                        <td />
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="pf-total-row">
                    <td colSpan={6}>TOTAL</td>
                    <td className="pf-col-mono pf-total-cell">{pfFmt(totalValue, currency)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="pf-holdings-footer">
              {pfStale
                ? <span style={{ color: 'var(--amber)', fontSize: '10px' }}>⚠ stale prices{pfRetryIn ? ` · Retrying in ${pfRetryIn}s…` : ''}</span>
                : lastUpdated && <span>Updated {fmtUpdated()}</span>
              }
              {anyLoading && <span className="pf-spinner" />}
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '10px' }}>via CoinGecko</span>
            </div>
          </div>
        )}
      </div>

      {/* Add Asset modal */}
      {showAddModal && createPortal(
        <div className="modal-overlay" onPointerDown={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}>
          <div className="pf-modal">
            <div className="pf-modal-header">
              <span className="pf-modal-title">Add Asset</span>
              <button className="widget-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="pf-modal-body" onPointerDownCapture={e => e.stopPropagation()}>
              <div className="pf-form-row">
                <label className="pf-form-label">ASSET NAME</label>
                <input autoFocus className="pf-form-input" value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Bitcoin" />
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">TICKER</label>
                <input className="pf-form-input" value={addTicker} onChange={e => setAddTicker(e.target.value.toUpperCase())} placeholder="e.g. BTC" />
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">TYPE</label>
                <select className="pf-form-select" value={addType} onChange={e => setAddType(e.target.value)}>
                  <option>Crypto</option><option>Stock</option><option>Commodity</option><option>Cash</option><option>Other</option>
                </select>
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">QUANTITY</label>
                <input className="pf-form-input" type="number" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="0.00" min="0" step="any" />
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">AVG BUY PRICE</label>
                <input className="pf-form-input" type="number" value={addBuyPrice} onChange={e => setAddBuyPrice(e.target.value)} placeholder="0.00" min="0" step="any" />
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">CURRENCY</label>
                <select className="pf-form-select" value={addCurrency} onChange={e => setAddCurrency(e.target.value)}>
                  <option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="pf-modal-footer">
              <button className="pf-modal-cancel" onClick={() => setShowAddModal(false)}>CANCEL</button>
              <button className="pf-modal-add" onClick={addAsset}>ADD ASSET</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Broker selection modal */}
      {showBrokerModal && createPortal(
        <div className="modal-overlay" onPointerDown={e => { if (e.target === e.currentTarget) setShowBrokerModal(false) }}>
          <div className="pf-modal pf-broker-modal">
            <div className="pf-modal-header">
              <span className="pf-modal-title">Connect Broker</span>
              <button className="widget-btn" onClick={() => setShowBrokerModal(false)}>✕</button>
            </div>
            <div className="pf-broker-grid-body" onPointerDownCapture={e => e.stopPropagation()}>
              <div className="pf-broker-grid-label">SELECT EXCHANGE</div>
              <div className="pf-broker-grid">
                {BROKERS.map(b => (
                  <div
                    key={b.id}
                    className={`pf-broker-card${b.active ? ' active' : ''}`}
                    onClick={b.active ? () => b.id === 'bybit' ? openBybitModal() : openExchModal(b) : undefined}
                    title={b.active ? `Connect ${b.name}` : 'Coming soon'}
                  >
                    <span className="pf-broker-card-icon">{b.icon}</span>
                    <span className="pf-broker-card-name">{b.name}</span>
                    {b.active ? (
                      <>
                        <span className="pf-broker-card-active-label">CONNECT</span>
                        {b.hasPassphrase && <span style={{ fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.03em' }}>Passphrase req.</span>}
                      </>
                    ) : (
                      <span className="pf-broker-card-soon">soon</span>
                    )}
                  </div>
                ))}
              </div>

              {/* SnapTrade stock brokers section */}
              <div className="pf-broker-snap-header">
                <span className="pf-broker-grid-label" style={{ marginBottom: 0 }}>STOCK BROKERS</span>
                <span className="pf-broker-snap-powered">Powered by SnapTrade</span>
              </div>
              <input
                className="pf-broker-snap-search"
                value={snapBrokerSearch}
                onChange={e => setSnapBrokerSearch(e.target.value)}
                placeholder="Search 30+ brokers worldwide..."
                spellCheck={false}
              />
              <div className="pf-broker-snap-grid">
                {snapBrokersLoading
                  ? Array.from({ length: 4 }, (_, i) => (
                      <div key={i} className="pf-broker-card pf-broker-skel">
                        <div className="skel-line pf-broker-skel-logo" />
                        <div className="skel-line" style={{ width: '70%', height: 8, marginTop: 2 }} />
                        <div className="skel-line" style={{ width: '45%', height: 7 }} />
                      </div>
                    ))
                  : snapBrokersFiltered.length === 0 && snapBrokerSearch.trim()
                    ? <div className="pf-broker-snap-empty">No brokers match "{snapBrokerSearch}"</div>
                    : snapBrokersFiltered.map(b => (
                        <div
                          key={b.slug ?? b.id}
                          className="pf-broker-card active"
                          onClick={() => openSnaptradeModal(b)}
                          title={`Connect ${b.name} via SnapTrade`}
                        >
                          {b.icon
                            ? <span className="pf-broker-card-icon">{b.icon}</span>
                            : <BrokerLogo url={b.logoUrl} name={b.name} />
                          }
                          <span className="pf-broker-card-name">{b.name}</span>
                          <span className="pf-broker-card-active-label">CONNECT</span>
                          <span style={{ fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.03em' }}>via SnapTrade</span>
                        </div>
                      ))
                }
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bybit connect modal */}
      {showBybitModal && createPortal(
        <div className="modal-overlay" onPointerDown={e => { if (e.target === e.currentTarget) setShowBybitModal(false) }}>
          <div className="pf-modal pf-bybit-modal">
            <div className="pf-modal-header">
              <span className="pf-modal-title">Connect Bybit</span>
              <button className="widget-btn" onClick={() => setShowBybitModal(false)}>✕</button>
            </div>
            <div className="pf-bybit-body" onPointerDownCapture={e => e.stopPropagation()}>
              <div className="pf-bybit-instructions">
                <strong>How to get your API key:</strong><br />
                1. Open Bybit → Account → API Management<br />
                2. Create a new key — enable <strong>Read-Only</strong> permissions only<br />
                3. Paste your API Key and Secret below
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">API KEY</label>
                <input autoFocus className="pf-form-input" value={bbApiKey}
                  onChange={e => setBbApiKey(e.target.value)} placeholder="Paste your Bybit API key" autoComplete="off" />
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">API SECRET</label>
                <input className="pf-form-input" type="password" value={bbApiSecret}
                  onChange={e => setBbApiSecret(e.target.value)} placeholder="Paste your Bybit API secret" autoComplete="new-password" />
              </div>
              <label className="pf-bybit-check-row">
                <input type="checkbox" checked={bbReadOnly} onChange={e => setBbReadOnly(e.target.checked)} />
                I confirm this key has read-only permissions (no trading or withdrawals)
              </label>
              <div className="pf-bybit-security-note">
                Your secret is used only to sign requests to Bybit and is never stored to disk or localStorage.
                It exists in memory for this session only.
              </div>
              {bbError && (
                <div className={`pf-bybit-error${bbError === 'rate-limit' || bbError === 'network' ? ' amber' : ''}`}>
                  {bbErrorMsg(bbError)}
                </div>
              )}
            </div>
            <div className="pf-modal-footer">
              <button className="pf-modal-cancel" onClick={() => setShowBybitModal(false)}>CANCEL</button>
              <button
                className="pf-modal-add"
                onClick={handleBybitConnect}
                disabled={!bbApiKey.trim() || !bbApiSecret.trim() || bbConnecting}
                style={{ opacity: (!bbApiKey.trim() || !bbApiSecret.trim() || bbConnecting) ? 0.5 : 1 }}
              >
                {bbConnecting ? 'CONNECTING…' : 'CONNECT'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Generic exchange connect modal (Binance, Kraken, Coinbase, OKX, KuCoin) */}
      {exchModal && createPortal(
        <div className="modal-overlay" onPointerDown={e => { if (e.target === e.currentTarget) setExchModal(null) }}>
          <div className="pf-modal pf-bybit-modal">
            <div className="pf-modal-header">
              <span className="pf-modal-title">Connect {exchModal.name}</span>
              <button className="widget-btn" onClick={() => setExchModal(null)}>✕</button>
            </div>
            <div className="pf-bybit-body" onPointerDownCapture={e => e.stopPropagation()}>
              <div className="pf-bybit-instructions">
                <strong>How to get your API key:</strong><br />
                {EXCH_INSTRUCTIONS[exchModal.id]}
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">API KEY</label>
                <input autoFocus className="pf-form-input" value={exchModal.apiKey}
                  onChange={e => setExchModal(m => ({ ...m, apiKey: e.target.value }))}
                  placeholder={`Paste your ${exchModal.name} API key`} autoComplete="off" />
              </div>
              <div className="pf-form-row">
                <label className="pf-form-label">{exchModal.id === 'kraken' ? 'PRIVATE KEY' : 'API SECRET'}</label>
                <input className="pf-form-input" type="password" value={exchModal.apiSecret}
                  onChange={e => setExchModal(m => ({ ...m, apiSecret: e.target.value }))}
                  placeholder={`Paste your ${exchModal.name} ${exchModal.id === 'kraken' ? 'private key' : 'API secret'}`}
                  autoComplete="new-password" />
              </div>
              {exchModal.hasPassphrase && (
                <div className="pf-form-row">
                  <label className="pf-form-label">PASSPHRASE</label>
                  <input className="pf-form-input" type="password" value={exchModal.passphrase}
                    onChange={e => setExchModal(m => ({ ...m, passphrase: e.target.value }))}
                    placeholder="Your API passphrase" autoComplete="new-password" />
                </div>
              )}
              <label className="pf-bybit-check-row">
                <input type="checkbox" checked={exchModal.readOnly}
                  onChange={e => setExchModal(m => ({ ...m, readOnly: e.target.checked }))} />
                I confirm this key has read-only permissions (no trading or withdrawals)
              </label>
              <div className="pf-bybit-security-note">
                Your secret is used only to sign requests to {exchModal.name} and is never stored to disk or localStorage.
                It exists in memory for this session only.
              </div>
              {exchModal.error && (
                <div className={`pf-bybit-error${exchModal.error === 'rate-limit' || exchModal.error === 'network' ? ' amber' : ''}`}>
                  {exchErrorMsg(exchModal.id, exchModal.error)}
                </div>
              )}
            </div>
            <div className="pf-modal-footer">
              <button className="pf-modal-cancel" onClick={() => setExchModal(null)}>CANCEL</button>
              <button
                className="pf-modal-add"
                onClick={handleExchConnect}
                disabled={
                  !exchModal.apiKey.trim() || !exchModal.apiSecret.trim() ||
                  (exchModal.hasPassphrase && !exchModal.passphrase.trim()) || exchModal.connecting
                }
                style={{ opacity: (
                  !exchModal.apiKey.trim() || !exchModal.apiSecret.trim() ||
                  (exchModal.hasPassphrase && !exchModal.passphrase.trim()) || exchModal.connecting
                ) ? 0.5 : 1 }}
              >
                {exchModal.connecting ? 'CONNECTING…' : 'CONNECT'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* SnapTrade OAuth modal */}
      {showSnaptradeModal && snaptradeModalBroker && createPortal(
        <div className="modal-overlay" onPointerDown={e => { if (e.target === e.currentTarget) setShowSnaptradeModal(false) }}>
          <div className="pf-modal pf-snaptrade-modal">
            <div className="pf-modal-header">
              <span className="pf-modal-title">Connect {snaptradeModalBroker.name}</span>
              <button className="widget-btn" onClick={() => setShowSnaptradeModal(false)}>✕</button>
            </div>
            <div className="pf-snaptrade-body" onPointerDownCapture={e => e.stopPropagation()}>
              {snaptradeStep === 1 ? (
                <>
                  <div className="pf-snaptrade-broker-display">
                    {snaptradeModalBroker.logoUrl
                      ? <BrokerLogo url={snaptradeModalBroker.logoUrl} name={snaptradeModalBroker.name} />
                      : <span className="pf-snaptrade-broker-icon">{snaptradeModalBroker.icon}</span>}
                    <span className="pf-snaptrade-broker-name">{snaptradeModalBroker.name}</span>
                    <div className="pf-snaptrade-powered">Powered by SnapTrade</div>
                  </div>
                  <div className="pf-bybit-instructions" style={{ width: '100%' }}>
                    <strong>How it works:</strong><br />
                    Click Connect below. You'll be taken to {snaptradeModalBroker.name} to authorize read-only access in a new tab.
                    Return here and click Refresh Holdings when done.
                  </div>
                  <div className="pf-bybit-security-note" style={{ width: '100%' }}>
                    SnapTrade credentials are stored locally to maintain your session. No API keys or passwords are required.
                  </div>
                  {snaptradeError && <div className="pf-bybit-error" style={{ width: '100%' }}>{snaptradeError}</div>}
                  <button className="pf-snaptrade-connect-btn" onClick={handleSnaptradeConnect} disabled={snaptradeLoading}>
                    {snaptradeLoading ? 'CONNECTING…' : `CONNECT ${snaptradeModalBroker.name.toUpperCase()} VIA SNAPTRADE`}
                  </button>
                </>
              ) : (
                <>
                  <div className="pf-snaptrade-step2-msg">
                    <strong>Authorize in the new tab</strong><br />
                    Complete authorization on {snaptradeModalBroker.name}, then return here and click Refresh Holdings.
                  </div>
                  {snaptradeError && <div className="pf-bybit-error" style={{ width: '100%' }}>{snaptradeError}</div>}
                  <button className="pf-snaptrade-connect-btn" onClick={() => fetchSnaptradeHoldings(true)} disabled={snaptradeLoading}>
                    {snaptradeLoading ? 'LOADING…' : '↻ REFRESH HOLDINGS'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

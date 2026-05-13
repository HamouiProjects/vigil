import { useState, useEffect, useCallback } from 'react'
import Widget from './Widget'

const REFRESH_MS = 30_000

// CoinGecko free public API — no key needed
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,solana,pax-gold' +
  '&vs_currencies=usd&include_24hr_change=true'

// Frankfurter — free, no key, maintained by ECB data
const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=EUR&to=USD,GBP'

function fmt(n, decimals = 2) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtChange(n) {
  if (n == null) return { text: '—', dir: '' }
  const text = `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
  return { text, dir: n >= 0 ? 'up' : 'down' }
}

export default function PriceTracker() {
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetch_ = useCallback(async () => {
    try {
      const [cgRes, fxRes] = await Promise.all([
        fetch(COINGECKO_URL),
        fetch(FRANKFURTER_URL),
      ])
      const [cg, fx] = await Promise.all([cgRes.json(), fxRes.json()])

      const rows = [
        {
          ticker: 'BTC/USD',
          value:  fmt(cg.bitcoin?.usd, 0),
          ...fmtChange(cg.bitcoin?.usd_24h_change),
        },
        {
          ticker: 'ETH/USD',
          value:  fmt(cg.ethereum?.usd, 2),
          ...fmtChange(cg.ethereum?.usd_24h_change),
        },
        {
          ticker: 'SOL/USD',
          value:  fmt(cg.solana?.usd, 2),
          ...fmtChange(cg.solana?.usd_24h_change),
        },
        {
          ticker: 'XAU/USD',
          value:  fmt(cg['pax-gold']?.usd, 0),
          ...fmtChange(cg['pax-gold']?.usd_24h_change),
        },
        {
          ticker: 'EUR/USD',
          value:  fmt(fx.rates?.USD, 4),
          text: '—', dir: '',
        },
        {
          ticker: 'EUR/GBP',
          value:  fmt(fx.rates?.GBP, 4),
          text: '—', dir: '',
        },
      ]
      setPrices(rows)
      setError(null)
    } catch (e) {
      setError('Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetch_])

  const badge = loading ? 'LOADING…' : error ? 'ERROR' : 'LIVE'

  return (
    <Widget title="Price Tracker" icon="📈" badge={badge} badgeActive={!error && !loading} onRefresh={fetch_}>
      {error ? (
        <div className="feed-error">{error}</div>
      ) : loading ? (
        <div className="feed-loading">Fetching prices…</div>
      ) : (
        <div className="price-grid">
          {prices.map((p, i) => (
            <div key={i} className="price-cell">
              <span className="price-ticker">{p.ticker}</span>
              <span className="price-value">{p.value}</span>
              <span className={`price-change ${p.dir}`}>{p.text}</span>
            </div>
          ))}
        </div>
      )}
    </Widget>
  )
}

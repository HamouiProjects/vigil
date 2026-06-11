import { GN_SEARCH_URL, KF_DEFAULT_TABS, nsExtractSource, nsCleanTitle } from '../widgets/NewsSearchWidget.jsx'
import { SUGGESTIONS } from '../widgets/RssFeedWidget.jsx'

export async function gatherRoomItems(workspace, { maxSources = 6, perSource = 6 } = {}) {
  if (!workspace?.widgets?.length) return []

  const sources = []
  const directItems = []
  const directSeen = new Set()
  for (const w of workspace.widgets) {
    if (w.type === 'feed') {
      const tabs = w.config?.tabs ?? KF_DEFAULT_TABS
      for (const tab of tabs) {
        sources.push({ label: tab.keyword, url: GN_SEARCH_URL(tab.keyword), kind: 'feed' })
      }
    } else if (w.type === 'rss') {
      for (const f of SUGGESTIONS.slice(0, 6)) {
        sources.push({ label: f.name, url: f.url, kind: 'rss' })
      }
    } else if (w.type === 'browser') {
      for (const a of (w.config?.saved ?? [])) {
        if (!a?.url || !a?.title || directSeen.has(a.url)) continue
        directSeen.add(a.url)
        directItems.push({ source: a.source || '', title: a.title, url: a.url, publishedAt: a.publishedAt ?? null })
      }
    }
  }

  const seen = new Set()
  const deduped = []
  for (const src of sources) {
    if (!src.url || seen.has(src.url)) continue
    seen.add(src.url)
    deduped.push(src)
  }

  const capped = deduped.slice(0, maxSources)

  const results = await Promise.allSettled(
    capped.map(async (src) => {
      const res = await fetch(`/api/rss?url=${encodeURIComponent(src.url)}`, {
        signal: AbortSignal.timeout(12000),
      })
      const data = await res.json()
      const items = (data?.items ?? []).slice(0, perSource)
      return items.map((it) => {
        const isFeed = src.kind === 'feed'
        const outlet = isFeed ? (nsExtractSource(it.title) || src.label) : src.label
        const title = isFeed ? nsCleanTitle(it.title) : it.title
        return {
          source: outlet,
          title,
          url: it.link,
          publishedAt: it.pubDate,
        }
      })
    }),
  )

  const fetchedItems = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)

  return [...directItems, ...fetchedItems]
}

const US_TV_PREFIXES = new Set(['NASDAQ','NYSE','NYSEARCA','AMEX','BATS','BATS_DLY','ARCA','CBOE'])
const HEATMAP_PROXY = {
  sp500:  { label: 'S&P 500', symbol: 'SPY' },
  nasdaq: { label: 'Nasdaq',  symbol: 'QQQ' },
  dow:    { label: 'Dow',     symbol: 'DIA' },
}
function bareUsTicker(tvSymbol) {
  const s = String(tvSymbol || '').trim().toUpperCase()
  if (!s) return null
  if (!s.includes(':')) return /^[A-Z.\-]{1,8}$/.test(s) ? s : null
  const [prefix, ...rest] = s.split(':')
  const ticker = rest.join(':')
  if (!US_TV_PREFIXES.has(prefix)) return null
  return /^[A-Z.\-]{1,8}$/.test(ticker) ? ticker : null
}
export function gatherMarketSymbols(workspace) {
  const out = { symbols: [], heatmaps: [] }
  if (!workspace?.widgets?.length) return out
  const seen = new Set(); const seenHm = new Set()
  for (const w of workspace.widgets) {
    if (w.type === 'chart') {
      const t = bareUsTicker(w.config?.symbol)
      if (t && !seen.has(t)) { seen.add(t); out.symbols.push(t) }
    } else if (w.type === 'prices') {
      for (const s of (w.config?.symbols ?? [])) {
        const t = bareUsTicker(s?.tvSymbol)
        if (t && !seen.has(t)) { seen.add(t); out.symbols.push(t) }
      }
    } else if (w.type === 'heatmap') {
      const key = w.config?.market == null ? 'sp500' : w.config.market
      const proxy = HEATMAP_PROXY[key]
      if (proxy && !seenHm.has(proxy.symbol)) { seenHm.add(proxy.symbol); out.heatmaps.push(proxy) }
    }
  }
  return out
}

const TREND_WINDOW_LABELS = { 'now 7-d': '7 days', 'today 1-m': '30 days', 'today 12-m': '12 months', 'today 5-y': '5 years' }
export function gatherTrendsRequest(workspace) {
  if (!workspace?.widgets?.length) return null
  const w = workspace.widgets.find((x) => x.type === 'trends')
  if (!w) return null
  const cfg = w.config || {}
  let terms = (Array.isArray(cfg.keywords) && cfg.keywords.length) ? cfg.keywords : (cfg.keyword ? [cfg.keyword] : [])
  terms = terms.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 5)
  if (!terms.length) return null
  const window = cfg.time || 'today 12-m'
  return { terms, window, windowLabel: TREND_WINDOW_LABELS[window] || window }
}

import { GN_SEARCH_URL, KF_DEFAULT_TABS, nsExtractSource, nsCleanTitle } from '../widgets/NewsSearchWidget.jsx'
import { SUGGESTIONS } from '../widgets/RssFeedWidget.jsx'
import { PLATFORMS } from '../widgets/SocialFeedWidget.jsx'

async function fetchSourceItems(sources, perSource) {
  const results = await Promise.allSettled(
    sources.map(async (src) => {
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
          excerpt: it.description,
        }
      })
    }),
  )

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
}

export async function gatherRoomItems(workspace, { maxSources = 6, perSource = 6 } = {}) {
  if (!workspace?.widgets?.length) return []

  const groups = []

  for (const w of workspace.widgets) {
    if (w.type === 'feed') {
      const tabs = w.config?.tabs ?? KF_DEFAULT_TABS
      const keywords = tabs.map((t) => t.keyword).filter(Boolean)
      const label = keywords.length ? keywords.join(', ') : 'News Search'
      const primaryKeyword = keywords[0] || 'World'
      const sourceUrl = GN_SEARCH_URL(primaryKeyword)
      const includeInBrief = w.config?.includeInBrief !== false

      const sources = []
      const seen = new Set()
      for (const tab of tabs) {
        const url = GN_SEARCH_URL(tab.keyword)
        if (!url || seen.has(url)) continue
        seen.add(url)
        sources.push({ label: tab.keyword, url, kind: 'feed' })
      }

      const capped = sources.slice(0, maxSources)
      const items = await fetchSourceItems(capped, perSource)
      groups.push({ widgetId: w.id, widgetType: w.type, label, sourceUrl, includeInBrief, items })
    } else if (w.type === 'rss') {
      const includeInBrief = w.config?.includeInBrief !== false
      const sources = []
      const seen = new Set()
      for (const f of SUGGESTIONS.slice(0, 6)) {
        if (!f.url || seen.has(f.url)) continue
        seen.add(f.url)
        sources.push({ label: f.name, url: f.url, kind: 'rss' })
      }

      const items = await fetchSourceItems(sources, perSource)
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'RSS', sourceUrl: null, includeInBrief, items })
    } else if (w.type === 'social') {
      const includeInBrief = w.config?.includeInBrief !== false
      const accounts = w.config?.accounts ?? []
      const sources = []
      const seen = new Set()
      for (const account of accounts) {
        if (account.enabled === false) continue
        const platform = PLATFORMS[account.platform]
        if (!platform) continue
        const url = platform.feedUrl(account.value)
        if (!url || seen.has(url)) continue
        seen.add(url)
        sources.push({ label: account.value, url, kind: 'rss' })
      }
      const items = await fetchSourceItems(sources, perSource)
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'Social', sourceUrl: null, includeInBrief, items })
    } else if (w.type === 'browser') {
      const includeInBrief = w.config?.includeInBrief !== false
      const items = []
      const directSeen = new Set()
      for (const a of (w.config?.saved ?? [])) {
        if (!a?.url || !a?.title || directSeen.has(a.url)) continue
        directSeen.add(a.url)
        items.push({ source: a.source || '', title: a.title, url: a.url, publishedAt: a.publishedAt ?? null, excerpt: a.excerpt || '' })
      }
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'Reader', sourceUrl: null, includeInBrief, items })
    }
  }

  return groups
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
    if (w.config?.includeInBrief === false) continue
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
  if (!w || w.config?.includeInBrief === false) return null
  const cfg = w.config || {}
  let terms = (Array.isArray(cfg.keywords) && cfg.keywords.length) ? cfg.keywords : (cfg.keyword ? [cfg.keyword] : [])
  terms = terms.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 5)
  if (!terms.length) return null
  const window = cfg.time || 'today 12-m'
  return { terms, window, windowLabel: TREND_WINDOW_LABELS[window] || window }
}

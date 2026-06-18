// api/_brief_gather.js — server-side room feed gather for scheduled briefs (T5a.3).
// Mirrors the feed/rss/browser branches of src/lib/gatherRoomItems.js but server-side:
// absolute rss proxy URL, no React. Markets/trends are intentionally excluded.
import { GN_SEARCH_URL, KF_DEFAULT_TABS, nsExtractSource, nsCleanTitle, SUGGESTIONS } from '../src/lib/feedSources.js'

const RSS_BASE = 'https://thevigilroom.com'
const MAX_ITEMS_PER_WIDGET = 40

async function fetchSourceItems(sources, perSource) {
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const res = await fetch(`${RSS_BASE}/api/rss?url=${encodeURIComponent(src.url)}`, { signal: AbortSignal.timeout(12000) })
      const data = await res.json()
      const items = (data?.items ?? []).slice(0, perSource)
      return items.map((it) => {
        const isFeed = src.kind === 'feed'
        const outlet = isFeed ? (nsExtractSource(it.title) || src.label) : src.label
        const title = isFeed ? nsCleanTitle(it.title) : it.title
        return { source: outlet, title, url: it.link, publishedAt: it.pubDate }
      })
    }),
  )
  return results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value)
}

function withinWindow(items, windowMs) {
  if (!windowMs) return items
  const cutoff = Date.now() - windowMs
  return items.filter((it) => {
    if (!it.publishedAt) return true
    const t = new Date(it.publishedAt).getTime()
    return Number.isNaN(t) ? true : t >= cutoff
  })
}

export async function gatherRoomFeedGroups(workspace, { windowMs = 0, maxSources = 6, perSource = 30 } = {}) {
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
      const items = withinWindow(await fetchSourceItems(sources.slice(0, maxSources), perSource), windowMs)
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
      const items = withinWindow(await fetchSourceItems(sources, perSource), windowMs)
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'RSS', sourceUrl: null, includeInBrief, items })
    } else if (w.type === 'browser') {
      const includeInBrief = w.config?.includeInBrief !== false
      const items = []
      const seen = new Set()
      for (const a of (w.config?.saved ?? [])) {
        if (!a?.url || !a?.title || seen.has(a.url)) continue
        seen.add(a.url)
        items.push({ source: a.source || '', title: a.title, url: a.url, publishedAt: a.publishedAt ?? null })
      }
      groups.push({ widgetId: w.id, widgetType: w.type, label: 'Reader', sourceUrl: null, includeInBrief, items: withinWindow(items, windowMs) })
    }
  }
  for (const group of groups) {
    group.items.sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : NaN
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : NaN
      const aFront = Number.isNaN(ta)
      const bFront = Number.isNaN(tb)
      if (aFront && !bFront) return -1
      if (!aFront && bFront) return 1
      if (aFront && bFront) return 0
      return tb - ta
    })
    group.items = group.items.slice(0, MAX_ITEMS_PER_WIDGET)
  }
  return groups
}

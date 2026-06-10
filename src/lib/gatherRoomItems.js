import { GN_SEARCH_URL, KF_DEFAULT_TABS } from '../widgets/NewsSearchWidget.jsx'
import { SUGGESTIONS } from '../widgets/RssFeedWidget.jsx'

export async function gatherRoomItems(workspace, { maxSources = 8, perSource = 10 } = {}) {
  if (!workspace?.widgets?.length) return []

  const sources = []
  for (const w of workspace.widgets) {
    if (w.type === 'feed') {
      const tabs = w.config?.tabs ?? KF_DEFAULT_TABS
      for (const tab of tabs) {
        sources.push({ label: tab.keyword, url: GN_SEARCH_URL(tab.keyword) })
      }
    } else if (w.type === 'rss') {
      for (const f of SUGGESTIONS.slice(0, 6)) {
        sources.push({ label: f.name, url: f.url })
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
      return items.map((it) => ({
        source: src.label,
        title: it.title,
        url: it.link,
        publishedAt: it.pubDate,
      }))
    }),
  )

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
}

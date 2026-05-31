const WAITS = [500, 1200, 2500]

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function isRateLimited(httpStatus, data) {
  if (httpStatus === 429) return true
  if (data?.status === 'error' && /rate|limit|429/i.test(data?.message ?? '')) return true
  return false
}

function buildRss2JsonUrl(feedUrl) {
  let u = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=30`
  if (process.env.RSS2JSON_KEY) u += `&api_key=${process.env.RSS2JSON_KEY}`
  return u
}

async function fetchFeed(feedUrl) {
  const res = await fetch(buildRss2JsonUrl(feedUrl), { signal: AbortSignal.timeout(8000) })
  let data = null
  try { data = await res.json() } catch { /* non-json */ }
  return { httpStatus: res.status, data }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const url = (req.query.url || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ status: 'error', error: 'invalid url', items: [] })
  }

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(WAITS[attempt - 1] + Math.random() * 200)

      const { httpStatus, data } = await fetchFeed(url)
      if (isRateLimited(httpStatus, data)) continue

      if (data?.status === 'ok') {
        return res.status(200).json({
          status: 'ok',
          source: { title: data.feed?.title ?? '', url },
          items: (data.items || []).map(it => ({
            title: it.title,
            link: it.link,
            pubDate: it.pubDate,
            description: it.description ?? '',
            author: it.author ?? '',
          })),
        })
      }

      const errMsg = data?.message ?? (httpStatus !== 200 ? `HTTP ${httpStatus}` : 'fetch failed')
      return res.status(200).json({ status: 'error', error: String(errMsg), items: [] })
    }

    return res.status(429).json({ status: 'rate_limited', items: [] })
  } catch (err) {
    return res.status(200).json({
      status: 'error',
      error: String(err?.message ?? 'fetch failed'),
      items: [],
    })
  }
}

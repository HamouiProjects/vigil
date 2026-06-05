import supabase from './_supabase.js'
import { XMLParser } from 'fast-xml-parser'

const FRESH_MS = 120_000
const MAX_ITEMS = 30

// ---------- rss2json (primary) ----------
function isRateLimited(httpStatus, data) {
  if (httpStatus === 429) return true
  if (data?.status === 'error' && /rate|limit|429/i.test(data?.message ?? '')) return true
  return false
}

function buildRss2JsonUrl(feedUrl) {
  let u = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`
  if (process.env.RSS2JSON_KEY) u += `&api_key=${process.env.RSS2JSON_KEY}&count=${MAX_ITEMS}`
  return u
}

async function fetchViaRss2Json(feedUrl) {
  const res = await fetch(buildRss2JsonUrl(feedUrl), { signal: AbortSignal.timeout(8000) })
  let data = null
  try { data = await res.json() } catch { /* non-json */ }
  return { httpStatus: res.status, data }
}

function mapRss2JsonItems(data) {
  return (data.items || []).map(it => ({
    title: it.title,
    link: it.link,
    pubDate: it.pubDate,
    description: it.description ?? '',
    author: it.author ?? '',
  }))
}

// ---------- direct fetch + parse (fallback) ----------
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
})

const asArray = x => (Array.isArray(x) ? x : x == null ? [] : [x])
const textOf = v => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object') return v['#text'] ?? ''
  return String(v)
}
const stripTags = s => String(s ?? '').replace(/<[^>]*>/g, '').trim()

function atomLink(link) {
  const links = asArray(link)
  const alt = links.find(l => (l?.['@_rel'] ?? 'alternate') === 'alternate') ?? links[0]
  if (!alt) return ''
  return typeof alt === 'string' ? alt : (alt['@_href'] ?? '')
}

function parseFeedXml(xml) {
  const doc = xmlParser.parse(xml)

  if (doc?.rss?.channel) {
    const ch = doc.rss.channel
    return {
      title: textOf(ch.title),
      items: asArray(ch.item).map(it => ({
        title: textOf(it.title),
        link: textOf(it.link),
        pubDate: textOf(it.pubDate) || textOf(it['dc:date']),
        description: stripTags(textOf(it.description) || textOf(it['content:encoded'])),
        author: textOf(it.author) || textOf(it['dc:creator']),
      })),
    }
  }

  if (doc?.feed) {
    const f = doc.feed
    return {
      title: textOf(f.title),
      items: asArray(f.entry).map(e => ({
        title: textOf(e.title),
        link: atomLink(e.link),
        pubDate: textOf(e.published) || textOf(e.updated),
        description: stripTags(textOf(e.summary) || textOf(e.content)),
        author: textOf(e.author?.name) || textOf(e.author),
      })),
    }
  }

  const rdf = doc?.['rdf:RDF'] ?? doc?.RDF
  if (rdf) {
    return {
      title: textOf(rdf.channel?.title),
      items: asArray(rdf.item).map(it => ({
        title: textOf(it.title),
        link: textOf(it.link),
        pubDate: textOf(it['dc:date']) || textOf(it.date),
        description: stripTags(textOf(it.description)),
        author: textOf(it['dc:creator']),
      })),
    }
  }

  return { title: '', items: [] }
}

async function fetchViaDirect(feedUrl) {
  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VigilRSS/1.0; +https://thevigilroom.com)',
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return { ok: false }
  const xml = await res.text()
  const { title, items } = parseFeedXml(xml)
  if (!items.length) return { ok: false }
  return { ok: true, title, items: items.slice(0, MAX_ITEMS) }
}

// ---------- cache + response helpers ----------
function okPayload(url, title, items) {
  return { status: 'ok', source: { title: title ?? '', url }, items }
}

async function cacheWrite(url, title, items) {
  if (!supabase) return
  try {
    await supabase.from('feed_cache').upsert(
      { feed_url: url, title, items, updated_at: new Date().toISOString() },
      { onConflict: 'feed_url' },
    )
  } catch { /* best-effort */ }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const url = (req.query.url || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ status: 'error', error: 'invalid url', items: [] })
  }

  // 1) fresh cache
  let cachedRow = null
  if (supabase) {
    try {
      const { data, error: dbErr } = await supabase
        .from('feed_cache').select('*').eq('feed_url', url).maybeSingle()
      if (!dbErr && data) {
        cachedRow = data
        const age = Date.now() - new Date(data.updated_at).getTime()
        if (age >= 0 && age < FRESH_MS) {
          return res.status(200).json(okPayload(url, data.title, data.items))
        }
      }
    } catch { cachedRow = null }
  }

  let rateLimited = false
  let lastErr = null

  // 2) rss2json (primary)
  try {
    const { httpStatus, data } = await fetchViaRss2Json(url)
    if (data?.status === 'ok') {
      const title = data.feed?.title ?? ''
      const items = mapRss2JsonItems(data)
      await cacheWrite(url, title, items)
      return res.status(200).json(okPayload(url, title, items))
    }
    if (isRateLimited(httpStatus, data)) rateLimited = true
    lastErr = data?.message ?? (httpStatus !== 200 ? `HTTP ${httpStatus}` : 'rss2json failed')
  } catch (e) {
    lastErr = String(e?.message ?? 'rss2json error')
  }

  // 3) direct fetch + parse (works even when rss2json is throttled)
  try {
    const direct = await fetchViaDirect(url)
    if (direct.ok) {
      await cacheWrite(url, direct.title, direct.items)
      return res.status(200).json(okPayload(url, direct.title, direct.items))
    }
  } catch (e) {
    lastErr = String(e?.message ?? 'direct fetch error')
  }

  // 4) both failed -> stale cache, else honest error
  if (cachedRow) return res.status(200).json(okPayload(url, cachedRow.title, cachedRow.items))
  if (rateLimited) return res.status(200).json({ status: 'rate_limited', items: [] })
  return res.status(200).json({ status: 'error', error: String(lastErr ?? 'fetch failed'), items: [] })
}

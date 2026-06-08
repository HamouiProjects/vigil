import supabase from './_supabase.js'
import { safeFetch } from './_ssrf.js'
import { applyCors } from './_cors.js'
import { XMLParser } from 'fast-xml-parser'

const FRESH_MS = 120_000
const MAX_ITEMS = 30

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; VigilRSS/1.0; +https://thevigilroom.com)',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
}

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

function decodeHtmlEntities(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function atomLink(link) {
  const links = asArray(link)
  const alt = links.find(l => (l?.['@_rel'] ?? 'alternate') === 'alternate') ?? links[0]
  if (!alt) return ''
  return typeof alt === 'string' ? alt : (alt['@_href'] ?? '')
}

function rssChannelImage(ch) {
  return textOf(ch.image?.url) || textOf(ch['webfeeds:icon']) || ''
}

function parseFeedXml(xml) {
  const doc = xmlParser.parse(xml)

  if (doc?.rss?.channel) {
    const ch = doc.rss.channel
    return {
      title: textOf(ch.title),
      image: rssChannelImage(ch),
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
      image: textOf(f.icon) || textOf(f.logo) || '',
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
      image: '',
      items: asArray(rdf.item).map(it => ({
        title: textOf(it.title),
        link: textOf(it.link),
        pubDate: textOf(it['dc:date']) || textOf(it.date),
        description: stripTags(textOf(it.description)),
        author: textOf(it['dc:creator']),
      })),
    }
  }

  return { title: '', image: '', items: [] }
}

async function fetchViaDirect(feedUrl) {
  const res = await safeFetch(feedUrl, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return { ok: false }
  const xml = await res.text()
  const { title, image, items } = parseFeedXml(xml)
  if (!items.length) return { ok: false }
  return { ok: true, title, image, items: items.slice(0, MAX_ITEMS) }
}

// ---------- Telegram public channels (t.me/s scrape) ----------
function isTelegramUrl(feedUrl) {
  try {
    const host = new URL(feedUrl).hostname.toLowerCase()
    return host === 't.me' || host === 'telegram.me'
  } catch {
    return false
  }
}

function telegramChannelFromUrl(feedUrl) {
  try {
    let path = new URL(feedUrl).pathname.replace(/^\/+/, '')
    if (path.startsWith('s/')) path = path.slice(2)
    return path.split('/').filter(Boolean)[0] ?? ''
  } catch {
    return ''
  }
}

function metaOgContent(html, prop) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']og:${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']og:${prop}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
  }
  return ''
}

function parseTelegramHtml(html, channel) {
  const channelName = metaOgContent(html, 'title') || channel
  const channelAvatar = metaOgContent(html, 'image') || ''
  const items = []
  const postRe = /data-post="([^"]+)"/g
  const posts = []
  let match
  while ((match = postRe.exec(html)) !== null) {
    posts.push({ post: match[1], start: match.index })
  }

  for (let i = 0; i < posts.length; i++) {
    const chunk = html.slice(posts[i].start, posts[i + 1]?.start ?? html.length)
    const postId = posts[i].post
    const link = `https://t.me/${postId}`

    const timeMatch = chunk.match(/<time[^>]+datetime=["']([^"']+)["']/i)
    const pubDate = timeMatch?.[1] ?? ''

    const textMatch = chunk.match(
      /<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    )
    const text = textMatch ? stripTags(decodeHtmlEntities(textMatch[1])) : ''
    if (!text) continue

    items.push({ title: '', link, pubDate, description: text, author: '' })
  }

  items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
  return {
    title: channelName,
    image: channelAvatar,
    items: items.slice(0, MAX_ITEMS),
  }
}

async function fetchViaTelegram(feedUrl) {
  const channel = telegramChannelFromUrl(feedUrl)
  if (!channel) return { ok: false }

  const res = await fetch(`https://t.me/s/${channel}`, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return { ok: false }

  const html = await res.text()
  const { title, image, items } = parseTelegramHtml(html, channel)
  if (!items.length) return { ok: false }
  return { ok: true, title, image, items }
}

// ---------- cache + response helpers ----------
function okPayload(url, title, items, image) {
  return { status: 'ok', source: { title: title ?? '', url, image: image ?? '' }, items }
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

async function readFeedCache(url) {
  if (!supabase) return { cachedRow: null }
  try {
    const { data, error: dbErr } = await supabase
      .from('feed_cache').select('*').eq('feed_url', url).maybeSingle()
    if (dbErr || !data) return { cachedRow: null }
    const age = Date.now() - new Date(data.updated_at).getTime()
    if (age >= 0 && age < FRESH_MS) {
      return { cachedRow: data, fresh: true }
    }
    return { cachedRow: data, fresh: false }
  } catch {
    return { cachedRow: null }
  }
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const url = (req.query.url || '').trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ status: 'error', error: 'invalid url', items: [] })
  }

  if (isTelegramUrl(url)) {
    const { cachedRow, fresh } = await readFeedCache(url)
    if (fresh && cachedRow) {
      return res.status(200).json(okPayload(url, cachedRow.title, cachedRow.items, ''))
    }

    try {
      const telegram = await fetchViaTelegram(url)
      if (telegram.ok) {
        await cacheWrite(url, telegram.title, telegram.items)
        return res.status(200).json(okPayload(url, telegram.title, telegram.items, telegram.image))
      }
    } catch { /* never throw */ }

    if (cachedRow) return res.status(200).json(okPayload(url, cachedRow.title, cachedRow.items, ''))
    return res.status(200).json({ status: 'error', error: 'telegram fetch failed', items: [] })
  }

  // 1) fresh cache
  const { cachedRow, fresh } = await readFeedCache(url)
  if (fresh && cachedRow) {
    return res.status(200).json(okPayload(url, cachedRow.title, cachedRow.items, ''))
  }

  let rateLimited = false
  let lastErr = null

  // 2) rss2json (primary)
  try {
    const { httpStatus, data } = await fetchViaRss2Json(url)
    if (data?.status === 'ok') {
      const title = data.feed?.title ?? ''
      const image = data.feed?.image ?? ''
      const items = mapRss2JsonItems(data)
      await cacheWrite(url, title, items)
      return res.status(200).json(okPayload(url, title, items, image))
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
      return res.status(200).json(okPayload(url, direct.title, direct.items, direct.image))
    }
  } catch (e) {
    lastErr = String(e?.message ?? 'direct fetch error')
  }

  // 4) both failed -> stale cache, else honest error
  if (cachedRow) return res.status(200).json(okPayload(url, cachedRow.title, cachedRow.items, ''))
  if (rateLimited) return res.status(200).json({ status: 'rate_limited', items: [] })
  return res.status(200).json({ status: 'error', error: String(lastErr ?? 'fetch failed'), items: [] })
}

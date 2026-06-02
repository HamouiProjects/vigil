const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/

function decodeEntities(s) {
  return (s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
}

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i')
    const tag = html.match(re)?.[0]
    if (tag) {
      const c = tag.match(/content=["']([^"']*)["']/i)?.[1]
      if (c) return decodeEntities(c.trim())
    }
  }
  return null
}

function stripToText(htmlFragment) {
  return decodeEntities(
    htmlFragment
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, '')
  ).replace(/\s+/g, ' ').trim()
}

function extractParagraphs(html) {
  // Prefer <article>, else <main>, else whole body
  const scope =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
    html.match(/<body[\s\S]*?<\/body>/i)?.[0] ||
    html
  const rawParas = scope.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []
  const paras = rawParas
    .map(p => stripToText(p))
    .filter(t => t.length >= 40)            // drop nav/caption noise
  // de-dupe consecutive repeats
  const seen = new Set()
  const clean = paras.filter(t => { if (seen.has(t)) return false; seen.add(t); return true })
  return clean
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url parameter' })

  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol))
    return res.status(400).json({ error: 'Only HTTP/HTTPS URLs are supported' })
  if (PRIVATE_HOST.test(parsed.hostname))
    return res.status(400).json({ error: 'Private/local URLs are not allowed' })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok)
      return res.status(response.status).json({ error: `HTTP ${response.status}: ${response.statusText}` })

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain'))
      return res.status(415).json({ error: 'URL does not point to an HTML page' })

    const html = await response.text()

    const ogTitle = metaContent(html, ['og:title', 'twitter:title'])
    const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    const title = ogTitle || (rawTitle ? decodeEntities(rawTitle.trim()) : parsed.hostname)

    const paragraphs = extractParagraphs(html)
    if (!paragraphs.length)
      return res.status(422).json({ error: 'Could not extract article content from this page' })

    const content = paragraphs.map(p => `<p>${p}</p>`).join('')
    const excerpt = paragraphs[0].slice(0, 280)

    return res.status(200).json({
      title,
      byline:        metaContent(html, ['author', 'article:author']),
      siteName:      metaContent(html, ['og:site_name']) || parsed.hostname.replace('www.', ''),
      publishedTime: metaContent(html, ['article:published_time', 'og:published_time']),
      content,
      excerpt,
      leadImage:     metaContent(html, ['og:image', 'twitter:image']),
    })
  } catch (err) {
    clearTimeout(timeout)
    const msg = err.name === 'AbortError' ? 'Request timed out (8s)' : (err.message || 'Failed to fetch article')
    return res.status(500).json({ error: msg })
  }
}

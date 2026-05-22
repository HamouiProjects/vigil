import fetch from 'node-fetch'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'Missing url parameter' })

  let parsed
  try { parsed = new URL(url) } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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
    const dom = new JSDOM(html, { url })
    const doc = dom.window.document

    const article = new Readability(doc).parse()
    if (!article)
      return res.status(422).json({ error: 'Could not extract article content from this page' })

    const leadImage =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      null

    return res.status(200).json({
      title:         article.title         || '',
      byline:        article.byline        || null,
      siteName:      article.siteName      || parsed.hostname.replace('www.', ''),
      publishedTime: article.publishedTime || null,
      content:       article.content       || '',
      excerpt:       article.excerpt       || '',
      leadImage:     leadImage,
    })
  } catch (err) {
    clearTimeout(timeout)
    const msg = err.name === 'AbortError' ? 'Request timed out (8s)' : (err.message || 'Failed to fetch article')
    return res.status(500).json({ error: msg })
  }
}

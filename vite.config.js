import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { safeFetch } from './api/_ssrf.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/

function articleApiPlugin() {
  return {
    name: 'vigil-article-api',
    configureServer(server) {
      server.middlewares.use('/api/fetch-article', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        const params = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
        const url = params.get('url')

        if (!url) {
          res.statusCode = 400
          return res.end(JSON.stringify({ error: 'Missing url parameter' }))
        }

        let parsed
        try { parsed = new URL(url) } catch {
          res.statusCode = 400
          return res.end(JSON.stringify({ error: 'Invalid URL' }))
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) {
          res.statusCode = 400
          return res.end(JSON.stringify({ error: 'Only HTTP/HTTPS URLs are supported' }))
        }

        if (PRIVATE_HOST.test(parsed.hostname)) {
          res.statusCode = 400
          return res.end(JSON.stringify({ error: 'Private/local URLs are not allowed' }))
        }

        try {
          const { Readability } = await import('@mozilla/readability')
          const { JSDOM } = await import('jsdom')

          const response = await safeFetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Cache-Control': 'no-cache',
            },
            signal: AbortSignal.timeout(8000),
          })

          if (!response.ok) {
            res.statusCode = response.status
            return res.end(JSON.stringify({ error: `HTTP ${response.status}: ${response.statusText}` }))
          }

          const html = await response.text()
          const dom = new JSDOM(html, { url })
          const article = new Readability(dom.window.document).parse()

          if (!article) {
            res.statusCode = 422
            return res.end(JSON.stringify({ error: 'Could not extract article content from this page' }))
          }

          res.end(JSON.stringify({
            title:         article.title         || '',
            byline:        article.byline        || null,
            siteName:      article.siteName      || parsed.hostname.replace('www.', ''),
            publishedTime: article.publishedTime || null,
            content:       article.content       || '',
            excerpt:       article.excerpt       || '',
          }))
        } catch (err) {
          const msg = err.name === 'TimeoutError' ? 'Request timed out (8s)'
                    : err.name === 'AbortError'   ? 'Request was aborted'
                    : (err.message || 'Failed to fetch article')
          res.statusCode = 500
          res.end(JSON.stringify({ error: msg }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), articleApiPlugin()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})

import { describe, it, expect } from 'vitest'
import { sanitizeItemLinks } from './rss.js'

// H-1 proof: /api/rss must never emit a non-http(s) per-item link.
describe('sanitizeItemLinks (H-1 stored XSS guard)', () => {
  it('blanks javascript: links', () => {
    const out = sanitizeItemLinks([{ title: 't', link: 'javascript:alert(1)' }])
    expect(out[0].link).toBe('')
  })
  it('blanks data: links', () => {
    const out = sanitizeItemLinks([{ title: 't', link: 'data:text/html,x' }])
    expect(out[0].link).toBe('')
  })
  it('keeps http and https links', () => {
    const items = [{ link: 'https://example.com/a' }, { link: 'http://example.com/b' }]
    expect(sanitizeItemLinks(items).map(i => i.link)).toEqual(['https://example.com/a', 'http://example.com/b'])
  })
  it('tolerates empty links and null items', () => {
    expect(sanitizeItemLinks([{ link: '' }, null])[1]).toBe(null)
    expect(sanitizeItemLinks(undefined)).toEqual([])
  })
})

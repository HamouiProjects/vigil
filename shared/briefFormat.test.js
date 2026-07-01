import { describe, it, expect } from 'vitest'
import { relativeTime, cleanExcerpt, fmtPct, trendGlyph, isHttpUrl, hostnameOf, DEG } from './briefFormat.js'

const DAY = 86400000

describe('relativeTime', () => {
  it('returns null for missing or unparseable input', () => {
    expect(relativeTime(null)).toBe(null)
    expect(relativeTime(undefined)).toBe(null)
    expect(relativeTime('not a date')).toBe(null)
  })

  it('never fabricates a future date beyond one day clock skew', () => {
    expect(relativeTime(Date.now() + 2 * DAY)).toBe(null)
  })

  it('labels the recent past correctly', () => {
    expect(relativeTime(Date.now())).toBe('now')
    expect(relativeTime(Date.now() - 5 * 60000)).toBe('5m')
    expect(relativeTime(Date.now() - 3 * 3600000)).toBe('3h')
    expect(relativeTime(Date.now() - 2 * DAY)).toBe('2d')
    expect(relativeTime(Date.now() - 2 * 7 * DAY)).toBe('2w')
  })

  it('uses mo and y for older dates', () => {
    expect(relativeTime(Date.now() - 100 * DAY)).toMatch(/^\d+mo$/)
    expect(relativeTime(Date.now() - 400 * DAY)).toMatch(/^\d+y$/)
  })
})

describe('cleanExcerpt', () => {
  it('returns null for empty content', () => {
    expect(cleanExcerpt('', 'A title')).toBe(null)
    expect(cleanExcerpt(null, 'A title')).toBe(null)
  })

  it('strips HTML tags and collapses whitespace', () => {
    expect(cleanExcerpt('<p>Hello   world</p>', 'Other')).toBe('Hello world')
  })

  it('decodes entities then strips the revealed tags (nested loop)', () => {
    expect(cleanExcerpt('&lt;b&gt;Hi&lt;/b&gt;', 'Other')).toBe('Hi')
  })

  it('omits the excerpt when it just repeats the title', () => {
    expect(cleanExcerpt('Breaking News!', 'Breaking News')).toBe(null)
  })

  it('omits when the excerpt is the title plus a trivial tail', () => {
    expect(cleanExcerpt('Hello World X', 'Hello World')).toBe(null)
  })

  it('truncates long excerpts with an ellipsis', () => {
    const long = 'word '.repeat(60).trim()
    const out = cleanExcerpt(long, 'Other')
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThan(long.length)
  })
})

describe('fmtPct', () => {
  it('returns empty string for non-finite input', () => {
    expect(fmtPct(undefined)).toBe('')
    expect(fmtPct('x')).toBe('')
    expect(fmtPct(NaN)).toBe('')
  })

  it('coerces null to zero (Number(null) is 0)', () => {
    expect(fmtPct(null)).toBe('0.00%')
  })

  it('signs and fixes to two decimals', () => {
    expect(fmtPct(1.5)).toBe('+1.50%')
    expect(fmtPct(-2)).toBe('-2.00%')
    expect(fmtPct(0)).toBe('0.00%')
  })
})

describe('trendGlyph', () => {
  it('maps direction to an arrow', () => {
    expect(trendGlyph('up')).toBe('↑')
    expect(trendGlyph('down')).toBe('↓')
    expect(trendGlyph('flat')).toBe('→')
    expect(trendGlyph(undefined)).toBe('→')
  })
})

describe('isHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isHttpUrl('https://example.com')).toBe(true)
    expect(isHttpUrl('http://example.com/x')).toBe(true)
  })

  it('rejects non-http schemes and non-strings', () => {
    expect(isHttpUrl('vigil:synthetic-id')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
    expect(isHttpUrl(null)).toBe(false)
    expect(isHttpUrl(42)).toBe(false)
  })
})

describe('hostnameOf', () => {
  it('strips a leading www', () => {
    expect(hostnameOf('https://www.reuters.com/world')).toBe('reuters.com')
    expect(hostnameOf('https://apnews.com/article')).toBe('apnews.com')
  })

  it('returns empty string on unparseable input', () => {
    expect(hostnameOf('not a url')).toBe('')
    expect(hostnameOf(null)).toBe('')
  })
})

describe('DEG', () => {
  it('is the degree sign', () => {
    expect(DEG).toBe('\u00B0')
  })
})

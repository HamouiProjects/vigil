import { describe, it, expect } from 'vitest'
import { relativeTime, cleanExcerpt } from './briefFormat.js'

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

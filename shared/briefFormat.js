// src/lib/briefFormat.js - pure formatting helpers shared by the brief panel,
// PDF, plaintext, and email renderers (client and server). No React, no Node APIs.

const MINUTE = 60000
const HOUR = 3600000
const DAY = 86400000
const WEEK = 7 * DAY
const YEAR = 365 * DAY
const MONTH = YEAR / 12

// Short relative time label (e.g. 'now', '5m', '3h', '2d', '4w', '6mo', '1y').
// Returns null for missing/unparseable input, and for dates more than a one day
// clock-skew tolerance in the future, so we never fabricate a future date.
export function relativeTime(dateish) {
  if (!dateish) return null
  const t = new Date(dateish).getTime()
  if (Number.isNaN(t)) return null
  const diff = Date.now() - t
  if (diff < -DAY) return null
  if (diff < MINUTE) return 'now'
  const m = Math.floor(diff / MINUTE)
  if (m < 60) return `${m}m`
  const h = Math.floor(diff / HOUR)
  if (h < 24) return `${h}h`
  const d = Math.floor(diff / DAY)
  if (d < 7) return `${d}d`
  const w = Math.floor(diff / WEEK)
  if (w < 5) return `${w}w`
  const mo = Math.floor(diff / MONTH)
  if (mo < 12) return `${mo}mo`
  const y = Math.floor(diff / YEAR)
  return `${y}y`
}

const NORM_RE = /[^a-z0-9]/g
function normForCompare(s) {
  return String(s || '').toLowerCase().replace(NORM_RE, '')
}

function decodeEntities(str) {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

// Clean a raw excerpt into a short plain-text paragraph, or null when there is
// nothing worth showing. Decodes entities and strips tags in a loop for
// double-encoded HTML, drops the excerpt when it merely repeats the title, and
// truncates on a word boundary.
export function cleanExcerpt(raw, title) {
  let s = String(raw || '')
  let prev
  do {
    prev = s
    s = decodeEntities(s).replace(/<[^>]*>/g, ' ')
  } while (s !== prev)
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return null

  const ne = normForCompare(s)
  const nt = normForCompare(title)
  if (nt) {
    if (ne === nt) return null
    // Omit when the excerpt is just the title plus a trivial tail (not meaningfully longer).
    if (ne.startsWith(nt) && ne.length <= Math.ceil(nt.length * 1.15)) return null
  }

  if (s.length <= 200) return s
  let cut = s.slice(0, 200)
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > 150) cut = cut.slice(0, lastSpace)
  cut = cut.replace(/[\s.,;:!?]+$/, '')
  return `${cut}…`
}

// Small shared brief formatters, isomorphic (used by the panel, the PDF export,
// and the plaintext path). All pure, no DOM access.
export const DEG = '\u00B0'

export function fmtPct(p) {
  const n = Number(p)
  if (!Number.isFinite(n)) return ''
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%'
}

export function trendGlyph(dir) {
  return dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'
}

export function isHttpUrl(u) {
  if (typeof u !== 'string') return false
  try {
    const p = new URL(u)
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}

export function hostnameOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

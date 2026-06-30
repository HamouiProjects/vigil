// Shared leaf helpers for the api/jobs.js action handlers (split out of jobs.js, no behavior change).
import crypto from 'node:crypto'

function safeEqual(a, b) {
  const ah = crypto.createHash('sha256').update(String(a)).digest()
  const bh = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ah, bh)
}
function isHttpUrl(u) {
  if (typeof u !== 'string') return false
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' } catch { return false }
}
function hostnameOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return null
    }
  }
  return null
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function clamp(str, max) {
  return String(str ?? '').slice(0, max)
}

function isValidSignupEmail(email) {
  if (typeof email !== 'string') return false
  const e = email.trim()
  return e.length >= 3 && e.length <= 254 && e.includes('@') && e.indexOf('@') > 0
}

export { safeEqual, isHttpUrl, hostnameOf, readBody, esc, clamp, isValidSignupEmail }

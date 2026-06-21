import dns from 'node:dns/promises'
import dnscb from 'node:dns'
import net from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

function ipBlocked(ip) {
  const t = net.isIP(ip)
  if (t === 4) {
    const o = ip.split('.').map(Number)
    if (o[0] === 0) return true                                  // 0.0.0.0/8
    if (o[0] === 10) return true                                 // private
    if (o[0] === 127) return true                                // loopback
    if (o[0] === 169 && o[1] === 254) return true                // link-local + cloud metadata
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true    // private
    if (o[0] === 192 && o[1] === 168) return true                // private
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true   // CGNAT
    if (o[0] >= 224) return true                                 // multicast/reserved
    return false
  }
  if (t === 6) {
    const a = ip.toLowerCase()
    if (a === '::1' || a === '::') return true                   // loopback/unspecified
    if (a.startsWith('fe80')) return true                        // link-local
    if (a.startsWith('fc') || a.startsWith('fd')) return true    // ULA
    if (a.startsWith('::ffff:')) return ipBlocked(a.split(':').pop()) // IPv4-mapped
    return false
  }
  return true // not a valid IP literal -> deny
}

// Early clear error before opening a socket. The pinning dispatcher below is the
// actual enforcement (it resolves once and connects to that exact IP).
async function resolvePublic(hostname) {
  let addrs
  try { addrs = await dns.lookup(hostname, { all: true }) }
  catch { throw new Error('DNS resolution failed') }
  if (!addrs.length) throw new Error('No addresses for host')
  for (const { address } of addrs) {
    if (ipBlocked(address)) throw new Error('Blocked private/internal host')
  }
  return addrs
}

// Pinning dispatcher: undici uses THIS lookup as the sole socket resolution, so
// the validated IP is the exact IP connected to. This closes the old
// resolve-then-fetch-resolves-again DNS-rebinding / TOCTOU window (audit M2).
// Validates every redirect hop's host on connect (Host + TLS SNI stay correct
// because undici derives them from the request URL hostname, not the pinned IP).
const pinnedDispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnscb.lookup(hostname, { all: true }, (err, addresses) => {
        if (err) return callback(err)
        if (!addresses || !addresses.length) return callback(new Error('No addresses for host'))
        for (const a of addresses) {
          if (ipBlocked(a.address)) return callback(new Error('Blocked private/internal host'))
        }
        if (options && options.all) return callback(null, addresses)
        const first = addresses[0]
        return callback(null, first.address, first.family)
      })
    }
  }
})

// SSRF-safe fetch: validates protocol + resolved IPs, pins the IP at connect,
// follows redirects MANUALLY and re-validates each hop.
export async function safeFetch(rawUrl, opts = {}, maxRedirects = 5) {
  let url = rawUrl
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP/HTTPS allowed')
    await resolvePublic(parsed.hostname)
    const res = await undiciFetch(url, { ...opts, redirect: 'manual', dispatcher: pinnedDispatcher })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).toString()
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}

// Read a fetch Response body as text, hard-capped at maxBytes, so an oversized
// upstream cannot spike function memory. Streams and stops at the cap.
export async function readTextCapped(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const t = await res.text()
    return t.length > maxBytes ? t.slice(0, maxBytes) : t
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let out = ''
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      out += decoder.decode(value, { stream: true })
    }
    out += decoder.decode()
  } finally {
    try { await reader.cancel() } catch {}
  }
  return out
}

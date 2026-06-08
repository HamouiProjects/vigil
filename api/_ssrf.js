import dns from 'node:dns/promises'
import net from 'node:net'

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

async function assertPublicHost(hostname) {
  let addrs
  try { addrs = await dns.lookup(hostname, { all: true }) } // getaddrinfo normalizes decimal/hex/octal IP forms
  catch { throw new Error('DNS resolution failed') }
  if (!addrs.length) throw new Error('No addresses for host')
  for (const { address } of addrs) {
    if (ipBlocked(address)) throw new Error('Blocked private/internal host')
  }
}

// SSRF-safe fetch: validates protocol + resolved IPs, follows redirects MANUALLY and re-validates each hop.
export async function safeFetch(rawUrl, opts = {}, maxRedirects = 5) {
  let url = rawUrl
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP/HTTPS allowed')
    await assertPublicHost(parsed.hostname)
    const res = await fetch(url, { ...opts, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).toString()
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}

import supabase from './_supabase.js'
import { applyCors } from './_cors.js'
import { buildFeedBrief, normalizeWidgetGroups } from './_brief_core.js'
import { gatherRoomFeedGroups } from './_brief_gather.js'
import { resolveEntitlements } from '../src/entitlements/resolve.js'
import { safeFetch, readTextCapped } from './_ssrf.js'
import { rateLimit } from './_ratelimit.js'
import { fetchBriefLLM } from './_brief_llm.js'
import { searchSymbols } from './symbol-search.js'
import { relativeTime, cleanExcerpt } from '../src/lib/briefFormat.js'
import crypto from 'node:crypto'
import Stripe from 'stripe'

const stripeForDelete = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

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

function sanitizeBriefItem(it) {
  return {
    source: clamp(it?.source, 80),
    title: clamp(it?.title, 200),
    url: isHttpUrl(it?.url) ? it.url : null,
    publishedAt: typeof it?.publishedAt === 'string' ? it.publishedAt : null,
    excerpt: clamp(it?.excerpt, 300),
  }
}

function sanitizeBrief(brief) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
  const dirOk = (d) => (d === 'up' || d === 'down' || d === 'flat') ? d : 'flat'
  const m = brief.markets
  const markets = (m && typeof m === 'object') ? {
    asOf: String(m.asOf ?? ''),
    rows: Array.isArray(m.rows) ? m.rows.slice(0, 40).map((r) => ({ symbol: clamp(r.symbol, 16), name: clamp(r.name, 80), price: num(r.price), changePct: num(r.changePct), dir: dirOk(r.dir), currency: r.currency ? clamp(String(r.currency), 8) : null })) : [],
    heatmaps: Array.isArray(m.heatmaps) ? m.heatmaps.slice(0, 10).map((h) => ({ label: clamp(h.label, 40), symbol: clamp(h.symbol, 16), changePct: num(h.changePct), dir: dirOk(h.dir) })) : [],
  } : null
  const tr = brief.trends
  const trends = (tr && typeof tr === 'object' && Array.isArray(tr.terms)) ? {
    window: String(tr.window ?? ''),
    windowLabel: clamp(tr.windowLabel, 40),
    asOf: String(tr.asOf ?? ''),
    terms: tr.terms.slice(0, 5).map((t) => ({ term: clamp(t.term, 80), value: num(t.value), dir: dirOk(t.dir) })),
  } : null
  const weather = (brief.weather && Array.isArray(brief.weather.locations)) ? {
    locations: brief.weather.locations.slice(0, 8).map((l) => ({
      name: clamp(l.name, 80),
      tempC: num(l.tempC),
      feelsC: num(l.feelsC),
      condition: clamp(l.condition, 40),
      windKph: num(l.windKph),
      humidity: num(l.humidity),
      todayMaxC: num(l.todayMaxC),
      todayMinC: num(l.todayMinC),
      tomorrowMaxC: num(l.tomorrowMaxC),
      tomorrowMinC: num(l.tomorrowMinC),
      tomorrowCondition: clamp(l.tomorrowCondition, 40),
    })),
  } : null
  return {
    headline: clamp(brief.headline, 300),
    sections: (brief.sections ?? []).slice(0, 20).map((section) => ({
      label: clamp(section?.label, 120),
      status: section?.status === 'no_update' ? 'no_update' : 'update',
      summary: clamp(section?.summary, 2000),
      sourceUrl: isHttpUrl(section?.sourceUrl) ? section.sourceUrl : null,
      widgetType: String(section?.widgetType ?? ''),
      parts: Array.isArray(section?.parts) ? section.parts.slice(0, 12).map((p) => ({
        label: clamp(p?.label, 120),
        items: Array.isArray(p?.items) ? p.items.slice(0, 18).map(sanitizeBriefItem) : [],
      })) : undefined,
      items: Array.isArray(section?.items) ? section.items.slice(0, 18).map(sanitizeBriefItem) : [],
    })),
    markets,
    trends,
    weather,
  }
}

function countUpdateSections(sections) {
  return sections.filter((s) => s.status === 'update').length
}

function renderEmailItemHtml(item) {
  const title = String(item.title || '').trim()
  const excerpt = cleanExcerpt(item.excerpt, item.title)
  const outlet = (item.source || '').trim() || hostnameOf(item.url)
  const date = relativeTime(item.publishedAt)
  let html = `<div style="margin:0 0 14px;">`
  if (title) html += `<div style="font-size:14px;font-weight:bold;color:#1a1a1a;margin:0 0 3px;">${esc(title)}</div>`
  if (excerpt) html += `<p style="margin:0 0 4px;font-size:14px;color:#6b7280;line-height:1.5;">${esc(excerpt)}</p>`
  let meta = ''
  if (isHttpUrl(item.url)) {
    meta += `<a href="${esc(item.url)}" style="color:#1d4ed8;text-decoration:none;">${esc(outlet)}</a>`
  } else if (outlet) {
    meta += `<span style="color:#6b7280;">${esc(outlet)}</span>`
  }
  if (date) {
    if (meta) meta += `<span style="color:#9ca3af;">&nbsp;&middot;&nbsp;</span>`
    meta += `<span style="color:#6b7280;">${esc(date)}</span>`
  }
  if (meta) html += `<div style="font-size:13px;">${meta}</div>`
  html += `</div>`
  return html
}

function appendEmailItemTextLines(lines, item, indent = '  ') {
  const title = String(item.title || '').trim()
  if (title) lines.push(indent + title)
  const excerpt = cleanExcerpt(item.excerpt, item.title)
  if (excerpt) lines.push(indent + excerpt)
  const outlet = (item.source || '').trim() || hostnameOf(item.url)
  const date = relativeTime(item.publishedAt)
  const metaBits = []
  if (outlet) metaBits.push(outlet)
  if (date) metaBits.push(date)
  if (typeof item.url === 'string' && item.url) metaBits.push(item.url)
  if (metaBits.length) lines.push(indent + metaBits.join('  '))
  lines.push('')
}

function renderEmailHtml({ brief, roomName, preparedFor, generatedAt }) {
  const room = esc(clamp(roomName, 120) || 'Risk Room')
  const prep = clamp(preparedFor, 120)
  const genAt = generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString()
  const n = countUpdateSections(brief.sections)
  const nWord = n === 1 ? 'source' : 'sources'

  let html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;max-width:640px;">
<img src="https://thevigilroom.com/email-logo.png" alt="Vigil" width="120" style="display:block;margin:0 0 16px;" />
<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">
<div style="font-size:18px;font-weight:bold;color:#1a1a1a;">${room}</div>
<div style="font-size:12px;color:#6b7280;margin-top:4px;">Generated ${esc(genAt)} . ${n} ${nWord}</div>`
  if (prep) {
    html += `<div style="font-size:13px;color:#4b5563;margin-top:6px;">Prepared for ${esc(prep)}</div>`
  }
  html += `</div>
<h1 style="font-size:16px;font-weight:bold;color:#1a1a1a;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">${esc(brief.headline)}</h1>`

  for (const section of brief.sections) {
    html += `<h2 style="font-size:13px;font-weight:bold;color:#1a1a1a;margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.06em;">${esc(section.label)}</h2>`
    if (section.parts?.length) {
      for (const part of section.parts) {
        html += `<div style="font-size:12px;font-weight:bold;color:#374151;margin:10px 0 6px;">${esc(part.label)}</div>`
        if (part.items?.length) {
          for (const item of part.items) html += renderEmailItemHtml(item)
        } else {
          html += `<p style="margin:0 0 10px;font-size:13px;color:#9ca3af;">No update this round</p>`
        }
      }
      continue
    }
    if (section.items?.length) {
      for (const item of section.items) html += renderEmailItemHtml(item)
      continue
    }
    if (section.status === 'no_update') {
      html += `<p style="margin:0 0 12px;font-size:14px;">No update from ${esc(section.label)}</p>`
    } else {
      html += `<p style="margin:0 0 12px;font-size:14px;">${esc(section.summary)} `
      if (isHttpUrl(section.sourceUrl)) {
        html += `<a href="${esc(section.sourceUrl)}" style="color:#1d4ed8;text-decoration:none;">${esc(section.label)}</a>`
      }
      html += '</p>'
    }
  }

  if (brief.markets && (brief.markets.rows.length || brief.markets.heatmaps.length)) {
    const g = '#0A6B43', rd = '#AE2E27', mut = '#6b7280'
    const cell = (p, dir) => { const c = dir === 'up' ? g : dir === 'down' ? rd : mut; const s = p > 0 ? '+' : ''; return `<span style="color:${c};">${s}${Number(p).toFixed(2)}%</span>` }
    html += `<h2 style="font-size:13px;font-weight:bold;color:#1a1a1a;margin:16px 0 4px;text-transform:uppercase;letter-spacing:0.06em;">Markets</h2>`
    html += `<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">as of last refresh</div>`
    html += `<table style="border-collapse:collapse;font-size:14px;margin-bottom:12px;">`
    for (const row of brief.markets.rows) html += `<tr><td style="padding:2px 14px 2px 0;font-weight:bold;">${esc(row.symbol)}</td><td style="padding:2px 14px 2px 0;color:#4b5563;">${esc(row.name)}</td><td style="padding:2px 14px 2px 0;">${esc(String(row.price))}${row.currency ? ' ' + esc(row.currency) : ''}</td><td style="padding:2px 0;">${cell(row.changePct, row.dir)}</td></tr>`
    for (const h of brief.markets.heatmaps) html += `<tr><td style="padding:2px 14px 2px 0;font-weight:bold;">${esc(h.label)}</td><td style="padding:2px 14px 2px 0;color:#4b5563;">(${esc(h.symbol)})</td><td></td><td style="padding:2px 0;">${cell(h.changePct, h.dir)}</td></tr>`
    html += `</table>`
  }

  if (brief.trends && brief.trends.terms.length) {
    const glyph = (d) => d === 'up' ? '&#8593;' : d === 'down' ? '&#8595;' : '&#8594;'
    html += `<h2 style="font-size:13px;font-weight:bold;color:#1a1a1a;margin:16px 0 4px;text-transform:uppercase;letter-spacing:0.06em;">Search Interest</h2>`
    html += `<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">relative search interest${brief.trends.windowLabel ? ` over the last ${esc(brief.trends.windowLabel)}` : ''}, not volume</div>`
    html += `<table style="border-collapse:collapse;font-size:14px;margin-bottom:12px;">`
    for (const t of brief.trends.terms) html += `<tr><td style="padding:2px 14px 2px 0;font-weight:bold;">${esc(t.term)}</td><td style="padding:2px 14px 2px 0;">${esc(String(t.value))}</td><td style="padding:2px 0;color:#4b5563;">${glyph(t.dir)}</td></tr>`
    html += `</table>`
  }

  if (brief.weather && brief.weather.locations && brief.weather.locations.length) {
    html += `<h2 style="font-size:13px;font-weight:bold;color:#1a1a1a;margin:16px 0 4px;text-transform:uppercase;letter-spacing:0.06em;">Weather</h2>`
    for (const l of brief.weather.locations) {
      html += `<div style="font-size:14px;color:#1a1a1a;margin-bottom:8px;">`
      html += `<div style="font-weight:bold;">${esc(l.name)}</div>`
      html += `<div>${esc(String(l.tempC))}\u00B0C, feels ${esc(String(l.feelsC))}\u00B0C, ${esc(l.condition)}. Wind ${esc(String(l.windKph))} km/h, humidity ${esc(String(l.humidity))}%.</div>`
      if (l.todayMaxC != null) html += `<div style="color:#6b7280;">Today ${esc(String(l.todayMaxC))}\u00B0 / ${esc(String(l.todayMinC))}\u00B0. Tomorrow ${esc(String(l.tomorrowMaxC))}\u00B0 / ${esc(String(l.tomorrowMinC))}\u00B0, ${esc(l.tomorrowCondition)}.</div>`
      html += `</div>`
    }
  }

  html += `<p style="font-size:12px;color:#6b7280;margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;">Vigil tracks, it does not verify.</p>
</body></html>`
  return html
}

function renderEmailText({ brief, roomName, preparedFor, generatedAt }) {
  const room = clamp(roomName, 120) || 'Risk Room'
  const prep = clamp(preparedFor, 120)
  const genAt = generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString()
  const n = countUpdateSections(brief.sections)
  const nWord = n === 1 ? 'source' : 'sources'
  const lines = [room, `Generated ${genAt} . ${n} ${nWord}`]
  if (prep) lines.push(`Prepared for ${prep}`)
  lines.push('', brief.headline, '')

  for (const section of brief.sections) {
    lines.push(section.label)
    if (section.parts?.length) {
      for (const part of section.parts) {
        lines.push(`  ${part.label}`)
        if (part.items?.length) {
          for (const item of part.items) appendEmailItemTextLines(lines, item, '    ')
        } else {
          lines.push('    No update this round')
          lines.push('')
        }
      }
      continue
    }
    if (section.items?.length) {
      for (const item of section.items) appendEmailItemTextLines(lines, item, '  ')
      continue
    }
    if (section.status === 'no_update') {
      lines.push(`No update from ${section.label}`)
    } else if (section.summary?.trim()) {
      lines.push(section.summary)
    }
    lines.push('')
  }

  if (brief.markets && (brief.markets.rows.length || brief.markets.heatmaps.length)) {
    lines.push('Markets (as of last refresh)', '')
    for (const row of brief.markets.rows) lines.push(`- ${row.symbol}  ${row.price}${row.currency ? ' ' + row.currency : ''}  ${row.changePct > 0 ? '+' : ''}${Number(row.changePct).toFixed(2)}%`)
    for (const h of brief.markets.heatmaps) lines.push(`- ${h.label} (${h.symbol})  ${h.changePct > 0 ? '+' : ''}${Number(h.changePct).toFixed(2)}%`)
    lines.push('')
  }

  if (brief.trends && brief.trends.terms.length) {
    const g = (d) => d === 'up' ? '↑' : d === 'down' ? '↓' : '→'
    lines.push(`Search interest (relative, not volume${brief.trends.windowLabel ? `, last ${brief.trends.windowLabel}` : ''})`, '')
    for (const t of brief.trends.terms) lines.push(`- ${t.term}  ${t.value}  ${g(t.dir)}`)
    lines.push('')
  }

  if (brief.weather && brief.weather.locations && brief.weather.locations.length) {
    lines.push('', 'WEATHER', '')
    for (const l of brief.weather.locations) {
      lines.push(l.name)
      lines.push(`  ${l.tempC}\u00B0C, feels ${l.feelsC}\u00B0C, ${l.condition}. Wind ${l.windKph} km/h, humidity ${l.humidity}%.`)
      if (l.todayMaxC != null) lines.push(`  Today ${l.todayMaxC}\u00B0 / ${l.todayMinC}\u00B0. Tomorrow ${l.tomorrowMaxC}\u00B0 / ${l.tomorrowMinC}\u00B0, ${l.tomorrowCondition}.`)
    }
  }

  lines.push('Vigil tracks, it does not verify.')
  return lines.join('\n')
}

async function handleEmailBrief(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!supabase) return res.status(503).json({ error: 'SUPABASE_UNAVAILABLE' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })
  if (user.is_anonymous === true) return res.status(403).json({ error: 'EMAIL_REQUIRES_ACCOUNT' })
  if (!user.email) return res.status(400).json({ error: 'NO_EMAIL' })

  const rl = await rateLimit(req, 'email-brief', 5, 3600, user.id)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const body = readBody(req)
  if (!body) return res.status(400).json({ error: 'invalid body' })

  const { brief: rawBrief, roomName, preparedFor, generatedAt } = body
  if (
    !rawBrief
    || typeof rawBrief !== 'object'
    || typeof rawBrief.headline !== 'string'
    || !Array.isArray(rawBrief.sections)
  ) {
    return res.status(400).json({ error: 'INVALID_BRIEF' })
  }

  const brief = sanitizeBrief(rawBrief)
  const safeRoom = clamp(roomName, 120)
  const safePrepared = clamp(preparedFor, 120)
  const html = renderEmailHtml({
    brief,
    roomName: safeRoom,
    preparedFor: safePrepared,
    generatedAt,
  })
  const text = renderEmailText({
    brief,
    roomName: safeRoom,
    preparedFor: safePrepared,
    generatedAt,
  })

  const key = process.env.RESEND_API_KEY
  if (!key) return res.status(503).json({ error: 'EMAIL_NOT_CONFIGURED' })

  const subject = safeRoom ? `Your Vigil brief: ${safeRoom}` : 'Your Vigil brief'

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vigil <brief@thevigilroom.com>',
        to: [user.email],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[jobs] resend non-2xx', resp.status, errText.slice(0, 300))
      return res.status(502).json({
        error: 'EMAIL_PROVIDER_ERROR',
        providerStatus: resp.status,
      })
    }

    return res.status(200).json({ sent: true })
  } catch (err) {
    console.error('[jobs] resend send failed', err?.message)
    return res.status(502).json({ error: 'EMAIL_PROVIDER_ERROR' })
  }
}

// --- alert dispatch (Phase-2 sprint 2) ---
const GN_SEARCH = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
const outletOf = (t) => { const p = String(t ?? '').split(' - '); return p.length > 1 ? p[p.length - 1].trim() : '' }
const titleOf = (t) => { const p = String(t ?? '').split(' - '); return p.length > 1 ? p.slice(0, -1).join(' - ').trim() : String(t ?? '') }

// Priority color for document/plain-text surfaces (email/telegram/webhook do not follow the app theme).
// Fixed hexes mirror the in-app semantic tokens: high=error, low=muted, normal=warning.
function emailSeverityHex(sev) {
  if (sev === 'high') return '#AE2E27'
  if (sev === 'low') return '#6b7280'
  return '#6F4D08'
}
function severityCircle(sev) {
  if (sev === 'high') return '🔴'
  if (sev === 'low') return '⚪'
  return '🟠'
}

function renderAlertEmailHtml({ keyword, region, items, severity }) {
  const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${emailSeverityHex(severity)};margin-right:8px;vertical-align:middle;"></span>`
  const ctx = `${region ? `in ${esc(region)} . ` : ''}${items.length} new ${items.length === 1 ? 'item' : 'items'}`
  let html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;max-width:640px;">
<img src="https://thevigilroom.com/email-logo.png" alt="Vigil" width="120" style="display:block;margin:0 0 16px;" />
<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">
<div style="font-size:16px;font-weight:bold;color:#1a1a1a;">${dot}${esc(keyword)}</div>
<div style="font-size:13px;color:#4b5563;margin-top:4px;">${ctx}</div>
</div>`
  for (const it of items) {
    const label = esc(it.source || 'Source')
    html += `<div style="margin:0 0 14px;">`
    html += `<div style="font-size:14px;font-weight:bold;color:#1a1a1a;margin:0 0 3px;">${esc(it.title || '')}</div>`
    if (isHttpUrl(it.url)) html += `<div style="font-size:13px;"><a href="${esc(it.url)}" style="color:#1d4ed8;text-decoration:none;">${label}</a></div>`
    else html += `<div style="font-size:13px;color:#6b7280;">${label}</div>`
    html += `</div>`
  }
  html += `<p style="font-size:12px;color:#6b7280;margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;">Vigil tracks, it does not verify. You are receiving this because you set an alert in Vigil.</p>
</body></html>`
  return html
}

function renderAlertEmailText({ keyword, region, items }) {
  const scope = region ? ` in ${region}` : ''
  const lines = [`New items matching your alert: ${keyword}${scope}`, '']
  for (const it of items) lines.push(`- ${it.title || it.url} (${it.source || 'Source'}) ${it.url || ''}`.trim())
  lines.push('', 'Vigil tracks, it does not verify.')
  return lines.join('\n')
}

async function fetchMatches(keyword, region) {
  const base = 'https://thevigilroom.com'
  const q = region ? `${keyword} ${region}` : keyword
  let json = null
  let httpStatus = 0
  try {
    const r = await fetch(`${base}/api/rss?url=${encodeURIComponent(GN_SEARCH(q))}`, { signal: AbortSignal.timeout(10000) })
    httpStatus = r.status
    json = await r.json().catch(() => null)
  } catch (e) {
    console.error('[alert-dispatch] rss fetch threw', e?.message)
    return []
  }
  if (!json || json.status !== 'ok' || !Array.isArray(json.items)) {
    console.error('[alert-dispatch] rss not ok', { httpStatus, status: json?.status, items: Array.isArray(json?.items) ? json.items.length : null })
    return []
  }
  const out = []
  for (const it of json.items.slice(0, 12)) {
    const url = it.link || ''
    if (!url) continue
    out.push({ url, title: titleOf(it.title), source: outletOf(it.title) || it.author || '' })
  }
  return out
}

async function sendAlertEmail(to, keyword, region, items, severity) {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const scope = region ? ` in ${region}` : ''
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Vigil Alerts <brief@thevigilroom.com>',
        to: [to],
        subject: `New items matching "${keyword}"${scope}`,
        html: renderAlertEmailHtml({ keyword, region, items, severity }),
        text: renderAlertEmailText({ keyword, region, items }),
      }),
      signal: AbortSignal.timeout(30000),
    })
    return resp.ok
  } catch { return false }
}

async function sendAlertWebhook(webhookUrl, keyword, region, items, severity) {
  const scope = region ? ` in ${region}` : ''
  const head = `${severityCircle(severity)} *${keyword}*${scope}\n${items.length} new ${items.length === 1 ? 'item' : 'items'}`
  const lines = items.slice(0, 10).map((it) => {
    const title = it.title || ''
    const source = it.source || 'Source'
    return isHttpUrl(it.url) ? `• ${title} <${it.url}|${source}>` : `• ${title}`
  })
  const text = `${head}\n\n${lines.join('\n')}\n\nVigil tracks, it does not verify.`
  try {
    const resp = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    })
    return resp.ok
  } catch (e) {
    console.error('[alert-dispatch] webhook post failed', e?.message)
    return false
  }
}

// Telegram parse_mode 'HTML' only needs &, <, > escaped (applies to text and href values alike).
function escTelegram(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderAlertTelegramText(keyword, region, items, severity) {
  const scope = region ? ` in ${escTelegram(region)}` : ''
  const head = `${severityCircle(severity)} <b>${escTelegram(keyword)}</b>${scope}\n${items.length} new ${items.length === 1 ? 'item' : 'items'}`
  const footer = '\n\nVigil tracks, it does not verify.'
  const maxLen = 4096
  const blocks = []
  for (const it of items) {
    const title = escTelegram(it.title || '')
    const source = escTelegram(it.source || 'Source')
    const link = isHttpUrl(it.url) ? `<a href="${escTelegram(it.url)}">${source}</a>` : source
    const block = `${title}\n${link}`
    const candidate = head + '\n\n' + [...blocks, block].join('\n\n') + footer
    if (candidate.length > maxLen) break
    blocks.push(block)
  }
  const body = blocks.length ? '\n\n' + blocks.join('\n\n') : ''
  return head + body + footer
}

async function sendAlertTelegram(chatId, alert, items) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return false
  const text = renderAlertTelegramText(alert.keyword, alert.region, items, alert.severity)
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    })
    return resp.ok
  } catch (e) {
    console.error('[alert-dispatch] telegram send failed', e?.message)
    return false
  }
}

async function sendTelegramPlain(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return false
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000),
    })
    return resp.ok
  } catch (e) {
    console.error('[telegram-webhook] send failed', e?.message)
    return false
  }
}

// Stable short digest for synthetic alert urls (keeps re-detection suppressed by the alert_events unique constraint).
function hashShort(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16)
}

// Ported verbatim from src/widgets/AtlasWorldGlobe.jsx (handles holes + MultiPolygon). Do not import from a jsx file.
function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const hit = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
    if (hit) inside = !inside
  }
  return inside
}

function pointInGeometry(lng, lat, geometry) {
  if (!geometry) return false
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates
    : geometry.type === 'Polygon' ? [geometry.coordinates] : []
  for (const poly of polys) {
    if (!poly?.[0]?.length) continue
    if (!pointInRing(lng, lat, poly[0])) continue
    let inHole = false
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lng, lat, poly[h])) { inHole = true; break }
    }
    if (!inHole) return true
  }
  return false
}

// Flatten a user's rooms into a bounded flat list of curated items (computed once per user per run). Alerts carry
// no workspace_id (Hard Rule 14), so this spans ALL the user's rooms. Bounded to 120 items total.
async function gatherUserRoomItems(rooms) {
  const out = []
  for (const room of (rooms || [])) {
    if (out.length >= 120) break
    let groups
    try {
      groups = await gatherRoomFeedGroups({ widgets: room.widgets }, { windowMs: 24 * 60 * 60 * 1000 })
    } catch (e) {
      console.error('[alert-dispatch] room gather failed', e?.message)
      continue
    }
    for (const g of (groups || [])) {
      const groupItems = Array.isArray(g?.parts)
        ? g.parts.flatMap((p) => (Array.isArray(p?.items) ? p.items : []))
        : (Array.isArray(g?.items) ? g.items : [])
      for (const it of groupItems) {
        const url = it?.url || it?.link || ''
        if (!url) continue
        out.push({ url, title: String(it?.title || ''), source: String(it?.source || '') })
        if (out.length >= 120) break
      }
      if (out.length >= 120) break
    }
  }
  return out
}

// Match a freeform region to a Natural Earth country geometry: exact name first, then contains/contained-by.
// No match (e.g. "Taiwan Strait") yields null, so no Atlas items are emitted, which is correct and honest.
function resolveCountryGeometry(region, countriesFeatures) {
  const target = String(region || '').trim().toLowerCase()
  if (!target) return null
  const namesOf = (f) => [f?.properties?.NAME, f?.properties?.ADMIN, f?.properties?.NAME_EN, f?.properties?.NAME_LONG]
    .filter((n) => typeof n === 'string' && n)
  for (const f of (countriesFeatures || [])) {
    if (namesOf(f).some((n) => n.toLowerCase() === target)) return f.geometry
  }
  for (const f of (countriesFeatures || [])) {
    if (namesOf(f).some((n) => { const ln = n.toLowerCase(); return ln.includes(target) || target.includes(ln) })) return f.geometry
  }
  return null
}

async function runAlertMatch() {
  if (!supabase) return { error: 'SUPABASE_UNAVAILABLE', status: 503 }

  const { data: rules, error: rulesErr } = await supabase
    .from('alerts')
    .select('id, user_id, keyword, region, channels, webhook_url, severity, snoozed_until')
    .eq('active', true)
    .order('id', { ascending: true })
    .limit(40)
  if (rulesErr) return { error: 'DB_ERROR', status: 500 }

  const userCache = new Map()
  let matched = 0
  let emailed = 0
  let posted = 0
  let telegramSent = 0

  // Atlas layers are global, not per-rule: fetch + memoize once so all 40 rules share one fetch each.
  // Each degrades to [] on any failure. Server-side self-calls target the public apex (Hard Rule 6).
  let _conflict, _wildfire, _countries
  const fetchGeoFeatures = async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) })
      const j = await r.json().catch(() => null)
      return Array.isArray(j?.features) ? j.features : []
    } catch (e) {
      console.error('[alert-dispatch] geo fetch failed', url, e?.message)
      return []
    }
  }
  const getConflict = async () => { if (_conflict === undefined) _conflict = await fetchGeoFeatures('https://thevigilroom.com/api/geo?source=conflict'); return _conflict }
  const getWildfire = async () => { if (_wildfire === undefined) _wildfire = await fetchGeoFeatures('https://thevigilroom.com/api/geo?source=firms'); return _wildfire }
  const getCountries = async () => { if (_countries === undefined) _countries = await fetchGeoFeatures('https://thevigilroom.com/ne_110m_admin_0_countries.geojson'); return _countries }

  for (const rule of (rules || [])) {
    let u = userCache.get(rule.user_id)
    if (!u) {
      const { data: ud } = await supabase.auth.admin.getUserById(rule.user_id)
      const { data: sub } = await supabase.from('subscriptions').select('plan, status, add_ons').eq('user_id', rule.user_id).maybeSingle()
      const ent = resolveEntitlements(sub?.plan ?? 'free', sub?.add_ons ?? [], sub?.status ?? null)
      u = {
        email: ud?.user?.email || '',
        plan: ent.plan,
        canAlert: ent.capabilities.has('alerts'),
        canWebhook: ent.capabilities.has('alerts_webhook'),
        notifyAlertEmail: ud?.user?.user_metadata?.notify_alert_email !== false,
        telegramChatId: ud?.user?.user_metadata?.telegram_chat_id ? String(ud.user.user_metadata.telegram_chat_id) : null,
      }
      // Load all of the user's rooms once (alerts span every room, Hard Rule 14), then flatten their curated
      // items a single time per user per run so the per-rule loop only keyword-matches the cached result.
      const { data: rooms } = await supabase.from('workspaces').select('id, widgets').eq('user_id', rule.user_id)
      u.rooms = rooms || []
      u.roomItems = await gatherUserRoomItems(u.rooms)
      userCache.set(rule.user_id, u)
    }
    if (!u.canAlert) continue

    // Skip rules under an active snooze; they auto-resume once snoozed_until passes.
    if (rule.snoozed_until && new Date(rule.snoozed_until).getTime() > Date.now()) continue

    // Google News floor (existing source layer).
    const merged = await fetchMatches(rule.keyword, rule.region)

    // B(i) Whole-room match: keep cached curated items whose title contains the keyword (case-insensitive
    // substring). The room is already the user's curated scope, so region is NOT required for these.
    const kw = String(rule.keyword || '').trim().toLowerCase()
    if (kw && u.roomItems?.length) {
      for (const it of u.roomItems) {
        if (String(it.title || '').toLowerCase().includes(kw)) merged.push({ url: it.url, title: it.title, source: it.source })
      }
    }

    // B(ii) Atlas conflict + wildfire events inside the rule's region (only when region is a non-empty string).
    if (typeof rule.region === 'string' && rule.region.trim()) {
      const geometry = resolveCountryGeometry(rule.region, await getCountries())
      if (geometry) {
        let cCount = 0
        for (const f of await getConflict()) {
          if (cCount >= 10) break
          const coords = f?.geometry?.coordinates
          if (!Array.isArray(coords)) continue
          if (!pointInGeometry(coords[0], coords[1], geometry)) continue
          const p = f.properties || {}
          merged.push({
            url: `vigil:conflict:${p.url ? hashShort(p.url) : `${coords[0]},${coords[1]}`}`,
            title: `Reported conflict near ${p.place || rule.region}${p.kind ? ` (${p.kind})` : ''}`,
            source: 'GDELT 2.0',
          })
          cCount++
        }
        let wCount = 0
        for (const f of await getWildfire()) {
          if (wCount >= 10) break
          const coords = f?.geometry?.coordinates
          if (!Array.isArray(coords)) continue
          if (!pointInGeometry(coords[0], coords[1], geometry)) continue
          const p = f.properties || {}
          merged.push({
            url: `vigil:wildfire:${coords[0]},${coords[1]},${p.acq_date},${p.acq_time}`,
            title: `Wildfire detection near ${rule.region}${Number(p.frp) ? ` (${Math.round(Number(p.frp))} MW)` : ''}`,
            source: 'NASA FIRMS',
          })
          wCount++
        }
      }
    }

    // Dedup the merged source layers by url before the upsert. Synthetic vigil: urls are stable, so the existing
    // alert_events unique constraint suppresses re-detection exactly like real article urls.
    const byUrl = new Map()
    for (const it of merged) {
      if (!it?.url || byUrl.has(it.url)) continue
      byUrl.set(it.url, it)
    }
    const items = Array.from(byUrl.values())
    if (!items.length) continue

    const rows = items.map((it) => ({
      alert_id: rule.id,
      user_id: rule.user_id,
      item_url: it.url,
      item_title: it.title,
      source: it.source,
    }))
    const { data: inserted, error: insErr } = await supabase
      .from('alert_events')
      .upsert(rows, { onConflict: 'alert_id,item_url', ignoreDuplicates: true })
      .select('item_url, item_title, source')
    if (insErr) { console.error('[alert-dispatch] upsert error', insErr?.message); continue }
    const fresh = inserted || []
    if (!fresh.length) continue
    matched += fresh.length

    const channels = Array.isArray(rule.channels) ? rule.channels : []
    const mapped = fresh.map((f) => ({ url: f.item_url, title: f.item_title, source: f.source }))
    if (channels.includes('email') && u.email && u.notifyAlertEmail) {
      const sent = await sendAlertEmail(u.email, rule.keyword, rule.region, mapped, rule.severity)
      if (sent) emailed += 1
    }
    if (u.canWebhook && rule.webhook_url && (channels.includes('webhook') || channels.includes('slack'))) {
      const ok = await sendAlertWebhook(rule.webhook_url, rule.keyword, rule.region, mapped, rule.severity)
      if (ok) posted += 1
    }
    if (channels.includes('telegram') && u.telegramChatId) {
      const sent = await sendAlertTelegram(u.telegramChatId, { keyword: rule.keyword, region: rule.region, severity: rule.severity }, mapped)
      if (sent) telegramSent += 1
    }
  }

  console.log('[alert-dispatch]', JSON.stringify({ rules: (rules || []).length, matched, emailed, posted, telegramSent }))

  return { ok: true, rules: (rules || []).length, matched, emailed, posted, telegramSent }
}

async function handleAlertDispatch(req, res) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization || ''
  if (!secret || !safeEqual(authHeader, `Bearer ${secret}`)) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const result = await runAlertMatch()
  if (result.error) return res.status(result.status).json({ error: result.error })

  const sched = await dispatchScheduledBriefs().catch((e) => { console.error('[scheduled-brief] dispatch threw', e?.message); return { due: 0, sent: 0, capped: 0, skipped: 0 } })

  await cleanupStaleRows()

  return res.status(200).json({ ok: true, rules: result.rules, matched: result.matched, emailed: result.emailed, posted: result.posted, telegramSent: result.telegramSent, scheduledBriefs: sched })
}

async function handleAlertPoll(req, res) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization || ''
  if (!secret || !safeEqual(authHeader, `Bearer ${secret}`)) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const result = await runAlertMatch()
  if (result.error) return res.status(result.status).json({ error: result.error })

  return res.status(200).json({ ok: true, rules: result.rules, matched: result.matched, emailed: result.emailed, posted: result.posted, telegramSent: result.telegramSent })
}

const TELEGRAM_BOT_USERNAME = 'TheVigilRoom_alerts_bot'
const TGLINK_CACHE_TTL_MS = 15 * 60 * 1000
const TGLINK_TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

function mintTgLinkToken() {
  const bytes = crypto.randomBytes(32)
  let token = ''
  for (let i = 0; i < bytes.length; i++) {
    token += TGLINK_TOKEN_CHARS[bytes[i] % TGLINK_TOKEN_CHARS.length]
  }
  return token.slice(0, 48)
}

function tgLinkCacheKey(token) {
  return `tglink:${token}`
}

async function tgLinkCacheRead(key) {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('feed_cache').select('*').eq('feed_url', key).maybeSingle()
    if (!data) return null
    const age = Date.now() - new Date(data.updated_at).getTime()
    if (age >= 0 && age < TGLINK_CACHE_TTL_MS) return data.items
    return null
  } catch { return null }
}

async function tgLinkCacheWrite(key, payload) {
  if (!supabase) return
  try {
    await supabase.from('feed_cache').upsert(
      { feed_url: key, title: 'tglink', items: payload, updated_at: new Date().toISOString() },
      { onConflict: 'feed_url' },
    )
  } catch { /* best-effort */ }
}

async function tgLinkCacheDelete(key) {
  if (!supabase) return
  try {
    await supabase.from('feed_cache').delete().eq('feed_url', key)
  } catch { /* best-effort */ }
}

async function handleTelegramLinkStart(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  if (!supabase) return res.status(503).json({ error: 'SUPABASE_UNAVAILABLE' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const rl = await rateLimit(req, 'telegram-link', 10, 60, user.id)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'RATE_LIMITED' })
  }

  const linkToken = mintTgLinkToken()
  await tgLinkCacheWrite(tgLinkCacheKey(linkToken), { user_id: user.id })
  const deepLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${linkToken}`
  return res.status(200).json({ deepLink })
}

async function handleTelegramWebhook(req, res) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const headerSecret = req.headers['x-telegram-bot-api-secret-token'] || ''
  if (!secret || !safeEqual(headerSecret, secret)) return res.status(401).json({ error: 'UNAUTHORIZED' })

  try {
    const update = readBody(req)
    const text = update?.message?.text
    const chatId = update?.message?.chat?.id
    if (typeof text !== 'string' || chatId == null) return res.status(200).json({ ok: true })

    const m = text.match(/^\/start (\S+)$/)
    if (!m) return res.status(200).json({ ok: true })

    const linkToken = m[1]
    const cacheKey = tgLinkCacheKey(linkToken)
    const cached = await tgLinkCacheRead(cacheKey)
    if (!cached?.user_id) return res.status(200).json({ ok: true })

    const userId = cached.user_id
    const { data: ud } = await supabase.auth.admin.getUserById(userId)
    const existingMeta = ud?.user?.user_metadata ?? {}
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...existingMeta, telegram_chat_id: String(chatId) },
    })
    await tgLinkCacheDelete(cacheKey)
    await sendTelegramPlain(chatId, 'Vigil is connected. Your keyword alerts will arrive here.')
  } catch (e) {
    console.error('[telegram-webhook] processing error', e?.message)
  }

  return res.status(200).json({ ok: true })
}

async function handleDeleteAccount(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!supabase) return res.status(503).json({ error: 'SUPABASE_UNAVAILABLE' })

  const rl = await rateLimit(req, 'delete-account', 3, 60)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const body = readBody(req)
  if (!body || body.confirm !== 'DELETE') return res.status(400).json({ error: 'CONFIRM_REQUIRED' })

  const uid = user.id

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', uid)
    .maybeSingle()

  const stripeCustomerId = sub?.stripe_customer_id || null

  const tables = ['brief_schedules', 'alert_events', 'alerts', 'briefs', 'sources', 'workspaces', 'subscriptions']
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', uid)
    if (error) {
      console.error('[delete-account] delete error', table, error.message)
      return res.status(500).json({ error: 'DB_ERROR', stage: table })
    }
  }

  try {
    await supabase
      .from('feed_cache')
      .delete()
      .like('feed_url', 'tglink:%')
      .eq('items->>user_id', uid)
  } catch (e) {
    console.error('[delete-account] tglink purge failed', e?.message)
  }

  if (user.email) {
    const { error: esErr } = await supabase
      .from('email_signups')
      .delete()
      .ilike('email', user.email)
    if (esErr) {
      console.error('[delete-account] email_signups delete error', esErr.message)
      return res.status(500).json({ error: 'DB_ERROR', stage: 'email_signups' })
    }
  }

  if (stripeCustomerId && stripeForDelete) {
    try {
      await stripeForDelete.customers.del(stripeCustomerId)
    } catch (e) {
      console.error('[delete-account] stripe customer delete failed', e?.message)
    }
  }

  const { error: authDelErr } = await supabase.auth.admin.deleteUser(uid)
  if (authDelErr) {
    console.error('[delete-account] auth delete error', authDelErr.message)
    return res.status(500).json({ error: 'AUTH_DELETE_FAILED' })
  }

  return res.status(200).json({ ok: true })
}

async function handleEmailSignup(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!supabase) return res.status(503).json({ error: 'SUPABASE_UNAVAILABLE' })

  const rl = await rateLimit(req, 'email-signup', 3, 60)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const body = readBody(req)
  if (!body) return res.status(400).json({ error: 'invalid body' })

  const { email, source } = body
  if (!isValidSignupEmail(email)) return res.status(400).json({ error: 'INVALID_EMAIL' })

  const normalizedEmail = email.trim().toLowerCase()
  const safeSource = clamp(source, 120) || 'landing'

  const { error: insErr } = await supabase
    .from('email_signups')
    .insert({ email: normalizedEmail, source: safeSource })

  if (insErr?.code === '23505') {
    const { data: existing, error: selErr } = await supabase
      .from('email_signups')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle()
    if (selErr || !existing?.id) {
      console.error('[email-signup] conflict lookup error', selErr?.message || insErr.message)
      return res.status(500).json({ error: 'DB_ERROR' })
    }
    const { error: updErr } = await supabase
      .from('email_signups')
      .update({ source: safeSource })
      .eq('id', existing.id)
    if (updErr) {
      console.error('[email-signup] update error', updErr.message)
      return res.status(500).json({ error: 'DB_ERROR' })
    }
  } else if (insErr) {
    console.error('[email-signup] insert error', insErr.message)
    return res.status(500).json({ error: 'DB_ERROR' })
  }

  return res.status(200).json({ ok: true })
}

async function handleContact(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const rl = await rateLimit(req, 'contact', 5, 60)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'rate_limited' })
  }

  const body = readBody(req)
  if (!body) return res.status(400).json({ error: 'INVALID' })

  const { name, email, message } = body
  const trimmedName = String(name ?? '').trim()
  const trimmedEmail = typeof email === 'string' ? email.trim() : ''
  const trimmedMessage = String(message ?? '').trim()

  if (!trimmedName || !isValidSignupEmail(trimmedEmail) || !trimmedMessage) {
    return res.status(400).json({ error: 'INVALID' })
  }

  const safeName = clamp(trimmedName, 200)
  const safeEmail = trimmedEmail
  const safeMessage = clamp(trimmedMessage, 4000)

  const key = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_TO
  if (!key || !to) {
    console.error('[jobs] contact misconfigured: RESEND_API_KEY or CONTACT_TO unset')
    return res.status(500).json({ error: 'CONTACT_UNAVAILABLE' })
  }

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
<p><strong>Name:</strong> ${esc(safeName)}</p>
<p><strong>Email:</strong> ${esc(safeEmail)}</p>
<p><strong>Message:</strong></p>
<p style="white-space:pre-wrap;">${esc(safeMessage)}</p>
</body></html>`
  const text = `Name: ${safeName}\nEmail: ${safeEmail}\n\nMessage:\n${safeMessage}`

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vigil <brief@thevigilroom.com>',
        to: [to],
        reply_to: safeEmail,
        subject: 'Vigil contact: ' + safeName,
        html,
        text,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[jobs] contact resend non-2xx', resp.status, errText.slice(0, 300))
      return res.status(502).json({ error: 'SEND_FAILED' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[jobs] contact resend send failed', err?.message)
    return res.status(502).json({ error: 'SEND_FAILED' })
  }
}

async function cleanupStaleRows() {
  if (!supabase) return

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: rlRows, error: rlErr } = await supabase
      .from('rate_limits')
      .delete()
      .lt('window_start', oneDayAgo)
      .select('bucket')
    if (rlErr) {
      console.error('[cleanup] rate_limits delete error', rlErr.message)
    } else {
      console.log('[cleanup] rate_limits deleted', rlRows?.length ?? 0)
    }
  } catch (err) {
    console.error('[cleanup] rate_limits delete threw', err?.message)
  }

  try {
    const { data: fcRows, error: fcErr } = await supabase
      .from('feed_cache')
      .delete()
      .lt('updated_at', sevenDaysAgo)
      .select('feed_url')
    if (fcErr) {
      console.error('[cleanup] feed_cache delete error', fcErr.message)
    } else {
      console.log('[cleanup] feed_cache deleted', fcRows?.length ?? 0)
    }
  } catch (err) {
    console.error('[cleanup] feed_cache delete threw', err?.message)
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: aeRows, error: aeErr } = await supabase
      .from('alert_events')
      .delete()
      .lt('matched_at', thirtyDaysAgo)
      .select('id')
    if (aeErr) {
      console.error('[cleanup] alert_events delete error', aeErr.message)
    } else {
      console.log('[cleanup] alert_events deleted', aeRows?.length ?? 0)
    }
  } catch (err) {
    console.error('[cleanup] alert_events delete threw', err?.message)
  }
}

const SCHED_WINDOW_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
}
function nextRunAtFrom(cadence, from) {
  const f = from instanceof Date ? from : new Date(from)
  if (cadence === 'weekly') return new Date(f.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  return new Date(f.getTime() + 24 * 60 * 60 * 1000).toISOString()
}
async function sendScheduledBriefEmail(to, roomName, html, text) {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  const subject = roomName ? `Your Vigil brief: ${roomName}` : 'Your Vigil brief'
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Vigil <brief@thevigilroom.com>', to: [to], subject, html, text }),
      signal: AbortSignal.timeout(30000),
    })
    if (!resp.ok) { console.error('[scheduled-brief] resend non-2xx', resp.status); return false }
    return true
  } catch (e) { console.error('[scheduled-brief] resend threw', e?.message); return false }
}
async function dispatchScheduledBriefs() {
  if (!supabase) return { due: 0, sent: 0, capped: 0, skipped: 0 }
  const nowIso = new Date().toISOString()
  const { data: schedules, error: schErr } = await supabase
    .from('brief_schedules')
    .select('id, user_id, workspace_id, cadence, channel')
    .eq('active', true)
    .lte('next_run_at', nowIso)
    .limit(50)
  if (schErr) { console.error('[scheduled-brief] schedules query error', schErr.message); return { due: 0, sent: 0, capped: 0, skipped: 0 } }

  const userCache = new Map()
  let sent = 0, capped = 0, skipped = 0
  const due = (schedules || []).length

  for (const s of (schedules || [])) {
    let u = userCache.get(s.user_id)
    if (!u) {
      const { data: ud } = await supabase.auth.admin.getUserById(s.user_id)
      const { data: sub } = await supabase.from('subscriptions').select('plan, status, add_ons').eq('user_id', s.user_id).maybeSingle()
      const ent = resolveEntitlements(sub?.plan ?? 'free', sub?.add_ons ?? [], sub?.status ?? null)
      u = {
        email: ud?.user?.email || '',
        canSchedule: ent.capabilities.has('scheduled_briefs'),
        cap: ent.limits.briefsPerMonth ?? resolveEntitlements('free').limits.briefsPerMonth,
        notifyBriefEmail: ud?.user?.user_metadata?.notify_brief_email !== false,
      }
      userCache.set(s.user_id, u)
    }
    if (!u.canSchedule) { skipped += 1; continue }

    const { data: ws, error: wsErr } = await supabase
      .from('workspaces').select('id, name, widgets').eq('id', s.workspace_id).eq('user_id', s.user_id).maybeSingle()
    if (wsErr || !ws) { skipped += 1; continue }

    let cleaned
    try {
      const windowMs = SCHED_WINDOW_MS[s.cadence] ?? SCHED_WINDOW_MS.daily
      const raw = await gatherRoomFeedGroups({ widgets: ws.widgets }, { windowMs })
      const normalized = normalizeWidgetGroups(raw)
      const included = normalized.filter((g) => g.includeInBrief !== false)
      const contentGroups = included.filter((g) => g.items.length > 0)
      cleaned = await buildFeedBrief({ included, contentGroups })
    } catch (e) {
      console.error('[scheduled-brief] build failed', s.id, e?.code || e?.message)
      skipped += 1
      continue
    }

    const { data: briefId, error: insErr } = await supabase.rpc('brief_insert_capped', {
      p_user: s.user_id,
      p_workspace: s.workspace_id,
      p_content: cleaned,
      p_period: s.cadence,
      p_cap: u.cap,
    })
    if (insErr) { console.error('[scheduled-brief] insert error', s.id, insErr.message); skipped += 1; continue }

    const advance = nextRunAtFrom(s.cadence, new Date())

    if (!briefId) {
      capped += 1
      await supabase.from('brief_schedules').update({ last_run_at: nowIso, next_run_at: advance }).eq('id', s.id)
      continue
    }

    if (s.channel === 'email' && u.email && u.notifyBriefEmail) {
      const safeBrief = sanitizeBrief(cleaned)
      const html = renderEmailHtml({ brief: safeBrief, roomName: ws.name, preparedFor: '', generatedAt: nowIso })
      const text = renderEmailText({ brief: safeBrief, roomName: ws.name, preparedFor: '', generatedAt: nowIso })
      const ok = await sendScheduledBriefEmail(u.email, clamp(ws.name, 120), html, text)
      if (ok) sent += 1
    }

    await supabase.from('brief_schedules').update({ last_run_at: nowIso, next_run_at: advance }).eq('id', s.id)
  }

  console.log('[scheduled-brief]', JSON.stringify({ due, sent, capped, skipped }))
  return { due, sent, capped, skipped }
}

// --- Suggest Sources (slice 1a: RSS Google News floor) ---
const SUGGEST_CACHE_TTL_MS = 86_400_000 // 24h
const SUGGEST_MAX_REGIONS = 6
const SUGGEST_MAX_RSS = 8
const SUGGEST_MAX_SYMBOLS = 8
const SUGGEST_MAX_SOCIAL = 8
const SUGGEST_DISCLAIMER = 'These are suggestions of publicly available sources, not verified or endorsed by Vigil, and not a substitute for your own due diligence.'
const DISCOVERY_MAX_OUTBOUND = 36
const DISCOVERY_MAINSTREAM_ATTEMPT = 7
const DISCOVERY_LOCAL_ATTEMPT = 4
const DISCOVERY_OUTLET_CONCURRENCY = 3
const DISCOVERY_HOMEPAGE_TIMEOUT_MS = 8000
const DISCOVERY_HTML_CAP_BYTES = 524288
const DISCOVERY_LLM_DOMAINS = 6
const DISCOVERY_LLM_GLOBAL_MAX = 60
// Run-deadline guard. jobs.js maxDuration is 60s. Soft: discovery stops launching new
// outbound at this elapsed time so the function never hard-times-out. Hard: past this, the
// floor returns its Google News rows without validating, to guarantee a never-empty result.
const SUGGEST_RUN_BUDGET_MS = 42000
const SUGGEST_FLOOR_DEADLINE_MS = 52000
const COMMON_FEED_PATHS = ['/feed', '/feed/', '/rss', '/rss.xml', '/atom.xml', '/feed.xml', '/feeds/posts/default']

// Region to (Google News hl language, gl country). Localized floor only where we have a confident pair.
// EU/Europe and any unmapped region fall through to the English umbrella feed below. Promote to feedSources.js when a second consumer needs it.
const REGION_MAP = {
  'congo': { hl: 'fr', gl: 'CD' }, 'drc': { hl: 'fr', gl: 'CD' }, 'dr congo': { hl: 'fr', gl: 'CD' },
  'eastern congo': { hl: 'fr', gl: 'CD' }, 'goma': { hl: 'fr', gl: 'CD' }, 'kivu': { hl: 'fr', gl: 'CD' }, 'm23': { hl: 'fr', gl: 'CD' },
  'mali': { hl: 'fr', gl: 'ML' }, 'burkina faso': { hl: 'fr', gl: 'BF' }, 'niger': { hl: 'fr', gl: 'NE' }, 'sahel': { hl: 'fr', gl: 'ML' },
  'taiwan': { hl: 'zh-TW', gl: 'TW' }, 'taiwan strait': { hl: 'zh-TW', gl: 'TW' }, 'china': { hl: 'zh-CN', gl: 'CN' },
  'ukraine': { hl: 'uk', gl: 'UA' }, 'russia': { hl: 'ru', gl: 'RU' }, 'germany': { hl: 'de', gl: 'DE' }, 'france': { hl: 'fr', gl: 'FR' },
}

// starter seeds, swap for spec Appendix B
const SEED_MAINSTREAM = ['reuters.com', 'apnews.com', 'bbc.com', 'aljazeera.com', 'theguardian.com', 'france24.com', 'dw.com']
const SEED_LOCAL_CONGO = ['actualite.cd', 'radiookapi.net', 'rfi.fr', 'jeuneafrique.com']
const SEED_LOCAL_SAHEL = ['rfi.fr', 'jeuneafrique.com', 'africanews.com']
const SEED_LOCAL_TAIWAN = ['taipeitimes.com', 'focustaiwan.tw', 'taiwannews.com.tw']
const SEED_LOCAL_CHINA = ['scmp.com', 'caixinglobal.com', 'chinadaily.com.cn']
const SEED_LOCAL_UKRAINE = ['kyivindependent.com', 'pravda.com.ua']
const SEED_LOCAL_GERMANY = ['dw.com', 'spiegel.de']
const SEED_LOCAL_FRANCE = ['lemonde.fr', 'france24.com']
const SEED_LOCAL = {
  'congo': SEED_LOCAL_CONGO, 'drc': SEED_LOCAL_CONGO, 'dr congo': SEED_LOCAL_CONGO,
  'eastern congo': SEED_LOCAL_CONGO, 'goma': SEED_LOCAL_CONGO, 'kivu': SEED_LOCAL_CONGO, 'm23': SEED_LOCAL_CONGO,
  'mali': SEED_LOCAL_SAHEL, 'burkina faso': SEED_LOCAL_SAHEL, 'niger': SEED_LOCAL_SAHEL, 'sahel': SEED_LOCAL_SAHEL,
  'taiwan': SEED_LOCAL_TAIWAN, 'taiwan strait': SEED_LOCAL_TAIWAN,
  'china': SEED_LOCAL_CHINA,
  'ukraine': SEED_LOCAL_UKRAINE,
  'germany': SEED_LOCAL_GERMANY,
  'france': SEED_LOCAL_FRANCE,
}

function gnCeid(hl, gl) { return gl + ':' + hl.split('-')[0] }
function gnRssUrl(q, hl, gl) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=' + hl + '&gl=' + gl + '&ceid=' + encodeURIComponent(gnCeid(hl, gl))
}
function gnHtmlUrl(q, hl, gl) {
  return 'https://news.google.com/search?q=' + encodeURIComponent(q) + '&hl=' + hl + '&gl=' + gl + '&ceid=' + encodeURIComponent(gnCeid(hl, gl))
}

function suggestCacheKey(topics, regions, widgetTypes) {
  const norm = arr => [...new Set((arr || []).map(s => String(s).trim().toLowerCase()).filter(Boolean))].sort()
  const payload = JSON.stringify({ t: norm(topics), r: norm(regions), w: norm(widgetTypes) })
  return 'suggest:' + crypto.createHash('sha256').update(payload).digest('hex').slice(0, 40)
}
async function suggestCacheRead(key) {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('feed_cache').select('*').eq('feed_url', key).maybeSingle()
    if (!data) return null
    const age = Date.now() - new Date(data.updated_at).getTime()
    if (age >= 0 && age < SUGGEST_CACHE_TTL_MS) return data.items
    return null
  } catch { return null }
}
async function suggestCacheWrite(key, payload) {
  if (!supabase) return
  try {
    await supabase.from('feed_cache').upsert(
      { feed_url: key, title: 'suggest-sources', items: payload, updated_at: new Date().toISOString() },
      { onConflict: 'feed_url' },
    )
  } catch { /* best-effort */ }
}

// Validate a feed through our own rss proxy (the same path the live widgets use), so validate-time matches run-time.
async function suggestFeedHasItems(feedUrl) {
  try {
    const res = await fetch('https://thevigilroom.com/api/rss?url=' + encodeURIComponent(feedUrl), { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data?.items) && data.items.length > 0
  } catch { return false }
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

function sanitizeDomain(raw) {
  if (raw == null) return null
  let s = String(raw).trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '')
  const slash = s.indexOf('/')
  if (slash >= 0) s = s.slice(0, slash)
  const q = s.indexOf('?')
  if (q >= 0) s = s.slice(0, q)
  const hash = s.indexOf('#')
  if (hash >= 0) s = s.slice(0, hash)
  s = s.trim()
  if (!s || s.includes(' ')) return null
  return DOMAIN_RE.test(s) ? s : null
}

function dedupDomains(domains) {
  const seen = new Set()
  const out = []
  for (const d of domains) {
    if (!d || seen.has(d)) continue
    seen.add(d)
    out.push(d)
  }
  return out
}

async function budgetedFeedCheck(feedUrl, budget) {
  if (budget.deadlineAt && Date.now() >= budget.deadlineAt) return false
  if (budget.left <= 0) return false
  budget.left -= 1
  return suggestFeedHasItems(feedUrl)
}

function extractFeedLinkCandidates(html, homepage) {
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i)
  const searchIn = headMatch ? headMatch[0] : html
  const candidates = []
  const linkRe = /<link\b[^>]*>/gi
  let m
  while ((m = linkRe.exec(searchIn)) !== null) {
    const tag = m[0]
    const relMatch = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)
    const typeMatch = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!hrefMatch) continue
    const rel = (relMatch?.[1] || '').toLowerCase()
    const type = (typeMatch?.[1] || '').toLowerCase()
    const isFeed = rel.includes('feed')
      || (rel.includes('alternate') && (type.includes('rss') || type.includes('atom')))
    if (!isFeed) continue
    try {
      candidates.push(new URL(hrefMatch[1], homepage).href)
    } catch { /* skip invalid href */ }
    if (candidates.length >= 3) break
  }
  return candidates
}

async function discoverOutletFeed(domain, budget) {
  const homepage = 'https://' + domain + '/'
  try {
    if (budget.left > 0 && !(budget.deadlineAt && Date.now() >= budget.deadlineAt)) {
      budget.left -= 1
      const res = await safeFetch(homepage, { signal: AbortSignal.timeout(DISCOVERY_HOMEPAGE_TIMEOUT_MS) })
      const html = await readTextCapped(res, DISCOVERY_HTML_CAP_BYTES)
      const candidates = extractFeedLinkCandidates(html, homepage)
      for (const feedUrl of candidates) {
        if (await budgetedFeedCheck(feedUrl, budget)) return feedUrl
      }
    }
  } catch { /* homepage fetch failure, continue to path probes */ }

  for (const path of COMMON_FEED_PATHS) {
    if (budget.left <= 0) break
    if (budget.deadlineAt && Date.now() >= budget.deadlineAt) break
    const feedUrl = 'https://' + domain + path
    if (await budgetedFeedCheck(feedUrl, budget)) return feedUrl
  }
  return null
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx], idx)
    }
  }
  const n = Math.min(concurrency, items.length)
  if (n > 0) await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

function collectMatchedRegionKeys(regions) {
  const regionList = (regions || []).map(s => String(s).trim()).filter(Boolean)
  const matched = []
  for (const region of regionList.slice(0, SUGGEST_MAX_REGIONS)) {
    const key = region.toLowerCase()
    if (REGION_MAP[key] && !matched.includes(key)) matched.push(key)
  }
  return matched
}

async function buildRssDiscovery(topics, regions, req, softDeadlineAt) {
  const topicQ = (topics || []).map(s => String(s).trim()).filter(Boolean).join(' ')
  const matchedKeys = collectMatchedRegionKeys(regions)
  const budget = { left: DISCOVERY_MAX_OUTBOUND, deadlineAt: softDeadlineAt }

  let llmMainstream = []
  let llmLocal = []
  const llm = await rateLimit(req, 'suggest-llm', DISCOVERY_LLM_GLOBAL_MAX, 3600, 'global')
  if (llm.allowed) {
    try {
      const topicStr = (topics || []).map(s => String(s).trim()).filter(Boolean).join(', ')
      const regionStr = (regions || []).map(s => String(s).trim()).filter(Boolean).join(', ')
      const raw = await fetchBriefLLM({
        system: 'You suggest news outlet domains for risk monitoring. Given topics and regions, return well-known international mainstream outlet domains and credible local or regional outlet domains. Return STRICT JSON exactly {"mainstream":["domain.tld",...],"local":["domain.tld",...]}. Bare domains only, no protocol, no paths, no prose, no markdown.',
        user: 'Topics: ' + topicStr + '\nRegions: ' + regionStr,
      })
      const parsed = JSON.parse(raw)
      llmMainstream = Array.isArray(parsed?.mainstream) ? parsed.mainstream : []
      llmLocal = Array.isArray(parsed?.local) ? parsed.local : []
    } catch {
      llmMainstream = []
      llmLocal = []
    }
  }

  const llmMainSan = llmMainstream.map(sanitizeDomain).filter(Boolean)
  const llmLocSan = llmLocal.map(sanitizeDomain).filter(Boolean)
  let llmSlots = DISCOVERY_LLM_DOMAINS
  const llmMainTaken = llmMainSan.slice(0, llmSlots)
  llmSlots -= llmMainTaken.length
  const llmLocTaken = llmLocSan.slice(0, llmSlots)

  const mainstreamDomains = dedupDomains([
    ...SEED_MAINSTREAM.map(sanitizeDomain).filter(Boolean),
    ...llmMainTaken,
  ]).slice(0, DISCOVERY_MAINSTREAM_ATTEMPT)

  const localSeedDomains = []
  for (const key of matchedKeys) {
    const seeds = SEED_LOCAL[key]
    if (seeds) localSeedDomains.push(...seeds)
  }
  const localDomains = dedupDomains([
    ...localSeedDomains.map(sanitizeDomain).filter(Boolean),
    ...llmLocTaken,
  ]).slice(0, DISCOVERY_LOCAL_ATTEMPT)

  const firstMatched = matchedKeys[0]
  const gnLoc = firstMatched ? REGION_MAP[firstMatched] : null
  const gnHl = gnLoc?.hl ?? 'en-US'
  const gnGl = gnLoc?.gl ?? 'US'

  const mainstreamRows = []
  const mainstreamResults = await mapWithConcurrency(mainstreamDomains, DISCOVERY_OUTLET_CONCURRENCY, async (domain) => {
    const feedUrl = await discoverOutletFeed(domain, budget)
    if (feedUrl) {
      return {
        widgetType: 'rss', tier: 'mainstream', verificationBasis: 'none',
        label: domain, value: feedUrl, sourceLink: 'https://' + domain + '/',
      }
    }
    if (budget.left <= 0) return null
    const q = 'site:' + domain + (topicQ ? ' ' + topicQ : '')
    const gnFeed = gnRssUrl(q, gnHl, gnGl)
    if (await budgetedFeedCheck(gnFeed, budget)) {
      return {
        widgetType: 'rss', tier: 'manufactured', verificationBasis: 'none',
        label: domain, value: gnFeed, sourceLink: gnHtmlUrl(q, gnHl, gnGl),
      }
    }
    return null
  })
  for (const row of mainstreamResults) {
    if (row) mainstreamRows.push(row)
  }

  const localNativeRows = []
  const localManufacturedRows = []
  const localResults = await mapWithConcurrency(localDomains, DISCOVERY_OUTLET_CONCURRENCY, async (domain) => {
    const feedUrl = await discoverOutletFeed(domain, budget)
    if (feedUrl) {
      return {
        kind: 'native',
        row: {
          widgetType: 'rss', tier: 'local', verificationBasis: 'none',
          label: domain, value: feedUrl, sourceLink: 'https://' + domain + '/',
        },
      }
    }
    if (budget.left <= 0) return null
    const q = 'site:' + domain + (topicQ ? ' ' + topicQ : '')
    const gnFeed = gnRssUrl(q, gnHl, gnGl)
    if (await budgetedFeedCheck(gnFeed, budget)) {
      return {
        kind: 'manufactured',
        row: {
          widgetType: 'rss', tier: 'manufactured', verificationBasis: 'none',
          label: domain, value: gnFeed, sourceLink: gnHtmlUrl(q, gnHl, gnGl),
        },
      }
    }
    return null
  })
  for (const result of localResults) {
    if (!result) continue
    if (result.kind === 'native') localNativeRows.push(result.row)
    else if (result.kind === 'manufactured') localManufacturedRows.push(result.row)
  }

  return [...mainstreamRows, ...localNativeRows, ...localManufacturedRows]
}

async function proposeSymbols(topics, req, deadlines, max = SUGGEST_MAX_SYMBOLS) {
  let proposedQueries = []
  const llm = await rateLimit(req, 'suggest-llm', DISCOVERY_LLM_GLOBAL_MAX, 3600, 'global')
  if (llm.allowed) {
    try {
      const topicStr = (topics || []).map(s => String(s).trim()).filter(Boolean).join(', ')
      const raw = await fetchBriefLLM({
        system: 'You suggest tradable instruments for MONITORING a specific topic, not for general market exposure. Given topics, return only instruments with a clear, specific link to the topic: a commodity the topic is a major producer or consumer of, a company or asset materially exposed to it, the single most relevant FX pair, or a narrowly scoped sector ETF tied to it. Do NOT return broad market proxies (the S&P 500, total market or country index funds, a generic volatility index, or gold as a generic safe haven) unless the topic itself is that market or asset. Prefer fewer well justified instruments over a long list, and an empty list is acceptable when nothing has a clear specific link. Return STRICT JSON exactly {"symbols":["..."]} of up to 8 short query strings, each a ticker or a company or asset name. No prose, no markdown.',
        user: 'Topics: ' + topicStr,
      })
      const parsed = JSON.parse(raw)
      proposedQueries = Array.isArray(parsed?.symbols) ? parsed.symbols : []
    } catch {
      proposedQueries = []
    }
  }

  const validated = await mapWithConcurrency(proposedQueries, DISCOVERY_OUTLET_CONCURRENCY, async (qy) => {
    if (Date.now() > deadlines.soft) return null
    const r = (await searchSymbols(qy))[0]
    return r ? { tvSymbol: r.tvSymbol, display: r.display, description: r.description } : null
  })

  const seen = new Set()
  const resolved = []
  for (const r of validated) {
    if (!r || seen.has(r.tvSymbol)) continue
    seen.add(r.tvSymbol)
    resolved.push(r)
    if (resolved.length >= max) break
  }
  return resolved
}

function buildPricesGroup(resolved) {
  return resolved.map(r => ({
    widgetType: 'prices', tier: '', verificationBasis: 'none',
    label: (r.description || r.display), value: r.tvSymbol, sourceLink: '',
    display: r.display, description: r.description,
  }))
}

function buildChartGroup(resolved) {
  return resolved.map(r => ({
    widgetType: 'chart', tier: '', verificationBasis: 'none',
    label: (r.description || r.display), value: r.tvSymbol, sourceLink: '',
    display: r.display, description: r.description,
  }))
}

async function proposeKeywords(topics, req, max = 8) {
  let keywords = []
  const llm = await rateLimit(req, 'suggest-llm', DISCOVERY_LLM_GLOBAL_MAX, 3600, 'global')
  if (llm.allowed) {
    try {
      const topicStr = (topics || []).map(s => String(s).trim()).filter(Boolean).join(', ')
      const raw = await fetchBriefLLM({
        system: 'You suggest search keywords for monitoring a topic in a news search tool. Given topics, return specific search phrases an analyst would track, favoring precise multi word phrases over single generic words. Return STRICT JSON exactly {"keywords":["..."]} of up to 8 short phrases. No prose, no markdown.',
        user: 'Topics: ' + topicStr,
      })
      const parsed = JSON.parse(raw)
      keywords = Array.isArray(parsed?.keywords) ? parsed.keywords : []
    } catch {
      keywords = []
    }
  }
  const seen = new Set()
  const out = []
  for (const k of keywords) {
    const kw = String(k || '').trim()
    if (!kw) continue
    const key = kw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(kw)
    if (out.length >= max) break
  }
  return out
}

function buildFeedGroup(keywords) {
  return keywords.map(kw => ({
    widgetType: 'feed', tier: '', verificationBasis: 'none',
    label: kw, value: kw, sourceLink: '',
  }))
}

function buildTrendsGroup(keywords) {
  return keywords.map(kw => ({
    widgetType: 'trends', tier: '', verificationBasis: 'none',
    label: kw, value: kw, sourceLink: '',
  }))
}

async function proposeSocial(topics, req) {
  let subreddits = [], bluesky = []
  const llm = await rateLimit(req, 'suggest-llm', DISCOVERY_LLM_GLOBAL_MAX, 3600, 'global')
  if (llm.allowed) {
    try {
      const topicStr = (topics || []).map(s => String(s).trim()).filter(Boolean).join(', ')
      const raw = await fetchBriefLLM({
        system: 'You suggest social accounts to follow for monitoring a topic, on Reddit and Bluesky only. Given topics, return real, active subreddits (without the r/ prefix) and real Bluesky handles (like name.bsky.social) relevant to the topic. Return STRICT JSON exactly {"subreddits":["..."],"bluesky":["..."]}, up to 6 each. No prose, no markdown.',
        user: 'Topics: ' + topicStr,
      })
      const parsed = JSON.parse(raw)
      subreddits = Array.isArray(parsed?.subreddits) ? parsed.subreddits : []
      bluesky = Array.isArray(parsed?.bluesky) ? parsed.bluesky : []
    } catch { subreddits = []; bluesky = [] }
  }
  return { subreddits, bluesky }
}

function normReddit(x) {
  const v = String(x || '').trim().replace(/^\/?(r\/)?/i, '').replace(/\/+$/, '')
  return /^[a-z0-9_]{2,21}$/i.test(v) ? v : null
}

function normBluesky(x) {
  const v = String(x || '').trim().replace(/^@/, '').replace(/^https?:\/\/bsky\.app\/profile\//i, '').replace(/\/.*$/, '').toLowerCase()
  return (/^[a-z0-9.-]+\.[a-z0-9.-]+$/.test(v) && !v.includes(' ')) ? v : null
}

async function buildSocialGroup(topics, req, deadlines) {
  const { subreddits, bluesky } = await proposeSocial(topics, req)
  const candidates = []
  for (const s of subreddits) {
    const v = normReddit(s)
    if (v) candidates.push({ platform: 'reddit', value: v, feedUrl: `https://www.reddit.com/r/${v}/.rss`, label: 'r/' + v })
  }
  for (const b of bluesky) {
    const v = normBluesky(b)
    if (v) candidates.push({ platform: 'bluesky', value: v, feedUrl: `https://bsky.app/profile/${v}/rss`, label: '@' + v })
  }
  const seenC = new Set()
  const uniq = []
  for (const c of candidates) {
    const k = c.platform + ':' + c.value.toLowerCase()
    if (seenC.has(k)) continue
    seenC.add(k)
    uniq.push(c)
  }
  const validated = await mapWithConcurrency(uniq, DISCOVERY_OUTLET_CONCURRENCY, async (c) => {
    if (Date.now() > deadlines.soft) return null
    return (await suggestFeedHasItems(c.feedUrl)) ? c : null
  })
  const out = []
  for (const c of validated) {
    if (!c) continue
    out.push({ widgetType: 'social', tier: '', verificationBasis: 'none', label: c.label, value: c.value, platform: c.platform, sourceLink: '' })
    if (out.length >= SUGGEST_MAX_SOCIAL) break
  }
  return out
}

async function buildRssGroup(topics, regions, req, deadlines) {
  let discovered = []
  try {
    discovered = await buildRssDiscovery(topics, regions, req, deadlines?.soft)
  } catch {
    discovered = []
  }
  const floor = await buildRssFloor(topics, regions, deadlines?.hard)
  const seen = new Set()
  const out = []
  for (const row of [...discovered, ...floor]) {
    if (seen.has(row.value)) continue
    seen.add(row.value)
    out.push(row)
    if (out.length >= SUGGEST_MAX_RSS) break
  }
  return out
}

async function buildRssFloor(topics, regions, hardDeadlineAt) {
  const topicQ = (topics || []).map(s => String(s).trim()).filter(Boolean).join(' ')
  const regionList = (regions || []).map(s => String(s).trim()).filter(Boolean)
  const candidates = []
  for (const region of regionList.slice(0, SUGGEST_MAX_REGIONS)) {
    const loc = REGION_MAP[region.toLowerCase()]
    if (!loc) continue
    const q = [topicQ, region].filter(Boolean).join(' ')
    candidates.push({
      tier: 'manufactured', verificationBasis: 'none',
      label: 'Google News: ' + q + ' (' + loc.hl + '/' + loc.gl + ')',
      value: gnRssUrl(q, loc.hl, loc.gl), sourceLink: gnHtmlUrl(q, loc.hl, loc.gl),
    })
  }
  const umbrellaQ = [topicQ, regionList.join(' ')].filter(Boolean).join(' ').trim()
  if (umbrellaQ) {
    candidates.push({
      tier: 'manufactured', verificationBasis: 'none',
      label: 'Google News: ' + umbrellaQ + ' (en/US)',
      value: gnRssUrl(umbrellaQ, 'en-US', 'US'), sourceLink: gnHtmlUrl(umbrellaQ, 'en-US', 'US'),
    })
  }
  let valid
  if (hardDeadlineAt && Date.now() >= hardDeadlineAt) {
    // Past the hard run deadline. Skip validation so the never-empty floor still returns
    // before the function times out. These are manufactured Google News query feeds,
    // already tier-labeled and disclaimed, and they reliably resolve.
    valid = candidates
  } else {
    const checked = await Promise.allSettled(candidates.map(async c => (await suggestFeedHasItems(c.value)) ? c : null))
    valid = checked.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
  }
  const seen = new Set()
  const out = []
  for (const c of valid) {
    if (seen.has(c.value)) continue
    seen.add(c.value)
    out.push({ widgetType: 'rss', ...c })
    if (out.length >= SUGGEST_MAX_RSS) break
  }
  return out
}

async function handleSuggestSources(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
  if (!supabase) return res.status(503).json({ error: 'SUPABASE_UNAVAILABLE' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' })
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const rl = await rateLimit(req, 'suggest-sources', 10, 60, user.id)
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({ error: 'RATE_LIMITED' })
  }
  const body = readBody(req) || {}
  const topics = Array.isArray(body.topics) ? body.topics : []
  const regions = Array.isArray(body.regions) ? body.regions : []
  const widgetTypes = Array.isArray(body.widgetTypes) ? body.widgetTypes : []
  const key = suggestCacheKey(topics, regions, widgetTypes)
  const cached = await suggestCacheRead(key)
  if (cached) return res.status(200).json({ ...cached, cached: true })
  const startedAt = Date.now()
  const deadlines = {
    soft: startedAt + SUGGEST_RUN_BUDGET_MS,
    hard: startedAt + SUGGEST_FLOOR_DEADLINE_MS,
  }
  const suggestions = []
  if (widgetTypes.includes('rss')) {
    const rssGroup = await buildRssGroup(topics, regions, req, deadlines)
    suggestions.push(...rssGroup)
  }
  const needSymbols = widgetTypes.includes('prices') || widgetTypes.includes('chart')
  const resolvedSymbols = needSymbols ? await proposeSymbols(topics, req, deadlines, SUGGEST_MAX_SYMBOLS) : []
  if (widgetTypes.includes('prices')) {
    suggestions.push(...buildPricesGroup(resolvedSymbols))
  }
  if (widgetTypes.includes('chart')) {
    suggestions.push(...buildChartGroup(resolvedSymbols.slice(0, 5)))
  }
  const needKeywords = widgetTypes.includes('feed') || widgetTypes.includes('trends')
  const resolvedKeywords = needKeywords ? await proposeKeywords(topics, req) : []
  if (widgetTypes.includes('feed')) {
    suggestions.push(...buildFeedGroup(resolvedKeywords))
  }
  if (widgetTypes.includes('trends')) {
    suggestions.push(...buildTrendsGroup(resolvedKeywords))
  }
  if (widgetTypes.includes('social')) {
    suggestions.push(...await buildSocialGroup(topics, req, deadlines))
  }
  const result = { suggestions, disclaimer: SUGGEST_DISCLAIMER, terms: { topics, regions } }
  await suggestCacheWrite(key, result)
  return res.status(200).json({ ...result, cached: false })
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Future actions (scheduled-brief, newsletter, alert-dispatch) route here too.
  // Never add a per-job function.
  const action = req.query.action
  switch (action) {
    case 'email-brief':
      return handleEmailBrief(req, res)
    case 'alert-dispatch':
      return handleAlertDispatch(req, res)
    case 'alert-poll':
      return handleAlertPoll(req, res)
    case 'delete-account':
      return handleDeleteAccount(req, res)
    case 'email-signup':
      return handleEmailSignup(req, res)
    case 'contact':
      return handleContact(req, res)
    case 'suggest-sources':
      return handleSuggestSources(req, res)
    case 'telegram-link-start':
      return handleTelegramLinkStart(req, res)
    case 'telegram-webhook':
      return handleTelegramWebhook(req, res)
    default:
      return res.status(400).json({ error: 'UNKNOWN_ACTION' })
  }
}

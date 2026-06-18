import supabase from './_supabase.js'
import { applyCors } from './_cors.js'
import { buildFeedBrief, normalizeWidgetGroups } from './_brief_core.js'
import { gatherRoomFeedGroups } from './_brief_gather.js'
import { resolveEntitlements } from '../src/entitlements/resolve.js'
import { safeFetch } from './_ssrf.js'
import { rateLimit } from './_ratelimit.js'
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

function sanitizeBrief(brief) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
  const dirOk = (d) => (d === 'up' || d === 'down' || d === 'flat') ? d : 'flat'
  const m = brief.markets
  const markets = (m && typeof m === 'object') ? {
    asOf: String(m.asOf ?? ''),
    rows: Array.isArray(m.rows) ? m.rows.slice(0, 40).map((r) => ({ symbol: clamp(r.symbol, 16), name: clamp(r.name, 80), price: num(r.price), changePct: num(r.changePct), dir: dirOk(r.dir) })) : [],
    heatmaps: Array.isArray(m.heatmaps) ? m.heatmaps.slice(0, 10).map((h) => ({ label: clamp(h.label, 40), symbol: clamp(h.symbol, 16), changePct: num(h.changePct), dir: dirOk(h.dir) })) : [],
  } : null
  const tr = brief.trends
  const trends = (tr && typeof tr === 'object' && Array.isArray(tr.terms)) ? {
    window: String(tr.window ?? ''),
    windowLabel: clamp(tr.windowLabel, 40),
    asOf: String(tr.asOf ?? ''),
    terms: tr.terms.slice(0, 5).map((t) => ({ term: clamp(t.term, 80), value: num(t.value), dir: dirOk(t.dir) })),
  } : null
  return {
    headline: clamp(brief.headline, 300),
    sections: (brief.sections ?? []).slice(0, 20).map((section) => ({
      label: clamp(section?.label, 120),
      status: section?.status === 'no_update' ? 'no_update' : 'update',
      summary: clamp(section?.summary, 2000),
      sourceUrl: isHttpUrl(section?.sourceUrl) ? section.sourceUrl : null,
    })),
    markets,
    trends,
  }
}

function countUpdateSections(sections) {
  return sections.filter((s) => s.status === 'update').length
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
    for (const row of brief.markets.rows) html += `<tr><td style="padding:2px 14px 2px 0;font-weight:bold;">${esc(row.symbol)}</td><td style="padding:2px 14px 2px 0;color:#4b5563;">${esc(row.name)}</td><td style="padding:2px 14px 2px 0;">${esc(String(row.price))}</td><td style="padding:2px 0;">${cell(row.changePct, row.dir)}</td></tr>`
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
    if (section.status === 'no_update') {
      lines.push(`No update from ${section.label}`)
    } else if (section.summary?.trim()) {
      lines.push(section.summary)
    }
    lines.push('')
  }

  if (brief.markets && (brief.markets.rows.length || brief.markets.heatmaps.length)) {
    lines.push('Markets (as of last refresh)', '')
    for (const row of brief.markets.rows) lines.push(`- ${row.symbol}  ${row.price}  ${row.changePct > 0 ? '+' : ''}${Number(row.changePct).toFixed(2)}%`)
    for (const h of brief.markets.heatmaps) lines.push(`- ${h.label} (${h.symbol})  ${h.changePct > 0 ? '+' : ''}${Number(h.changePct).toFixed(2)}%`)
    lines.push('')
  }

  if (brief.trends && brief.trends.terms.length) {
    const g = (d) => d === 'up' ? '↑' : d === 'down' ? '↓' : '→'
    lines.push(`Search interest (relative, not volume${brief.trends.windowLabel ? `, last ${brief.trends.windowLabel}` : ''})`, '')
    for (const t of brief.trends.terms) lines.push(`- ${t.term}  ${t.value}  ${g(t.dir)}`)
    lines.push('')
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

function renderAlertEmailHtml({ keyword, region, items }) {
  const scope = region ? ` in ${esc(region)}` : ''
  let html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;max-width:640px;">
<img src="https://thevigilroom.com/email-logo.png" alt="Vigil" width="120" style="display:block;margin:0 0 16px;" />
<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">
<div style="font-size:18px;font-weight:bold;color:#1a1a1a;">New items matching your alert</div>
<div style="font-size:13px;color:#4b5563;margin-top:4px;">${esc(keyword)}${scope} . ${items.length} new ${items.length === 1 ? 'item' : 'items'}</div>
</div>
<ul style="margin:0 0 12px;padding-left:20px;">`
  for (const it of items) {
    const label = esc(it.source || 'Source')
    html += `<li style="margin-bottom:8px;font-size:14px;">`
    if (isHttpUrl(it.url)) html += `<a href="${esc(it.url)}" style="color:#1d4ed8;text-decoration:none;">${esc(it.title || it.url)}</a> <span style="color:#6b7280;">(${label})</span>`
    else html += `${esc(it.title || '')} (${label})`
    html += `</li>`
  }
  html += `</ul>
<p style="font-size:12px;color:#6b7280;margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;">Vigil tracks, it does not verify. You are receiving this because you set an alert in Vigil.</p>
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

async function sendAlertEmail(to, keyword, region, items) {
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
        html: renderAlertEmailHtml({ keyword, region, items }),
        text: renderAlertEmailText({ keyword, region, items }),
      }),
      signal: AbortSignal.timeout(30000),
    })
    return resp.ok
  } catch { return false }
}

async function sendAlertWebhook(webhookUrl, keyword, region, items) {
  const scope = region ? ` in ${region}` : ''
  const lines = items.slice(0, 10).map((it) => `• ${it.title || it.url}${it.source ? ` (${it.source})` : ''}${it.url ? `\n${it.url}` : ''}`)
  const text = `New items matching "${keyword}"${scope}\n\n${lines.join('\n')}\n\nVigil tracks, it does not verify.`
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

async function handleAlertDispatch(req, res) {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.authorization || ''
  if (!secret || !safeEqual(authHeader, `Bearer ${secret}`)) return res.status(401).json({ error: 'UNAUTHORIZED' })
  if (!supabase) return res.status(503).json({ error: 'SUPABASE_UNAVAILABLE' })

  const { data: rules, error: rulesErr } = await supabase
    .from('alerts')
    .select('id, user_id, keyword, region, channels, webhook_url')
    .eq('active', true)
    .limit(40)
  if (rulesErr) return res.status(500).json({ error: 'DB_ERROR', stage: 'rules' })

  const userCache = new Map()
  let matched = 0
  let emailed = 0
  let posted = 0

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
      }
      userCache.set(rule.user_id, u)
    }
    if (!u.canAlert) continue

    const items = await fetchMatches(rule.keyword, rule.region)
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
      const sent = await sendAlertEmail(u.email, rule.keyword, rule.region, mapped)
      if (sent) emailed += 1
    }
    if (u.canWebhook && rule.webhook_url && (channels.includes('webhook') || channels.includes('slack'))) {
      const ok = await sendAlertWebhook(rule.webhook_url, rule.keyword, rule.region, mapped)
      if (ok) posted += 1
    }
  }

  console.log('[alert-dispatch]', JSON.stringify({ rules: (rules || []).length, matched, emailed, posted }))

  const sched = await dispatchScheduledBriefs().catch((e) => { console.error('[scheduled-brief] dispatch threw', e?.message); return { due: 0, sent: 0, capped: 0, skipped: 0 } })

  await cleanupStaleRows()

  return res.status(200).json({ ok: true, rules: (rules || []).length, matched, emailed, posted, scheduledBriefs: sched })
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

  if (stripeCustomerId) {
    console.log('[delete-account] stripe customer for manual cleanup', stripeCustomerId)
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
}

const SCHED_WINDOW_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 31 * 24 * 60 * 60 * 1000,
  quarterly: 92 * 24 * 60 * 60 * 1000,
  annually: 366 * 24 * 60 * 60 * 1000,
}
function addUtcMonths(d, n) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()))
}
function nextRunAtFrom(cadence, from) {
  const f = from instanceof Date ? from : new Date(from)
  if (cadence === 'weekly') return new Date(f.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  if (cadence === 'monthly') return addUtcMonths(f, 1).toISOString()
  if (cadence === 'quarterly') return addUtcMonths(f, 3).toISOString()
  if (cadence === 'annually') return addUtcMonths(f, 12).toISOString()
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
      .from('workspaces').select('id, name, widgets').eq('id', s.workspace_id).maybeSingle()
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
const SUGGEST_DISCLAIMER = 'These are suggestions of publicly available sources, not verified or endorsed by Vigil, and not a substitute for your own due diligence.'

// Region to (Google News hl language, gl country). Localized floor only where we have a confident pair.
// EU/Europe and any unmapped region fall through to the English umbrella feed below. Promote to feedSources.js when a second consumer needs it.
const REGION_MAP = {
  'congo': { hl: 'fr', gl: 'CD' }, 'drc': { hl: 'fr', gl: 'CD' }, 'dr congo': { hl: 'fr', gl: 'CD' },
  'eastern congo': { hl: 'fr', gl: 'CD' }, 'goma': { hl: 'fr', gl: 'CD' }, 'kivu': { hl: 'fr', gl: 'CD' }, 'm23': { hl: 'fr', gl: 'CD' },
  'mali': { hl: 'fr', gl: 'ML' }, 'burkina faso': { hl: 'fr', gl: 'BF' }, 'niger': { hl: 'fr', gl: 'NE' }, 'sahel': { hl: 'fr', gl: 'ML' },
  'taiwan': { hl: 'zh-TW', gl: 'TW' }, 'taiwan strait': { hl: 'zh-TW', gl: 'TW' }, 'china': { hl: 'zh-CN', gl: 'CN' },
  'ukraine': { hl: 'uk', gl: 'UA' }, 'russia': { hl: 'ru', gl: 'RU' }, 'germany': { hl: 'de', gl: 'DE' }, 'france': { hl: 'fr', gl: 'FR' },
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

async function buildRssFloor(topics, regions) {
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
  const checked = await Promise.allSettled(candidates.map(async c => (await suggestFeedHasItems(c.value)) ? c : null))
  const valid = checked.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
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
  const rl = await rateLimit(req, 'suggest-sources', 10, 60)
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
  const suggestions = []
  // Slice 1a: RSS Google News floor only. Discovery, social, prices, livestream, news-keywords land in later slices.
  if (widgetTypes.includes('rss')) {
    const rssFloor = await buildRssFloor(topics, regions)
    suggestions.push(...rssFloor)
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
    case 'delete-account':
      return handleDeleteAccount(req, res)
    case 'email-signup':
      return handleEmailSignup(req, res)
    case 'suggest-sources':
      return handleSuggestSources(req, res)
    default:
      return res.status(400).json({ error: 'UNKNOWN_ACTION' })
  }
}

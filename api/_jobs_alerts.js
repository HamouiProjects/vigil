// Alert render + three-layer match + dispatch/poll handlers (split out of jobs.js, no behavior change).
import supabase from './_supabase.js'
import { safeFetch } from './_ssrf.js'
import { gatherRoomFeedGroups } from './_brief_gather.js'
import { resolveEntitlements } from '../src/entitlements/resolve.js'
import crypto from 'node:crypto'
import { isHttpUrl, esc, safeEqual } from './_jobs_util.js'
import { dispatchScheduledBriefs, cleanupStaleRows } from './_jobs_scheduled.js'

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

export { handleAlertDispatch, handleAlertPoll }

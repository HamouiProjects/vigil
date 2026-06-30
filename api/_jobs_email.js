// On-demand brief email render + the email-brief action (split out of jobs.js, no behavior change).
import supabase from './_supabase.js'
import { rateLimit } from './_ratelimit.js'
import { relativeTime, cleanExcerpt } from '../src/lib/briefFormat.js'
import { clamp, isHttpUrl, esc, hostnameOf, readBody } from './_jobs_util.js'

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


export { handleEmailBrief, sanitizeBrief, renderEmailHtml, renderEmailText }

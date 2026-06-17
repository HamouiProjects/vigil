import supabase from './_supabase.js'
import { applyCors } from './_cors.js'
import { fetchBriefLLM, BriefLLMNotConfiguredError } from './_brief_llm.js'
import { resolveEntitlements } from '../src/entitlements/resolve.js'
import { getQuotes } from './_yahoo.js'

const SYSTEM_PROMPT = 'You write a calm operational news brief. Summarize ONLY the provided items for each labeled group. Do not add any fact, context, or analysis not present in the items. Do not assert anything as verified or true. Output ONLY valid minified JSON, no markdown and no code fences, exactly: {"headline":string,"sections":[{"index":number,"summary":string}]}. The headline is a one-line room summary across all groups. For each section, set index to the [i] number of the group it covers and write one concise summary of ONLY that group\'s items. Include one summary per content-bearing group. Never use em-dashes; use periods, commas, or parentheses.'

const BRIEF_PARSE_FALLBACK = {
  headline: 'Brief unavailable',
  sections: [{ index: 0, summary: '' }],
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

function firstDayNextMonthISO() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
}

function monthStartISO() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isWellFormedUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

function isHttpUrl(u) {
  if (typeof u !== 'string') return false
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:' } catch { return false }
}

async function countBriefsThisMonth(userId) {
  const { count, error } = await supabase
    .from('briefs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStartISO())
  if (error) {
    console.error('[brief] count error', error?.message)
    return null
  }
  return count ?? 0
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) return []
  return items
    .filter((i) => i?.title?.trim())
    .map((i) => ({
      source: String(i.source ?? '').trim(),
      title: String(i.title).trim().slice(0, 200),
      url: String(i.url ?? '').trim(),
      publishedAt: i.publishedAt,
    }))
    .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
    .slice(0, 18)
}

function normalizeWidgetGroups(widgetGroups) {
  if (!Array.isArray(widgetGroups)) return []
  return widgetGroups.map((g) => ({
    widgetId: String(g?.widgetId ?? ''),
    widgetType: String(g?.widgetType ?? ''),
    label: String(g?.label ?? '').trim() || 'Source',
    sourceUrl: isHttpUrl(g?.sourceUrl) ? g.sourceUrl : null,
    includeInBrief: g?.includeInBrief !== false,
    items: normalizeItems(g?.items),
  }))
}

function buildUserContent(contentGroups) {
  const parts = []
  contentGroups.forEach((group, idx) => {
    parts.push(`[${idx + 1}] ${group.label}`)
    for (const item of group.items) {
      parts.push(`${item.source} | ${item.title} | ${item.url}`)
    }
    parts.push('')
  })
  return parts.join('\n').trim()
}

function parseBriefContent(raw) {
  let text = (raw || '').trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const parsed = JSON.parse(text)
    if (parsed?.headline != null && Array.isArray(parsed?.sections)) return parsed
  } catch { /* fallback below */ }
  return BRIEF_PARSE_FALLBACK
}

function assembleBrief(includedGroups, modelParsed) {
  const summaryByIndex = new Map()
  for (const s of (modelParsed.sections ?? [])) {
    const idx = Number(s?.index)
    if (Number.isFinite(idx) && idx >= 1) {
      summaryByIndex.set(idx, String(s?.summary ?? ''))
    }
  }

  let contentIdx = 0
  const sections = includedGroups.map((group) => {
    if (!group.items.length) {
      return {
        widgetId: group.widgetId,
        widgetType: group.widgetType,
        label: group.label,
        sourceUrl: group.sourceUrl,
        status: 'no_update',
        summary: '',
      }
    }
    contentIdx += 1
    return {
      widgetId: group.widgetId,
      widgetType: group.widgetType,
      label: group.label,
      sourceUrl: group.sourceUrl,
      status: 'update',
      summary: summaryByIndex.get(contentIdx) || '',
    }
  })

  return {
    headline: String(modelParsed.headline ?? ''),
    sections,
  }
}

function isBriefFallback(brief) {
  return brief?.headline === BRIEF_PARSE_FALLBACK.headline
}

function buildMarkets(mkReq, quotes) {
  if (!mkReq || typeof mkReq !== 'object') return null
  const r2 = (n) => Math.round(Number(n) * 100) / 100
  const dirOf = (p) => (p > 0 ? 'up' : p < 0 ? 'down' : 'flat')
  const valid = (q) => q && q.country === 'us' && (q.asset_type === 'EQUITY' || q.asset_type === 'ETF') && q.price != null
  const map = new Map()
  for (const q of quotes) if (valid(q)) map.set(String(q.symbol).toUpperCase(), q)
  const rows = []
  for (const s of (mkReq.symbols || [])) {
    const q = map.get(String(s).toUpperCase()); if (!q) continue
    const pct = r2(q.change_pct ?? 0)
    rows.push({ symbol: q.symbol, name: q.name || q.symbol, price: r2(q.price), changePct: pct, dir: dirOf(pct) })
  }
  const heatmaps = []
  for (const h of (mkReq.heatmaps || [])) {
    const q = map.get(String(h?.symbol).toUpperCase()); if (!q) continue
    const pct = r2(q.change_pct ?? 0)
    heatmaps.push({ label: h.label || h.symbol, symbol: q.symbol, changePct: pct, dir: dirOf(pct) })
  }
  if (!rows.length && !heatmaps.length) return null
  return { asOf: new Date().toISOString(), rows, heatmaps }
}

async function fetchTrends(trReq) {
  if (!trReq || !Array.isArray(trReq.terms) || !trReq.terms.length) return null
  const url = `https://thevigilroom.com/api/trends?keyword=${encodeURIComponent(trReq.terms.join(','))}&date=${encodeURIComponent(trReq.window || 'today 12-m')}`
  const headers = {}
  if (process.env.CRON_SECRET) {
    headers.Authorization = `Bearer ${process.env.CRON_SECRET}`
  }
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
    const data = await r.json().catch(() => null)
    if (!data || data.error || !Array.isArray(data.points) || !data.points.length) return null
    return data
  } catch { return null }
}
function buildGoogleTrendsUrl(trReq, termList) {
  const q = termList.join(',')
  const windowVal = trReq.window || 'today 12-m'
  const withDate = `https://trends.google.com/trends/explore?q=${encodeURIComponent(q)}&date=${encodeURIComponent(windowVal)}`
  if (isHttpUrl(withDate)) return withDate
  const qOnly = `https://trends.google.com/trends/explore?q=${encodeURIComponent(q)}`
  return isHttpUrl(qOnly) ? qOnly : null
}

function buildTrends(trReq, data) {
  if (!trReq || !data || !Array.isArray(data.points) || !data.points.length) return null
  const terms = (Array.isArray(data.keywords) && data.keywords.length) ? data.keywords : trReq.terms
  const out = []
  terms.forEach((term, ki) => {
    let first = null, last = null
    const series = []
    for (const p of data.points) {
      const v = p?.values?.[ki]
      if (v == null) continue
      series.push(v)
      if (first == null) first = v
      last = v
    }
    if (last == null) return
    const dir = first == null ? 'flat' : (last > first ? 'up' : last < first ? 'down' : 'flat')
    out.push({ term: String(term), value: last, dir, series })
  })
  if (!out.length) return null
  const googleTrendsUrl = buildGoogleTrendsUrl(trReq, out.map((t) => t.term))
  return {
    window: trReq.window || 'today 12-m',
    windowLabel: trReq.windowLabel || '',
    asOf: new Date().toISOString(),
    terms: out,
    googleTrendsUrl: googleTrendsUrl || undefined,
  }
}

function hasMarketsData(mkReq) {
  return mkReq && ((mkReq.symbols?.length) || (mkReq.heatmaps?.length))
}

function hasTrendsData(trReq) {
  return trReq && Array.isArray(trReq.terms) && trReq.terms.length
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  if (!supabase) return res.status(503).json({ error: 'SUPABASE_UNAVAILABLE' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user?.id) return res.status(401).json({ error: 'UNAUTHORIZED' })

  if (user.is_anonymous === true) {
    return res.status(403).json({
      error: 'BRIEF_REQUIRES_ACCOUNT',
      message: 'Create a free account to generate briefs.',
    })
  }

  const body = readBody(req)
  if (!body) return res.status(400).json({ error: 'invalid body' })

  const { workspaceId, widgetGroups, period, markets, trends } = body
  const normalized = normalizeWidgetGroups(widgetGroups)
  const included = normalized.filter((g) => g.includeInBrief !== false)
  const contentGroups = included.filter((g) => g.items.length > 0)

  const mkReq = (markets && typeof markets === 'object') ? markets : null
  const trReq = (trends && typeof trends === 'object') ? trends : null
  const hasMarkets = hasMarketsData(mkReq)
  const hasTrends = hasTrendsData(trReq)

  if (!contentGroups.length && !hasMarkets && !hasTrends) {
    return res.status(400).json({ error: 'NO_ITEMS' })
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, add_ons')
    .eq('user_id', user.id)
    .maybeSingle()

  const ent = resolveEntitlements(sub?.plan ?? 'free', sub?.add_ons ?? [], sub?.status ?? null)
  const cap = ent.limits.briefsPerMonth ?? resolveEntitlements('free').limits.briefsPerMonth

  const wantedSyms = mkReq
    ? [...new Set([...(mkReq.symbols || []), ...((mkReq.heatmaps || []).map((h) => h?.symbol))]
        .map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))]
    : []
  const quotesPromise = wantedSyms.length
    ? getQuotes(wantedSyms).catch((err) => { console.error('[brief] quotes failed', err?.message); return [] })
    : Promise.resolve([])

  const trendsPromise = hasTrends ? fetchTrends(trReq) : Promise.resolve(null)

  let cleaned
  if (contentGroups.length > 0) {
    let rawBrief
    try {
      rawBrief = await fetchBriefLLM({
        system: SYSTEM_PROMPT,
        user: buildUserContent(contentGroups),
      })
    } catch (err) {
      console.error('[brief] llm error', err?.code, err?.status, err?.detail || err?.message)
      if (err instanceof BriefLLMNotConfiguredError) {
        return res.status(503).json({ error: 'BRIEF_NOT_CONFIGURED' })
      }
      if (err?.code === 'BRIEF_EMPTY_CONTENT') {
        return res.status(502).json({ error: 'BRIEF_EMPTY', finishReason: err.finishReason ?? null })
      }
      return res.status(502).json({
        error: 'BRIEF_PROVIDER_ERROR',
        providerStatus: err?.status ?? null,
      })
    }

    const parsed = parseBriefContent(rawBrief)
    if (isBriefFallback(parsed)) {
      console.error('[brief] parse fallback, not inserting')
      return res.status(502).json({ error: 'BRIEF_PARSE_FAILED' })
    }
    cleaned = assembleBrief(included, parsed)
  } else {
    cleaned = {
      headline: 'No updates from tracked feeds',
      sections: included.map((group) => ({
        widgetId: group.widgetId,
        widgetType: group.widgetType,
        label: group.label,
        sourceUrl: group.sourceUrl,
        status: 'no_update',
        summary: '',
      })),
    }
  }

  try {
    const quotes = await quotesPromise
    const mk = buildMarkets(mkReq, quotes)
    if (mk) cleaned.markets = mk
  } catch (err) { console.error('[brief] markets build failed', err?.message) }

  try {
    const trData = await trendsPromise
    const tr = buildTrends(trReq, trData)
    if (tr) cleaned.trends = tr
  } catch (err) { console.error('[brief] trends build failed', err?.message) }

  const workspaceUuid = isWellFormedUuid(workspaceId) ? workspaceId : null

  const { data: briefId, error: insertErr } = await supabase.rpc('brief_insert_capped', {
    p_user: user.id,
    p_workspace: workspaceUuid,
    p_content: cleaned,
    p_period: period ?? null,
    p_cap: cap,
  })

  if (insertErr) {
    console.error('[brief] insert error', insertErr?.message)
    return res.status(500).json({ error: 'DB_ERROR', stage: 'insert' })
  }

  if (!briefId) {
    const used = await countBriefsThisMonth(user.id)
    if (used == null) return res.status(500).json({ error: 'DB_ERROR', stage: 'count' })
    return res.status(429).json({
      error: 'BRIEF_LIMIT_REACHED',
      limit: cap,
      used,
      resetsAt: firstDayNextMonthISO(),
      message: `You have used all ${cap} briefs for this month. Your allowance resets on the 1st.`,
    })
  }

  const { data: row, error: rowErr } = await supabase
    .from('briefs')
    .select('created_at')
    .eq('id', briefId)
    .single()

  if (rowErr || !row) {
    console.error('[brief] fetch inserted row error', rowErr?.message)
    return res.status(500).json({ error: 'DB_ERROR', stage: 'insert' })
  }

  const usedAfter = await countBriefsThisMonth(user.id)
  if (usedAfter == null) return res.status(500).json({ error: 'DB_ERROR', stage: 'count' })

  return res.status(200).json({
    brief: cleaned,
    id: briefId,
    created_at: row.created_at,
    used: usedAfter,
    limit: cap,
  })
}

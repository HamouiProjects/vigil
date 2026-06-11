import supabase from './_supabase.js'
import { applyCors } from './_cors.js'
import { fetchBriefLLM, BriefLLMNotConfiguredError } from './_brief_llm.js'
import { resolveEntitlements } from '../src/entitlements/resolve.js'
import { getQuotes } from './_yahoo.js'

const PER_USER_MONTHLY = { free: 15, pro: 40, team: 120 }

const SYSTEM_PROMPT = 'You write a calm operational news brief. Summarize ONLY the provided items. Do not add any fact, context, or analysis not present in the items. Do not assert anything as verified or true. Group items into a few themes. Output ONLY valid minified JSON, no markdown and no code fences, exactly: {"headline":string,"sections":[{"title":string,"bullets":[{"text":string,"sourceIndex":number}]}]}. For each bullet, set sourceIndex to the [n] number of the single provided item it summarizes. Be concise. Never use em-dashes; use periods, commas, or parentheses.'

const BRIEF_PARSE_FALLBACK = {
  headline: 'Brief unavailable',
  sections: [{
    title: '',
    bullets: [{ text: 'The brief could not be generated cleanly. Please try again.', source: null }],
  }],
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

function buildUserContent(items) {
  return items
    .map((item, idx) => `[${idx + 1}] ${item.source} | ${item.title} | ${item.url}`)
    .join('\n')
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

function resolveBriefSources(parsed, normalized) {
  return {
    headline: String(parsed.headline),
    sections: (parsed.sections ?? []).map((section) => ({
      title: section?.title ?? '',
      bullets: (section?.bullets ?? []).map((bullet) => {
        const idx = Number(bullet?.sourceIndex)
        const item = Number.isFinite(idx) && idx >= 1 ? normalized[idx - 1] : null
        return {
          text: String(bullet?.text ?? ''),
          source: item ? { label: item.source || 'Source', url: item.url } : null,
        }
      }),
    })),
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
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await r.json().catch(() => null)
    if (!data || data.error || !Array.isArray(data.points) || !data.points.length) return null
    return data
  } catch { return null }
}
function buildTrends(trReq, data) {
  if (!trReq || !data || !Array.isArray(data.points) || !data.points.length) return null
  const terms = (Array.isArray(data.keywords) && data.keywords.length) ? data.keywords : trReq.terms
  const out = []
  terms.forEach((term, ki) => {
    let first = null, last = null
    for (const p of data.points) {
      const v = p?.values?.[ki]
      if (v == null) continue
      if (first == null) first = v
      last = v
    }
    if (last == null) return
    const dir = first == null ? 'flat' : (last > first ? 'up' : last < first ? 'down' : 'flat')
    out.push({ term: String(term), value: last, dir })
  })
  if (!out.length) return null
  return { window: trReq.window || 'today 12-m', windowLabel: trReq.windowLabel || '', asOf: new Date().toISOString(), terms: out }
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

  const { workspaceId, items, period, markets, trends } = body
  const normalized = normalizeItems(items)
  if (!normalized.length) return res.status(400).json({ error: 'NO_ITEMS' })

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, add_ons')
    .eq('user_id', user.id)
    .maybeSingle()

  const ent = resolveEntitlements(sub?.plan ?? 'free', sub?.add_ons ?? [], sub?.status ?? null)
  const cap = PER_USER_MONTHLY[ent.plan] ?? PER_USER_MONTHLY.free

  const { count, error: countErr } = await supabase
    .from('briefs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', monthStartISO())

  if (countErr) {
    console.error('[brief] count error', countErr?.message)
    return res.status(500).json({ error: 'DB_ERROR', stage: 'count' })
  }

  const used = count ?? 0
  if (used >= cap) {
    return res.status(429).json({
      error: 'BRIEF_LIMIT_REACHED',
      limit: cap,
      used,
      resetsAt: firstDayNextMonthISO(),
      message: `You have used all ${cap} briefs for this month. Your allowance resets on the 1st.`,
    })
  }

  const mkReq = (markets && typeof markets === 'object') ? markets : null
  const wantedSyms = mkReq
    ? [...new Set([...(mkReq.symbols || []), ...((mkReq.heatmaps || []).map((h) => h?.symbol))]
        .map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))]
    : []
  const quotesPromise = wantedSyms.length
    ? getQuotes(wantedSyms).catch((err) => { console.error('[brief] quotes failed', err?.message); return [] })
    : Promise.resolve([])

  const trReq = (trends && typeof trends === 'object') ? trends : null
  const trendsPromise = (trReq && Array.isArray(trReq.terms) && trReq.terms.length) ? fetchTrends(trReq) : Promise.resolve(null)

  let rawBrief
  try {
    rawBrief = await fetchBriefLLM({
      system: SYSTEM_PROMPT,
      user: buildUserContent(normalized),
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
  const cleaned = resolveBriefSources(parsed, normalized)

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

  const { data: row, error: insertErr } = await supabase
    .from('briefs')
    .insert({
      user_id: user.id,
      workspace_id: workspaceId ?? null,
      content: cleaned,
      period: period ?? null,
    })
    .select('id, created_at')
    .single()

  if (insertErr || !row) {
    console.error('[brief] insert error', insertErr?.message)
    return res.status(500).json({ error: 'DB_ERROR', stage: 'insert' })
  }

  return res.status(200).json({
    brief: cleaned,
    id: row.id,
    created_at: row.created_at,
    used: used + 1,
    limit: cap,
  })
}

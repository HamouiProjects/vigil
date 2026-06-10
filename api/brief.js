import supabase from './_supabase.js'
import { applyCors } from './_cors.js'
import { fetchBriefLLM, BriefLLMNotConfiguredError } from './_brief_llm.js'
import { resolveEntitlements } from '../src/entitlements/resolve.js'

const PER_USER_MONTHLY = { free: 15, pro: 40, team: 120 }

const SYSTEM_PROMPT = 'You write a calm operational news brief. Summarize ONLY the provided items. Do not add any fact, context, or analysis not present in the items. Do not assert anything as verified or true. Group items into a few themes. Output ONLY valid minified JSON, no markdown and no code fences, exactly: {"headline":string,"sections":[{"title":string,"bullets":[{"text":string,"source":{"label":string,"url":string}}]}]}. Each bullet must cite exactly one provided item as its source. Be concise. Never use em-dashes; use periods, commas, or parentheses.'

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
    .slice(0, 40)
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
  return {
    headline: 'Brief',
    sections: [{ title: '', bullets: [{ text: raw, source: null }] }],
  }
}

function providerUnavailable(res) {
  return res.status(503).json({ error: 'BRIEF_NOT_CONFIGURED' })
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  if (!supabase) return providerUnavailable(res)

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

  const { workspaceId, items, period } = body
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

  if (countErr) return providerUnavailable(res)

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

  let rawBrief
  try {
    rawBrief = await fetchBriefLLM({
      system: SYSTEM_PROMPT,
      user: buildUserContent(normalized),
    })
  } catch (err) {
    if (err instanceof BriefLLMNotConfiguredError || err.code === 'BRIEF_PROVIDER_FAILED') {
      return providerUnavailable(res)
    }
    return providerUnavailable(res)
  }

  const parsed = parseBriefContent(rawBrief)

  const { data: row, error: insertErr } = await supabase
    .from('briefs')
    .insert({
      user_id: user.id,
      workspace_id: workspaceId ?? null,
      content: parsed,
      period: period ?? null,
    })
    .select('id, created_at')
    .single()

  if (insertErr || !row) return providerUnavailable(res)

  return res.status(200).json({
    brief: parsed,
    id: row.id,
    created_at: row.created_at,
    used: used + 1,
    limit: cap,
  })
}

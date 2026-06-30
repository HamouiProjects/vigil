// Stale-row cleanup + scheduled-brief dispatch (split out of jobs.js, no behavior change).
import supabase from './_supabase.js'
import { gatherRoomFeedGroups } from './_brief_gather.js'
import { buildFeedBrief, normalizeWidgetGroups } from './_brief_core.js'
import { resolveEntitlements } from '../src/entitlements/resolve.js'
import { clamp } from './_jobs_util.js'
import { sanitizeBrief, renderEmailHtml, renderEmailText } from './_jobs_email.js'

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

export { cleanupStaleRows, dispatchScheduledBriefs }

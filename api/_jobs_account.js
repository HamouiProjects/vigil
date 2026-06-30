// Account deletion, email signup, and contact handlers (split out of jobs.js, no behavior change).
import supabase from './_supabase.js'
import { rateLimit } from './_ratelimit.js'
import Stripe from 'stripe'
import { readBody, isValidSignupEmail, clamp, esc } from './_jobs_util.js'

const stripeForDelete = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

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

export { handleDeleteAccount, handleEmailSignup, handleContact }

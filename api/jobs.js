import supabase from './_supabase.js'
import { applyCors } from './_cors.js'

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

function sanitizeBrief(brief) {
  return {
    headline: clamp(brief.headline, 300),
    sections: (brief.sections ?? []).slice(0, 20).map((section) => ({
      title: String(section?.title ?? ''),
      bullets: (section?.bullets ?? []).slice(0, 30).map((bullet) => ({
        text: clamp(bullet?.text, 500),
        source: bullet?.source
          ? {
              label: String(bullet.source.label ?? ''),
              url: String(bullet.source.url ?? ''),
            }
          : null,
      })),
    })),
  }
}

function countBullets(sections) {
  return sections.reduce((n, s) => n + (s.bullets?.length ?? 0), 0)
}

function renderEmailHtml({ brief, roomName, preparedFor, generatedAt }) {
  const room = esc(clamp(roomName, 120) || 'Risk Room')
  const prep = clamp(preparedFor, 120)
  const genAt = generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString()
  const n = countBullets(brief.sections)
  const nWord = n === 1 ? 'source' : 'sources'

  let html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;max-width:640px;">
<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">
<div style="font-size:18px;font-weight:bold;color:#1a1a1a;">${room}</div>
<div style="font-size:12px;color:#6b7280;margin-top:4px;">Generated ${esc(genAt)} . ${n} ${nWord}</div>`
  if (prep) {
    html += `<div style="font-size:13px;color:#4b5563;margin-top:6px;">Prepared for ${esc(prep)}</div>`
  }
  html += `</div>
<h1 style="font-size:16px;font-weight:bold;color:#1a1a1a;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">${esc(brief.headline)}</h1>`

  for (const section of brief.sections) {
    if (section.title?.trim()) {
      html += `<h2 style="font-size:13px;font-weight:bold;color:#1a1a1a;margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.06em;">${esc(section.title)}</h2>`
    }
    html += '<ul style="margin:0 0 12px;padding-left:20px;">'
    for (const bullet of section.bullets) {
      const label = bullet.source?.label || 'Source'
      html += `<li style="margin-bottom:8px;font-size:14px;">${esc(bullet.text)} `
      if (bullet.source?.url) {
        html += `<a href="${esc(bullet.source.url)}" style="color:#1d4ed8;text-decoration:none;">${esc(label)}</a>`
      } else {
        html += `(${esc(label)})`
      }
      html += '</li>'
    }
    html += '</ul>'
  }

  html += `<p style="font-size:12px;color:#6b7280;margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;">Vigil tracks, it does not verify.</p>
</body></html>`
  return html
}

function renderEmailText({ brief, roomName, preparedFor, generatedAt }) {
  const room = clamp(roomName, 120) || 'Risk Room'
  const prep = clamp(preparedFor, 120)
  const genAt = generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString()
  const n = countBullets(brief.sections)
  const nWord = n === 1 ? 'source' : 'sources'
  const lines = [room, `Generated ${genAt} . ${n} ${nWord}`]
  if (prep) lines.push(`Prepared for ${prep}`)
  lines.push('', brief.headline, '')

  for (const section of brief.sections) {
    if (section.title?.trim()) lines.push(section.title)
    for (const bullet of section.bullets) {
      const label = bullet.source?.label || 'Source'
      lines.push(`- ${bullet.text} (${label})`)
    }
    if (section.bullets?.length) lines.push('')
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

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Future actions (scheduled-brief, newsletter, alert-dispatch) route here too.
  // Never add a per-job function.
  const action = req.query.action
  switch (action) {
    case 'email-brief':
      return handleEmailBrief(req, res)
    default:
      return res.status(400).json({ error: 'UNKNOWN_ACTION' })
  }
}

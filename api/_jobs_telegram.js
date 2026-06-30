// Telegram link-start + webhook handlers, tg link cache, and the plain-send helper (split out of jobs.js, no behavior change).
import supabase from './_supabase.js'
import { rateLimit } from './_ratelimit.js'
import crypto from 'node:crypto'
import { safeEqual, readBody } from './_jobs_util.js'

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

export { handleTelegramLinkStart, handleTelegramWebhook }

import supabase from './_supabase.js'

const UNKNOWN_IP = 'unknown'

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  if (Array.isArray(xff) && xff[0]) {
    return String(xff[0]).trim()
  }
  return UNKNOWN_IP
}

function floorWindowStart(windowSeconds) {
  const windowMs = windowSeconds * 1000
  const floored = Math.floor(Date.now() / windowMs) * windowMs
  return new Date(floored).toISOString()
}

function retryAfterSeconds(windowSeconds) {
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const windowEnd = Math.ceil(now / windowMs) * windowMs
  return Math.max(1, Math.ceil((windowEnd - now) / 1000))
}

export async function rateLimit(req, endpoint, max, windowSeconds = 60, keyOverride = null) {
  const keyPart = keyOverride ?? getClientIp(req)
  const bucket = `${endpoint}:${keyPart}`
  const windowStart = floorWindowStart(windowSeconds)
  const retryAfter = retryAfterSeconds(windowSeconds)

  if (!supabase) {
    return { allowed: true, retryAfter }
  }

  try {
    const { data, error } = await supabase.rpc('rl_increment', {
      p_bucket: bucket,
      p_window_start: windowStart,
      p_max: max,
    })
    if (error) {
      console.error('[ratelimit] rpc error', error.message)
      return { allowed: true, retryAfter }
    }
    return { allowed: data === true, retryAfter }
  } catch (err) {
    console.error('[ratelimit] error', err?.message)
    return { allowed: true, retryAfter }
  }
}

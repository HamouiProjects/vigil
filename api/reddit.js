const SUBREDDIT_RE = /^[A-Za-z0-9_]{1,50}$/

export default async function handler(req, res) {
  const { subreddit } = req.query
  if (!subreddit || !SUBREDDIT_RE.test(subreddit))
    return res.status(400).json({ error: 'invalid_subreddit' })

  res.setHeader('Cache-Control', 's-maxage=300')

  let r
  try {
    r = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, {
      headers: { 'User-Agent': 'web:vigil:v1.0 (situational awareness dashboard)' },
      signal: AbortSignal.timeout(10000),
    })
  } catch (e) {
    return res.status(502).json({ error: 'reddit_unavailable', status: 0 })
  }

  if (!r.ok)
    return res.status(502).json({ error: 'reddit_unavailable', status: r.status })

  return res.status(200).json(await r.json())
}

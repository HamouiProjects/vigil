const ALLOWED = new Set([
  'https://thevigilroom.com',
  'https://www.thevigilroom.com',
  'https://vigil-khaki.vercel.app',
  'http://localhost:5173',
])

export function applyCors(req, res) {
  const origin = req.headers?.origin
  if (origin && ALLOWED.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

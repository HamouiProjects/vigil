export const GN_SEARCH_URL = q =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`

export function nsExtractSource(title) { const p = (title ?? '').split(' - '); return p.length > 1 ? p[p.length - 1].trim() : '' }
export function nsCleanTitle(title) { const p = (title ?? '').split(' - '); return p.length > 1 ? p.slice(0, -1).join(' - ').trim() : (title ?? '') }

export const KF_DEFAULT_TABS = [
  { id: 'world',     keyword: 'World'     },
  { id: 'conflicts', keyword: 'Conflicts' },
  { id: 'economy',   keyword: 'Economy'   },
]

const EXCLUDED_DOMAINS = [
  'feeds.reuters.com', 'feeds.apnews.com', 'foxnews.com',
  'haaretz.com', 'arabnews.com', 'rt.com',
]

export const SUGGESTIONS = [
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', color: '#bb1919' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', color: '#bb1919' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', color: '#009966' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', color: '#003f8a' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', color: '#005689' },
  { name: 'Guardian US', url: 'https://www.theguardian.com/us-news/rss', color: '#005689' },
  { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', color: '#c8102e' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', color: '#4a235a' },
  { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', color: '#cc0000' },
  { name: 'NBC News', url: 'https://feeds.nbcnews.com/nbcnews/public/news', color: '#0a356d' },
  { name: 'The Hindu', url: 'https://www.thehindu.com/news/international/?service=rss', color: '#8b0000' },
  { name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', color: '#d32f2f' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss', color: '#1a6b3c' },
  { name: 'CGTN', url: 'https://www.cgtn.com/subscribe/rss/section/world.xml', color: '#c8102e' },
  { name: 'Politico', url: 'https://rss.politico.com/politics-news.xml', color: '#1a1a2e' },
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', color: '#2c3e50' },
  { name: 'The Economist', url: 'https://www.economist.com/the-world-this-week/rss.xml', color: '#e2001a' },
  { name: 'BBC Arabic', url: 'https://feeds.bbci.co.uk/arabic/rss.xml', color: '#bb1919' },
  { name: 'Al Jazeera Mubasher', url: 'https://www.aljazeeramubasher.net/rss.xml', color: '#009966' },
  { name: 'France 24 Arabic', url: 'https://www.france24.com/ar/rss', color: '#003f8a' },
  { name: 'France 24 FR', url: 'https://www.france24.com/fr/rss', color: '#003f8a' },
  { name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', color: '#bb1919' },
  { name: 'DW Deutsch', url: 'https://rss.dw.com/rdf/rss-de-all', color: '#c8102e' },
  { name: 'BBC Russian', url: 'https://feeds.bbci.co.uk/russian/rss.xml', color: '#bb1919' },
].filter(s => !EXCLUDED_DOMAINS.some(d => s.url.includes(d)))

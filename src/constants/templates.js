export const MIGRATION_FLAG = 'vigil_template_defaults_applied_v4'

// Widget rows per named workspace (types match renderWidgetComponent cases)
export const DEFAULT_TEMPLATES = {
  'CONFLICT WATCH': [
    { type: 'map',      x: 0,  y: 0,  w: 16, h: 14 },
    { type: 'feed',     x: 16, y: 0,  w: 8,  h: 7  },
    { type: 'rss',      x: 16, y: 7,  w: 8,  h: 7  },
    { type: 'conflict', x: 0,  y: 14, w: 8,  h: 7  },
    { type: 'social',   x: 8,  y: 14, w: 8,  h: 7  },
    { type: 'stream',   x: 16, y: 14, w: 8,  h: 7  },
  ],
  'MARKET IMPACT': [
    { type: 'prices',  x: 0,  y: 0,  w: 12, h: 8 },
    { type: 'chart',   x: 12, y: 0,  w: 12, h: 8 },
    { type: 'heatmap', x: 0,  y: 8,  w: 12, h: 8 },
    { type: 'feed',    x: 12, y: 8,  w: 12, h: 8 },
    { type: 'rss',     x: 0,  y: 16, w: 16, h: 8 },
  ],
  'TECH COLD WAR': [
    { type: 'map',     x: 0,  y: 0,  w: 14, h: 11 },
    { type: 'feed',    x: 14, y: 0,  w: 10, h: 6  },
    { type: 'rss',     x: 14, y: 6,  w: 10, h: 5  },
    { type: 'prices',  x: 0,  y: 11, w: 10, h: 7  },
    { type: 'browser', x: 10, y: 11, w: 14, h: 7  },
  ],
}

// Default news-search keywords per workspace name
export const TEMPLATE_KEYWORDS = {
  'CONFLICT WATCH': ['Gaza', 'Ukraine', 'Sudan'],
  'MARKET IMPACT':  ['Federal Reserve', 'Inflation', 'Earnings'],
  'TECH COLD WAR':  ['Semiconductors', 'Taiwan', 'AI regulation'],
}

// Per-template RSS feed defaults (keyed by workspace name)
export const TEMPLATE_RSS_DEFAULTS = {
  'MARKET IMPACT': [
    { id: 'ft',      name: 'Financial Times', url: 'https://www.ft.com/rss/home',                             enabled: true, color: '#fdcb6e' },
    { id: 'wsj',     name: 'WSJ Markets',     url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',           enabled: true, color: '#0984e3' },
    { id: 'mwatch',  name: 'MarketWatch',     url: 'https://feeds.marketwatch.com/marketwatch/topstories/',   enabled: true, color: '#e63946' },
    { id: 'seeka',   name: 'Seeking Alpha',   url: 'https://seekingalpha.com/market_currents.xml',            enabled: true, color: '#00b894' },
    { id: 'econ',    name: 'The Economist',   url: 'https://www.economist.com/finance-and-economics/rss.xml', enabled: true, color: '#a29bfe' },
  ],
  'TECH COLD WAR': [
    { id: 'register',  name: 'The Register',  url: 'https://www.theregister.com/headlines.atom',  enabled: true, color: '#e63946' },
    { id: 'restworld', name: 'Rest of World', url: 'https://restofworld.org/feed/',               enabled: true, color: '#00b894' },
    { id: 'scmp',      name: 'SCMP Tech',     url: 'https://www.scmp.com/rss/5/feed',             enabled: true, color: '#0984e3' },
    { id: 'nikkei',    name: 'Nikkei Asia',   url: 'https://asia.nikkei.com/rss/feed/nar',        enabled: true, color: '#fdcb6e' },
    { id: 'wired',     name: 'Wired',         url: 'https://www.wired.com/feed/rss',              enabled: true, color: '#a29bfe' },
  ],
}

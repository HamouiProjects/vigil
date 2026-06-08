export const WIDGET_TYPES = {
  MAP:       'map',
  FEEDS:     'feeds',
  FEED:      'feed',
  RSS:       'rss',
  PRICES:    'prices',
  STREAM:    'stream',
  WEATHER:   'weather',
  CONFLICT:  'conflict',
  CHART:     'chart',
  HEATMAP:   'heatmap',
  BROWSER:   'browser',
  SOCIAL:    'social',
}

export const WIDGET_CATALOG = [
  { type: 'map',       label: 'ATLAS',         icon: '🗺'  },
  { type: 'feeds',     label: 'Feeds',         icon: '🌐'  },
  { type: 'feed',      label: 'News Search',   icon: '📡'  },
  { type: 'rss',       label: 'RSS Feed',      icon: '📰'  },
  { type: 'prices',    label: 'Price Tracker', icon: '📈'  },
  { type: 'stream',    label: 'Livestream',    icon: '📺'  },
  { type: 'weather',   label: 'Weather',       icon: '🌤'  },
  // 'conflict' retired — functionality moved into ATLAS → CONFLICT tab
  { type: 'chart',     label: 'CHART',         icon: '📊'  },
  { type: 'heatmap',   label: 'Heatmap',       icon: '🟩'  },
  { type: 'browser',   label: 'Reader',        icon: '📄'  },
  { type: 'social',    label: 'SOCIAL FEED',   icon: '📡'  },
]

export const WIDGET_DEFAULTS = {
  map:       { w: 8,  h: 11 },
  feeds:     { w: 8,  h: 11 },
  feed:      { w: 4,  h: 11 },
  rss:       { w: 3,  h: 8  },
  prices:    { w: 3,  h: 8  },
  stream:    { w: 3,  h: 8  },
  weather:   { w: 3,  h: 8  },
  conflict:  { w: 8,  h: 12 },
  chart:     { w: 6,  h: 11 },
  heatmap:   { w: 6,  h: 8  },
  browser:   { w: 6,  h: 14 },
  social:    { w: 5,  h: 11 },
}

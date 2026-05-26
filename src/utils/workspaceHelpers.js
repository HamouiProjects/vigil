const AJ_EMBED = 'https://www.youtube.com/embed/live_stream?channel=UCNye-wNBqNL5ZzHSJj3l8Bg&autoplay=0&mute=1'

const DEFAULT_SETTINGS = {
  rssFeedUrl:     'https://feeds.bbci.co.uk/news/world/rss.xml',
  keywordFeedUrl: 'conflict',
  weatherCity:    'Berlin',
  livestreamUrl:  AJ_EMBED,
}

export const WS_META_KEY   = 'vigil_workspaces'
export const ACTIVE_WS_KEY = 'vigil_active_workspace'

export const settingsKey = id => `vigil_ws${id.replace('ws-', '')}_settings`
export const widgetsKey  = id => `vigil_ws${id.replace('ws-', '')}_widgets`
export const wsKey       = id => `vigil_workspace_${id.replace('ws-', '')}`

export const DEFAULT_WORKSPACES = [
  { id: 'ws-1', name: 'CONFLICT WATCH' },
  { id: 'ws-2', name: 'MARKET IMPACT'  },
  { id: 'ws-3', name: 'TECH COLD WAR'  },
]

const DEFAULT_WIDGETS_BY_WS = {
  'ws-1': [
    { id: 'atlas',    type: 'map'      },
    { id: 'feed',     type: 'feed'     },
    { id: 'rss',      type: 'rss'      },
    { id: 'conflict', type: 'conflict' },
    { id: 'social',   type: 'social'   },
    { id: 'stream',   type: 'stream'   },
  ],
  'ws-2': [
    { id: 'prices',  type: 'prices'  },
    { id: 'chart',   type: 'chart'   },
    { id: 'heatmap', type: 'heatmap' },
    { id: 'feed',    type: 'feed'    },
    { id: 'rss',     type: 'rss'     },
  ],
  'ws-3': [
    { id: 'atlas',   type: 'map'     },
    { id: 'feed',    type: 'feed'    },
    { id: 'rss',     type: 'rss'     },
    { id: 'prices',  type: 'prices'  },
    { id: 'browser', type: 'browser' },
  ],
}

const DEFAULT_LAYOUTS_BY_WS = {
  'ws-1': [
    { i: 'atlas',    x: 0,  y: 0,  w: 16, h: 14 },
    { i: 'feed',     x: 16, y: 0,  w: 8,  h: 7  },
    { i: 'rss',      x: 16, y: 7,  w: 8,  h: 7  },
    { i: 'conflict', x: 0,  y: 14, w: 8,  h: 7  },
    { i: 'social',   x: 8,  y: 14, w: 8,  h: 7  },
    { i: 'stream',   x: 16, y: 14, w: 8,  h: 7  },
  ],
  'ws-2': [
    { i: 'prices',  x: 0,  y: 0,  w: 12, h: 8 },
    { i: 'chart',   x: 12, y: 0,  w: 12, h: 8 },
    { i: 'heatmap', x: 0,  y: 8,  w: 12, h: 8 },
    { i: 'feed',    x: 12, y: 8,  w: 12, h: 8 },
    { i: 'rss',     x: 0,  y: 16, w: 16, h: 8 },
  ],
  'ws-3': [
    { i: 'atlas',   x: 0,  y: 0,  w: 14, h: 11 },
    { i: 'feed',    x: 14, y: 0,  w: 10, h: 6  },
    { i: 'rss',     x: 14, y: 6,  w: 10, h: 5  },
    { i: 'prices',  x: 0,  y: 11, w: 10, h: 7  },
    { i: 'browser', x: 10, y: 11, w: 14, h: 7  },
  ],
}

export function readSettings(wsId) {
  try {
    const raw = localStorage.getItem(settingsKey(wsId))
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function readWorkspacesMeta() {
  try {
    const raw = localStorage.getItem(WS_META_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_WORKSPACES
  } catch { return DEFAULT_WORKSPACES }
}

export function readWidgets(wsId) {
  try {
    const raw = localStorage.getItem(widgetsKey(wsId))
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) return p }
    return DEFAULT_WIDGETS_BY_WS[wsId] ?? []
  } catch { return DEFAULT_WIDGETS_BY_WS[wsId] ?? [] }
}

export function readLayout(wsId) {
  try {
    const raw = localStorage.getItem(wsKey(wsId))
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length > 0) return p }
    return DEFAULT_LAYOUTS_BY_WS[wsId] ?? []
  } catch { return DEFAULT_LAYOUTS_BY_WS[wsId] ?? [] }
}

export function resolveInitialWs() {
  try {
    const wsList = readWorkspacesMeta()
    const saved  = localStorage.getItem(ACTIVE_WS_KEY)
    return (saved && wsList.some(w => w.id === saved)) ? saved : (wsList[0]?.id ?? 'ws-1')
  } catch { return 'ws-1' }
}

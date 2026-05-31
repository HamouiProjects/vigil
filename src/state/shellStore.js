import { create } from 'zustand'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { devOverride } from '../entitlements/devOverride.js'
import { withinLimit } from '../entitlements/index.js'
import { widgetRegistry } from '../shell/widgetRegistry.js'

const DEMO_WS_ID = 'demo-ws'
const DEMO_WEATHER_ID = 'demo-weather'

export const SEED_WORKSPACES = [
  {
    id: DEMO_WS_ID,
    name: 'Demo',
    widgets: [
      {
        id: DEMO_WEATHER_ID,
        type: 'weather',
        config: { city: 'Berlin', latLon: null, locName: 'Berlin' },
      },
    ],
    layout: [
      { i: DEMO_WEATHER_ID, x: 0, y: 0, w: 8, h: 8 },
    ],
  },
]

const DEFAULT_WIDGET_CONFIG = {
  weather: { city: 'Berlin', latLon: null, locName: 'Berlin' },
}

const DEFAULT_WIDGET_SIZE = { w: 8, h: 8 }

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function defaultLayoutEntry(id, layout) {
  let y = 0
  for (const item of layout) {
    y = Math.max(y, item.y + item.h)
  }
  return { i: id, x: 0, y, ...DEFAULT_WIDGET_SIZE }
}

const initialEntitlements = import.meta.env.DEV && devOverride.enabled
  ? resolveEntitlements(devOverride.plan, devOverride.addOns)
  : resolveEntitlements('free', [])

export const useShellStore = create((set, get) => ({
  loaded: false,
  uid: null,
  globalLive: true,
  activeWs: DEMO_WS_ID,
  pausedWorkspaces: [],
  inactiveTabPause: true,
  entitlements: initialEntitlements,
  workspaces: SEED_WORKSPACES,

  hydrate: ({ uid, workspaces, activeWs }) => set({
    uid,
    workspaces,
    activeWs: activeWs ?? workspaces[0]?.id,
    loaded: true,
  }),

  setGlobalLive: (v) => set({ globalLive: v }),
  setActiveWs: (wsId) => set({ activeWs: wsId }),
  toggleWorkspacePause: (wsId) => set((s) => ({
    pausedWorkspaces: s.pausedWorkspaces.includes(wsId)
      ? s.pausedWorkspaces.filter(id => id !== wsId)
      : [...s.pausedWorkspaces, wsId],
  })),
  setInactiveTabPause: (v) => set({ inactiveTabPause: v }),
  setEntitlements: (ent) => set({ entitlements: ent }),

  addWorkspace: (name) => {
    const s = get()
    if (!withinLimit(s.entitlements, 'workspaces', s.workspaces.length + 1)) return false
    const id = newId('ws')
    const ws = { id, name: name?.trim() || `Workspace ${s.workspaces.length + 1}`, widgets: [], layout: [] }
    set({
      workspaces: [...s.workspaces, ws],
      activeWs: id,
    })
    return true
  },

  removeWorkspace: (wsId) => {
    const s = get()
    const next = s.workspaces.filter(ws => ws.id !== wsId)
    if (!next.length) return
    const nextActive = s.activeWs === wsId ? next[0].id : s.activeWs
    set({
      workspaces: next,
      activeWs: nextActive,
      pausedWorkspaces: s.pausedWorkspaces.filter(id => id !== wsId),
    })
  },

  addWidget: (wsId, type) => {
    const s = get()
    if (!widgetRegistry[type]) return false
    const ws = s.workspaces.find(w => w.id === wsId)
    if (!ws) return false
    if (!withinLimit(s.entitlements, 'widgetsPerWorkspace', ws.widgets.length + 1)) return false

    const id = newId('w')
    const widget = {
      id,
      type,
      config: { ...(DEFAULT_WIDGET_CONFIG[type] ?? {}) },
    }
    const layoutItem = defaultLayoutEntry(id, ws.layout)

    set({
      workspaces: s.workspaces.map(w =>
        w.id === wsId
          ? { ...w, widgets: [...w.widgets, widget], layout: [...w.layout, layoutItem] }
          : w
      ),
    })
    return true
  },

  removeWidget: (wsId, widgetId) => {
    set((s) => ({
      workspaces: s.workspaces.map(ws =>
        ws.id === wsId
          ? {
              ...ws,
              widgets: ws.widgets.filter(w => w.id !== widgetId),
              layout: ws.layout.filter(l => l.i !== widgetId),
            }
          : ws
      ),
    }))
  },

  updateLayout: (wsId, layout) => set((s) => ({
    workspaces: s.workspaces.map(ws =>
      ws.id === wsId ? { ...ws, layout } : ws
    ),
  })),

  updateWidgetConfig: (wsId, widgetId, config) => set((s) => ({
    workspaces: s.workspaces.map(ws =>
      ws.id === wsId
        ? {
            ...ws,
            widgets: ws.widgets.map(w =>
              w.id === widgetId ? { ...w, config } : w
            ),
          }
        : ws
    ),
  })),
}))

export function isWorkspacePaused(state, wsId) {
  return state.pausedWorkspaces.includes(wsId)
    || !state.globalLive
    || (wsId !== state.activeWs && state.inactiveTabPause)
}

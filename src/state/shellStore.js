import { create } from 'zustand'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { devOverride } from '../entitlements/devOverride.js'

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

const initialEntitlements = import.meta.env.DEV
  ? resolveEntitlements(devOverride.plan, devOverride.addOns)
  : resolveEntitlements('free', [])

export const useShellStore = create((set) => ({
  globalLive: true,
  activeWs: DEMO_WS_ID,
  pausedWorkspaces: [],
  inactiveTabPause: true,
  entitlements: initialEntitlements,
  workspaces: SEED_WORKSPACES,

  setGlobalLive: (v) => set({ globalLive: v }),
  setActiveWs: (wsId) => set({ activeWs: wsId }),
  toggleWorkspacePause: (wsId) => set((s) => ({
    pausedWorkspaces: s.pausedWorkspaces.includes(wsId)
      ? s.pausedWorkspaces.filter(id => id !== wsId)
      : [...s.pausedWorkspaces, wsId],
  })),
  setInactiveTabPause: (v) => set({ inactiveTabPause: v }),
  setEntitlements: (ent) => set({ entitlements: ent }),

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

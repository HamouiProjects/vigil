import { create } from 'zustand'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { devOverride } from '../entitlements/devOverride.js'

const initialEntitlements = import.meta.env.DEV
  ? resolveEntitlements(devOverride.plan, devOverride.addOns)
  : resolveEntitlements('free', [])

export const useShellStore = create((set) => ({
  globalLive: true,
  activeWs: null,
  pausedWorkspaces: [],
  inactiveTabPause: true,
  entitlements: initialEntitlements,

  setGlobalLive: (v) => set({ globalLive: v }),
  setActiveWs: (wsId) => set({ activeWs: wsId }),
  toggleWorkspacePause: (wsId) => set((s) => ({
    pausedWorkspaces: s.pausedWorkspaces.includes(wsId)
      ? s.pausedWorkspaces.filter(id => id !== wsId)
      : [...s.pausedWorkspaces, wsId],
  })),
  setInactiveTabPause: (v) => set({ inactiveTabPause: v }),
  setEntitlements: (ent) => set({ entitlements: ent }),
}))

export function isWorkspacePaused(state, wsId) {
  return state.pausedWorkspaces.includes(wsId)
    || !state.globalLive
    || (wsId !== state.activeWs && state.inactiveTabPause)
}

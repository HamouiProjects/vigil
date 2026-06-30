const SETTINGS_KEY = 'vigil_global_settings'
const DEFAULTS = { inactiveTabPause: false, globalLive: true, pausedWorkspaces: [] }
let listeners = []

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } }
  catch { return { ...DEFAULTS } }
}

export function subscribeSettings(callback) {
  listeners.push(callback)
  return () => { listeners = listeners.filter(fn => fn !== callback) }
}

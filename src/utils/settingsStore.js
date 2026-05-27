const SETTINGS_KEY = 'vigil_global_settings'
const DEFAULTS = { inactiveTabPause: false, globalLive: true, pausedWorkspaces: [] }
let listeners = []

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } }
  catch { return { ...DEFAULTS } }
}

export function saveSettings(partial) {
  const next = { ...getSettings(), ...partial }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch {}
  listeners.forEach(fn => fn(next))
  return next
}

export function subscribeSettings(callback) {
  listeners.push(callback)
  return () => { listeners = listeners.filter(fn => fn !== callback) }
}

export function isWorkspacePaused(wsId) {
  return getSettings().pausedWorkspaces.includes(wsId)
}

export function toggleWorkspacePause(wsId) {
  const s = getSettings()
  const paused = s.pausedWorkspaces.includes(wsId)
  return saveSettings({ pausedWorkspaces: paused ? s.pausedWorkspaces.filter(id => id !== wsId) : [...s.pausedWorkspaces, wsId] })
}

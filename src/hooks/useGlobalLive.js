import { useState, useEffect } from 'react'
import { getSettings, saveSettings, subscribeSettings } from '../utils/settingsStore'

;(function resetGlobalLiveOnLoad() {
  const s = getSettings()
  if (!s.globalLive) saveSettings({ globalLive: true })
})()

export default function useGlobalLive() {
  const [inactiveTabPause, setInactiveTabPause] = useState(() => getSettings().inactiveTabPause)
  const [pausedWorkspaces, setPausedWorkspaces] = useState(() => getSettings().pausedWorkspaces ?? [])
  const [globalLive,       setGlobalLive]       = useState(() => getSettings().globalLive)

  useEffect(() => subscribeSettings(s => {
    setInactiveTabPause(s.inactiveTabPause)
    setPausedWorkspaces(s.pausedWorkspaces ?? [])
    setGlobalLive(s.globalLive)
  }), [])

  return { globalLive, pausedWorkspaces, inactiveTabPause }
}

import { useEffect, useRef, useState } from 'react'
import { getSettings, subscribeSettings } from '../utils/settingsStore'

export function usePolling(fetchFn, intervalMs, { isLive = true } = {}) {
  const fetchRef = useRef(fetchFn)
  fetchRef.current = fetchFn

  const [globalLive, setGlobalLive] = useState(() => getSettings().globalLive)
  useEffect(() => subscribeSettings(s => setGlobalLive(s.globalLive)), [])

  const shouldPoll = globalLive && isLive
  useEffect(() => {
    if (!shouldPoll) return
    fetchRef.current()
    const id = setInterval(() => fetchRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [shouldPoll, intervalMs])
}

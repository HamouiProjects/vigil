import { useEffect, useRef } from 'react'

// Global pause is already folded into the caller's isLive flag: shellStore.globalLive
// flows through isWorkspacePaused -> WidgetHost effectivePaused -> the widget paused
// prop -> isLive. So this hook only needs to gate on isLive.
export function usePolling(fetchFn, intervalMs, { isLive = true } = {}) {
  const fetchRef = useRef(fetchFn)
  fetchRef.current = fetchFn

  useEffect(() => {
    if (!isLive) return
    fetchRef.current()
    const id = setInterval(() => fetchRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [isLive, intervalMs])
}

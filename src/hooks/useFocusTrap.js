import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0
  )
}

export function useFocusTrap(containerRef) {
  const previousActiveElement = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    previousActiveElement.current = document.activeElement

    const focusable = getFocusableElements(container)
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      container.tabIndex = -1
      container.focus()
    }

    function onKeyDown(e) {
      if (e.key !== 'Tab') return
      const items = getFocusableElements(container)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last || !container.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      const prev = previousActiveElement.current
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus()
      }
    }
  }, [containerRef])
}

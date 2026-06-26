import { useEffect } from 'react'
import { useShellStore } from '../state/shellStore.js'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { devOverride } from '../entitlements/devOverride.js'
import { ensureSession } from './session.js'
import { cloneRoom, loadWorkspaces, saveWorkspaces } from './workspacesRepo.js'
import { BL10_TEMPLATE } from './seedTemplate.js'
import { loadSubscription } from './subscriptionRepo.js'
import { listSources } from './sourcesRepo.js'

export function useShellPersistence() {
  useEffect(() => {
    let t
    let unsub

    ;(async () => {
      try {
        const uid = await ensureSession()

        if (!(import.meta.env.DEV && devOverride.enabled)) {
          const sub = await loadSubscription(uid)
          useShellStore.getState().setEntitlements(
            resolveEntitlements(sub?.plan ?? 'free', sub?.addOns ?? [], sub?.status),
          )
        }

        let [wss, srcs] = await Promise.all([loadWorkspaces(uid), listSources(uid)])
        if (!wss.length) {
          await cloneRoom(uid, BL10_TEMPLATE)
          ;[wss, srcs] = await Promise.all([loadWorkspaces(uid), listSources(uid)])
        }

        let savedActive = null
        try { savedActive = localStorage.getItem('vigil_active_ws') } catch {}
        const initialActive = wss.some(w => w.id === savedActive) ? savedActive : wss[0]?.id

        useShellStore.getState().hydrate({
          uid,
          workspaces: wss,
          activeWs: initialActive,
          sources: srcs,
        })

        unsub = useShellStore.subscribe((state, prev) => {
          if (state.activeWs !== prev.activeWs && state.activeWs) {
            try { localStorage.setItem('vigil_active_ws', state.activeWs) } catch {}
          }
          if (state.workspaces === prev.workspaces || !state.uid) return
          clearTimeout(t)
          t = setTimeout(
            () => saveWorkspaces(state.uid, state.workspaces).catch(console.error),
            800,
          )
        })
      } catch (e) {
        console.error(e)
      }
    })()

    return () => {
      clearTimeout(t)
      unsub?.()
    }
  }, [])
}

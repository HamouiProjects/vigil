import { useEffect } from 'react'
import { useShellStore } from '../state/shellStore.js'
import { resolveEntitlements } from '../entitlements/resolve.js'
import { devOverride } from '../entitlements/devOverride.js'
import { ensureSession } from './session.js'
import { loadWorkspaces, saveWorkspaces } from './workspacesRepo.js'
import { loadSubscription } from './subscriptionRepo.js'

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
            resolveEntitlements(sub?.plan ?? 'free', sub?.addOns ?? []),
          )
        }

        let wss = await loadWorkspaces(uid)
        if (!wss.length) {
          wss = useShellStore.getState().workspaces
          await saveWorkspaces(uid, wss)
        }

        useShellStore.getState().hydrate({ uid, workspaces: wss, activeWs: wss[0]?.id })

        unsub = useShellStore.subscribe((state, prev) => {
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

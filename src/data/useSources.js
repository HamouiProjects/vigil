import { useShellStore } from '../state/shellStore.js'
import { createSource, deleteSource } from './sourcesRepo.js'

export function useSources() {
  const uid = useShellStore(s => s.uid)
  const sources = useShellStore(s => s.sources)

  async function addSource({ type, identifier, label, meta }) {
    if (!uid) return null
    const row = await createSource(uid, { type, identifier, label, meta })
    useShellStore.getState().addSourceLocal(row)
    return row
  }

  async function removeSource(id) {
    if (!uid) return
    await deleteSource(uid, id)
    useShellStore.getState().removeSourceLocal(id)
  }

  return { sources, addSource, removeSource }
}

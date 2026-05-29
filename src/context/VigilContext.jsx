import { createContext, useContext } from 'react'
import useWorkspaces from '../hooks/useWorkspaces'
import useGlobalLive from '../hooks/useGlobalLive'

export const VigilContext = createContext(null)

export function VigilProvider({ children }) {
  const ws   = useWorkspaces()
  const live = useGlobalLive()
  return (
    <VigilContext.Provider value={{ ...ws, ...live }}>
      {children}
    </VigilContext.Provider>
  )
}

export function useVigil() {
  return useContext(VigilContext)
}

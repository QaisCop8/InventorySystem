import React, { createContext, useContext, useState } from "react"
const Ctx = createContext<any>(null)
export const useAuth = () => useContext(Ctx)
export function AuthProvider({ children }: any) {
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null)
  ;(window as any).__setBranch = setActiveBranchId
  return <Ctx.Provider value={{ activeBranchId }}>{children}</Ctx.Provider>
}

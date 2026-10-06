import React from "react"
const value = { user: { id: "1", fullName: "Qais", username: "qais", branchId: 1 }, hasPermission: () => true, permissions: [] } as any
export const useAuth = () => value
export const AuthProvider = ({ children }: any) => <>{children}</>

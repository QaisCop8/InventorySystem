"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { ThemeLoader } from "@/components/theme-loader"
interface ModulePermissions {
  add?: boolean
  edit?: boolean
  view?: boolean
  print?: boolean
  export?: boolean
  [key: string]: boolean | undefined
}
interface User {
  id: string
  username: string
  fullName: string
  email: string
  role: string
  department: string
  permissions: { [module: string]: ModulePermissions }
  organizationId: number
  isActive: boolean
  lastLogin?: Date
  defaultScreen?: string
  branchId?: number
  branchName?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  activeBranchId: number | null
  activeBranchName: string | null
  activeDepartment: string | null
  login: (credentials: { username: string; password: string; rememberMe: boolean }) => Promise<void>
  logout: () => void
  hasPermission: (permission: string) => boolean
  refreshUser: () => Promise<void>
  getDefaultScreen: () => string
  setActiveBranchContext: (branch: { id: number; name: string } | null) => void
  setActiveDepartmentContext: (department: string | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null)
  const [activeBranchName, setActiveBranchName] = useState<string | null>(null)
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null)

  useEffect(() => {
    console.log("[v0] useEffect triggered!")

    if (typeof window === "undefined") {
      console.log("[v0] Window is undefined, skipping auth initialization")
      setIsLoading(false)
      return
    }

    const initializeAuth = async () => {
      console.log("[v0] Starting auth initialization...")

      try {
        const savedUser = localStorage.getItem("erp_user") || sessionStorage.getItem("erp_user")
        const savedToken = localStorage.getItem("erp_token") || sessionStorage.getItem("erp_token")
        let savedSession = localStorage.getItem("erp_session") || sessionStorage.getItem("erp_session")
        const savedBranch = localStorage.getItem("erp_active_branch") || sessionStorage.getItem("erp_active_branch")
        const savedDepartment = localStorage.getItem("erp_active_department") || sessionStorage.getItem("erp_active_department")

        if (savedUser && savedToken) {

          if (!savedSession) {
            savedSession = JSON.stringify({
              timestamp: new Date().getTime(),
              rememberMe: false,
            })
          }

          const sessionData = JSON.parse(savedSession)
          const now = new Date().getTime()

          // Check if session is still valid (24 hours)
          if (now - sessionData.timestamp < 24 * 60 * 60 * 1000) {
            const userData = JSON.parse(savedUser)
            setUser(userData)
            setIsAuthenticated(true)

            if (savedBranch) {
              try {
                const parsedBranch = JSON.parse(savedBranch)
                setActiveBranchId(parsedBranch?.id ?? null)
                setActiveBranchName(parsedBranch?.name ?? null)
              } catch {
                setActiveBranchId(null)
                setActiveBranchName(null)
              }
            }

            if (savedDepartment) {
              setActiveDepartment(savedDepartment)
            } else if (userData?.department) {
              setActiveDepartment(userData.department)
            }

            // Refresh user permissions from database
            try {

            } catch (permError) {
            }
          } else {
            clearAuthData()
          }
        } else {
          clearAuthData()
        }

      } catch (error) {
        console.error("[v0] Auth initialization error:", error)
        clearAuthData()
      } finally {
        setIsLoading(false)
      }
    }
    initializeAuth()
  }, [])

  const clearAuthData = () => {
    if (typeof window === "undefined") return

    localStorage.removeItem("erp_user")
    localStorage.removeItem("erp_token")
    localStorage.removeItem("erp_session")
    sessionStorage.removeItem("erp_user")
    sessionStorage.removeItem("erp_token")
    sessionStorage.removeItem("erp_session")
    sessionStorage.removeItem("erp_active_branch")
    sessionStorage.removeItem("erp_active_department")
    sessionStorage.removeItem("default_screen_opened");
    localStorage.removeItem("erp_active_branch")
    localStorage.removeItem("erp_active_department")
    setUser(null)
    setIsAuthenticated(false)
    setActiveBranchId(null)
    setActiveBranchName(null)
    setActiveDepartment(null)
  }

  interface AccessItem {
    access_name: any
    id: number
    name: string
    category_name: string
    is_granted?: boolean,
    access_id: number
  }

  const persistBranchContext = (branch: { id: number; name: string } | null, department: string | null) => {
    if (typeof window === "undefined") return

    if (branch) {
      const branchValue = JSON.stringify(branch)
      localStorage.setItem("erp_active_branch", branchValue)
      sessionStorage.setItem("erp_active_branch", branchValue)
    } else {
      localStorage.removeItem("erp_active_branch")
      sessionStorage.removeItem("erp_active_branch")
    }

    if (department) {
      localStorage.setItem("erp_active_department", department)
      sessionStorage.setItem("erp_active_department", department)
    } else {
      localStorage.removeItem("erp_active_department")
      sessionStorage.removeItem("erp_active_department")
    }
  }

  const setActiveBranchContext = (branch: { id: number; name: string } | null) => {
    setActiveBranchId(branch?.id ?? null)
    setActiveBranchName(branch?.name ?? null)
    persistBranchContext(branch, activeDepartment)
  }

  const setActiveDepartmentContext = (department: string | null) => {
    setActiveDepartment(department)
    persistBranchContext(activeBranchId ? { id: activeBranchId, name: activeBranchName || "" } : null, department)
  }
  const refreshUserPermissions = async (userId: string) => {
    try {
      localStorage.removeItem('user_Access_List');
      const res = await fetch(`/api/settings/user/user-access?userId=${userId}`)
      const data: AccessItem[] = await res.json()
      console.log("[v0] Fetched user permissions:", data)
      const ua: Record<string, Record<string, boolean>> = {}
      data.forEach(item => {
        const key = item.access_id
        ua[key] = { view: !!item.is_granted } // extend for more actions if needed
      })
      localStorage.setItem('user_Access_List', JSON.stringify(data))
    } catch (error) {
      console.error("[v0] Failed to refresh permissions:", error)
      throw error
    }
  }



  const login = async (credentials: { username: string; password: string; rememberMe: boolean }) => {
    console.log("[v0] Login attempt for:", credentials.username)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      })

      const result = await response.json()

      if (result.success && result.user) {
        setUser(result.user)
        setIsAuthenticated(true)

        if (result.user.department) {
          setActiveDepartment(result.user.department)
        }

        const sessionData = {
          timestamp: new Date().getTime(),
          rememberMe: credentials.rememberMe,
        }

        try {
          if (credentials.rememberMe) {
            localStorage.setItem("erp_user", JSON.stringify(result.user))
            localStorage.setItem("erp_token", result.token)
            localStorage.setItem("erp_session", JSON.stringify(sessionData))
          } else {
            sessionStorage.setItem("erp_user", JSON.stringify(result.user))
            sessionStorage.setItem("erp_token", result.token)
            sessionStorage.setItem("erp_session", JSON.stringify(sessionData))
          }
        } catch (storageError) {
          console.error("[v0] Failed to save session data:", storageError)
        }
        console.log("result result result login ", result)
        // Navigate to dashboard_layout after login
        /*setTimeout(() => {
          window.location.href = "/dashboard_layout"
        }, 100)*/
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("OPEN_DEFAULT_SCREEN"));
        }, 100);
        fetchSettings();
        await refreshUserPermissions(result.user.id)
      } else {
        throw new Error(result.error || "فشل في تسجيل الدخول")
      }
    } catch (error) {
      console.error("[v0] Login error:", error)
      throw error
    }
  }

  const fetchSettings = async () => {
    try {
      const screenRes = await fetch(
        `/api/voucher-settings?target=screen`
      );
      const printRes = await fetch(
        `/api/voucher-settings?&target=print`
      );

      const screenData = await screenRes.json();
      const printData = await printRes.json();

      localStorage.setItem('screenData', JSON.stringify(screenData))
      localStorage.setItem('printData', JSON.stringify(printData))
    } catch (err) {
      console.error(err);
    } finally {
    }
  };
  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.id }),
      })
    } catch (error) {
      console.error("Logout API error:", error)
    } finally {
      clearAuthData()
      if (typeof window !== "undefined") {
        sessionStorage.clear()
      }
    }
  }

  const refreshUser = async () => {
    if (!user) return

    try {
      await refreshUserPermissions(user.id)
    } catch (error) {
      console.error("Failed to refresh user:", error)
    }
  }

  const hasPermission = (modulePermission: string): boolean => {
    if (!user || !user.permissions) return false;

    // "جميع الصلاحيات" bypass
    if (user.permissions["all"] || user.permissions["جميع الصلاحيات"]) return true;

    const [module, act] = modulePermission.split("-"); // e.g., "customers-view"
    const permModule = user.permissions[module];
    if (!permModule) return false;

    return permModule[act] === true;
  };


  const getDefaultScreen = (): string => {
    if (!user) return "dashboard"
    return user.defaultScreen || getDefaultScreenForRole(user.role)
  }

  const getDefaultScreenForRole = (role: string): string => {
    const roleScreenMap: Record<string, string> = {
      "مدير النظام": "dashboard",
      "مدير المبيعات": "sales-orders",
      "مدير المشتريات": "purchase-orders",
      محاسب: "reports",
      "مندوب مبيعات": "sales-orders",
      "موظف مخازن": "inventory",
    }
    return roleScreenMap[role] || "dashboard"
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        activeBranchId,
        activeBranchName,
        activeDepartment,
        login,
        logout,
        hasPermission,
        refreshUser,
        getDefaultScreen,
        setActiveBranchContext,
        setActiveDepartmentContext,
      }}
    >
      {isAuthenticated && user && <ThemeLoader userId={user.id} />}
      {children}
    </AuthContext.Provider>
  )
}

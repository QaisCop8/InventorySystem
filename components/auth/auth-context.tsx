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
  permissionVersion: number
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
  const [permissionVersion, setPermissionVersion] = useState(0)

  useEffect(() => {
    // يُلحق كل طلب fetch من هذا التبويب بهيدر x-tenant-db (إن وُجدت شركة مُختارة له في
    // sessionStorage، غير المشتركة بين تبويبات المتصفح) — هذا هو ما يجعل بالإمكان فتح شركات
    // مختلفة في تبويبات مختلفة في آنٍ واحد رغم أن كوكي tenant_db وحدها مشتركة بينها جميعاً.
    // localStorage احتياط فقط لتبويب جديد لم يختر شركته الخاصة بعد (انظر شرح tenant-client.ts).
    // مُطبَّق مرة واحدة فقط عبر علم على window لتفادي لف fetch عدة مرات مع إعادة تركيب المكوّن.
    if (typeof window !== "undefined" && !(window as any).__tenantFetchPatched) {
      const originalFetch = window.fetch.bind(window)
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const tenantDb = sessionStorage.getItem("active_tenant_db") || localStorage.getItem("active_tenant_db")
        // نفس فكرة x-tenant-db أعلاه بالضبط، لكن للفرع النشط (erp_active_branch: JSON {id,name} —
        // انظر persistBranchContext أدناه) — يحتاجه الخادم لتصفية نتائج بحث الأصناف/العملاء/الحسابات
        // حسب صلاحيات الفرع (سجل مقيَّد بفروع معيّنة لا يظهر إلا لمستخدم فرعه أحدها؛ سجل بلا أي فرع
        // مُحدَّد يبقى ظاهراً للجميع). كان هذا السياق عميل-فقط سابقاً (React state) بلا أي وسيلة
        // لوصوله للخادم إطلاقاً.
        const branchRaw = sessionStorage.getItem("erp_active_branch") || localStorage.getItem("erp_active_branch")
        let branchId: number | null = null
        if (branchRaw) {
          try {
            branchId = JSON.parse(branchRaw)?.id ?? null
          } catch {
            branchId = null
          }
        }
        // x-user-id: يتيح لمسارات API التحقق الفعلي من صلاحيات المستخدم عبر hasEffectivePermission/
        // getGrantedBranchIds (lib/permissions.ts) بدل الاكتفاء بقراءة Util.checkUserAccess المخزَّنة
        // بـlocalStorage بالواجهة فقط (لا يمنع طلب fetch فعلياً، فقط يُخفي العرض). نفس مصدر المعرِّف
        // الذي تستخدمه Util.checkUserAccess نفسها (savedUser?.id ?? savedUser?.user_id) للاتساق.
        let userId: string | null = null
        const userRaw = localStorage.getItem("erp_user") || sessionStorage.getItem("erp_user")
        if (userRaw) {
          try {
            const savedUser = JSON.parse(userRaw)
            userId = savedUser?.id ?? savedUser?.user_id ?? null
          } catch {
            userId = null
          }
        }
        if (tenantDb || branchId != null || userId) {
          const headers = new Headers(init?.headers)
          if (tenantDb) headers.set("x-tenant-db", tenantDb)
          if (branchId != null) headers.set("x-branch-id", String(branchId))
          if (userId) headers.set("x-user-id", userId)
          init = { ...init, headers }
        }
        return originalFetch(input, init)
      }) as typeof window.fetch
      ;(window as any).__tenantFetchPatched = true
    }

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

            let permissionBranchId: number | null = userData?.branchId ?? null
            if (savedBranch) {
              try {
                const parsedBranch = JSON.parse(savedBranch)
                setActiveBranchId(parsedBranch?.id ?? null)
                setActiveBranchName(parsedBranch?.name ?? null)
                permissionBranchId = parsedBranch?.id ?? permissionBranchId
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

            // مزامنة تعريفات الصلاحيات الجديدة (أنواع/أدوار وظيفية) من قاعدة الإدارة لهذه الشركة —
            // قبل تحديث صلاحيات المستخدم مباشرة (السطر التالي) حتى يظهر أي تعريف جديد أُضيف هناك
            // فوراً بنفس هذا التحميل، بلا أي سكربت يدوي لكل شركة. فشلها لا يمنع تسجيل الدخول (best
            // effort — انظر lib/permissions.ts).
            try {
              await fetch("/api/settings/permissions/sync", { method: "POST" })
            } catch (syncError) {
              console.error("[v0] Failed to sync permission definitions on init:", syncError)
            }

            // إعادة جلب صلاحيات المستخدم من قاعدة الشركة الحالية دوماً عند تحميل الصفحة — لا يكفي
            // الاكتفاء بما كان مخزَّناً في localStorage من آخر مرة، فهذا الاستدعاء نفسه هو ما يُشغَّل
            // بعد التبديل بين الشركات (activateCompany يُتبَع دوماً بإعادة تحميل/تنقّل كامل يُعيد
            // تركيب AuthProvider)، وبلا هذا التحديث تبقى صلاحيات الشركة السابقة معروضة خطأً هنا.
            try {
              await refreshUserPermissions(userData.id, permissionBranchId)
            } catch (permError) {
              console.error("[v0] Failed to refresh permissions on init:", permError)
            }
            setUser(userData)
            setIsAuthenticated(true)
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
    if (branch && user) {
      void refreshUserPermissions(user.id, branch.id)
        .then(() => {
          setActiveBranchId(branch.id)
          setActiveBranchName(branch.name)
          persistBranchContext(branch, activeDepartment)
        })
        .catch((error) => console.error("[auth] Failed to switch branch permissions", error))
      return
    }
    setActiveBranchId(branch?.id ?? null)
    setActiveBranchName(branch?.name ?? null)
    persistBranchContext(branch, activeDepartment)
  }

  const setActiveDepartmentContext = (department: string | null) => {
    setActiveDepartment(department)
    persistBranchContext(activeBranchId ? { id: activeBranchId, name: activeBranchName || "" } : null, department)
  }
  const refreshUserPermissions = async (userId: string, branchId?: number | null) => {
    try {
      let resolvedBranchId = Number(branchId) || null
      if (!resolvedBranchId) {
        const storedBranch = sessionStorage.getItem("erp_active_branch") || localStorage.getItem("erp_active_branch")
        if (storedBranch) {
          try { resolvedBranchId = Number(JSON.parse(storedBranch)?.id) || null } catch { resolvedBranchId = null }
        }
      }
      const branchQuery = resolvedBranchId ? `&branchId=${resolvedBranchId}` : ""
      const res = await fetch(`/api/settings/user/user-access?userId=${encodeURIComponent(userId)}${branchQuery}`)
      if (!res.ok) throw new Error(`Failed to load permissions (${res.status})`)
      const data: AccessItem[] = await res.json()
      if (!Array.isArray(data)) throw new Error("Invalid permissions response")
      console.log("[v0] Fetched user permissions:", data)
      const ua: Record<string, Record<string, boolean>> = {}
      data.forEach(item => {
        const key = item.access_id
        ua[key] = { view: !!item.is_granted } // extend for more actions if needed
      })
      localStorage.setItem('user_Access_List', JSON.stringify(data))
      localStorage.setItem(`user_Access_List:${userId}:${resolvedBranchId || "default"}`, JSON.stringify(data))
      setPermissionVersion((current) => current + 1)
      window.dispatchEvent(new CustomEvent("user-permissions-updated", { detail: { userId, branchId: resolvedBranchId } }))
    } catch (error) {
      console.error("[v0] Failed to refresh permissions:", error)
      throw error
    }
  }

  useEffect(() => {
    const handlePermissionsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; branchId?: number }>).detail
      if (!user?.id || String(detail?.userId) !== String(user.id)) return
      if (detail?.branchId && activeBranchId && Number(detail.branchId) !== Number(activeBranchId)) return
      void refreshUserPermissions(user.id, detail?.branchId || activeBranchId)
    }

    window.addEventListener("user-permissions-changed", handlePermissionsChanged)
    return () => window.removeEventListener("user-permissions-changed", handlePermissionsChanged)
  }, [user?.id, activeBranchId])



  const login = async (credentials: { username: string; password: string; rememberMe: boolean }) => {
    console.log("[v0] Login attempt for:", credentials.username)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        throw new Error(errorText || `Login failed (${response.status})`)
      }

      const result = await response.json()

      if (result.success && result.user) {
        // تُجلَب الصلاحيات وتُخزَّن في user_Access_List قبل تعليم المستخدم كـ"مُوثَّق" — بلا هذا
        // الترتيب يُعيد ProtectedRoute عرض الصفحة المحمية فوراً بمجرد setIsAuthenticated(true) بينما
        // localStorage لا يزال فارغاً (تحديثه لاحق وغير متزامن معه)، فتفشل شاشات مثل "الاصناف" التي
        // تتحقق من الصلاحية عند أول عرض (Util.checkUserAccess) رغم أن الصلاحية فعلاً ممنوحة في القاعدة.
        try {
          await fetch("/api/settings/permissions/sync", { method: "POST" })
        } catch (syncError) {
          console.error("[v0] Failed to sync permission definitions on login:", syncError)
        }
        try {
          const loginBranchId = Number(result.user.branchId) || null
          if (loginBranchId) {
            const loginBranch = { id: loginBranchId, name: result.user.branchName || "" }
            setActiveBranchId(loginBranch.id)
            setActiveBranchName(loginBranch.name)
            persistBranchContext(loginBranch, result.user.department || null)
          }
          await refreshUserPermissions(result.user.id, loginBranchId)
        } catch (permError) {
          console.error("[v0] Failed to refresh permissions on login:", permError)
        }

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
        // active_tenant_db بـlocalStorage (قيمة افتراضية مشتركة لتبويبات جديدة — انظر tenant-
        // client.ts) لا يمسحها sessionStorage.clear() أعلاه؛ بقاؤها يجعل ProtectedRoute يظن أن
        // شركة ما زالت "مُختارة" فيومض بنموذج الدخول المحلي للحظة قبل أن يكتمل التحويل لتسجيل دخول
        // الإدارة بالسطر التالي. مسحها هنا يمنع ذلك الوميض تماماً.
        localStorage.removeItem("active_tenant_db")
        localStorage.removeItem("active_company_id")
        // تسجيل الخروج من تطبيق شركة بعينها يعود دوماً لتسجيل الدخول بنظام إدارة الشركات، لا لصفحة
        // الدخول المحلية لهذا التطبيق — فهذا التطبيق أصبح يُفتح فقط عبر اختيار شركة من هناك.
        window.location.href = "/management/login"
      }
    }
  }

  const refreshUser = async () => {
    if (!user) return

    try {
      await refreshUserPermissions(user.id, activeBranchId)
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
        permissionVersion,
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

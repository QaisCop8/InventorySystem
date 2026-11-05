"use client"
import { tr, appDir } from "@/lib/i18n"
import { useState, useEffect, useRef } from "react"
import { LicenseUsageStrip, useCompanyLicense, useLicenseRequestDialog } from "@/components/settings/license-limit"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import PrimeDropdown from "@/components/common/FocusDropdown"
import { SearchableSelect } from "@/components/common/searchable-select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Edit, Shield, Key, User, Users, UserCheck, UserX, Clock, Eye, EyeOff, Mail, Save, UserPlus, X } from "lucide-react"

import Messages from "@/components/common/Messages"
import { confirmYesNo } from "@/components/ui/confirm-host"
import { menuItems, type MenuItem } from "@/components/sidebar"

const roles = ["مدير النظام", "مدير المبيعات", "مدير المشتريات", "محاسب", "مندوب مبيعات", "موظف مخازن"]
interface User {
  id: number
  user_id: string
  username: string
  full_name: string
  email: string
  phone?: string
  role: string
  department: string
  branch_id?: number | null
  branch_name?: string | null
  job_role_id?: number | null
  is_active: boolean
  last_login?: string
  dashboard_layout?: { default_screen: string; open_screens_fullscreen?: boolean }
  notifications_enabled?: boolean
  email_notifications?: boolean
}
interface Branch {
  id: number
  branch_name: string
}
interface DepartmentDefinition {
  id: number
  department_name: string
  is_active: boolean
}
// الشاشة الافتراضية عند الدخول: كل صفحات النظام من القائمة الجانبية (نفس الأقسام والعناوين)، مع اسم القسم الرئيسي
// لتمييز الصفحات المتشابهة. فتح الصفحة يبقى خاضعاً لصلاحيات المستخدم (شاشة "لا توجد صلاحية" إن لم تُمنح له).
function flattenScreens(items: MenuItem[], group = "", acc: { value: string; label: string }[] = []) {
  for (const item of items) {
    const top = group || item.title
    if (item.section && item.section !== "home-dashboard" && !acc.some((row) => row.value === item.section)) {
      acc.push({ value: item.section, label: group ? `${top} › ${item.title}` : item.title })
    }
    if (item.submenu) flattenScreens(item.submenu, top, acc)
  }
  return acc
}
const defaultScreens = [{ value: "dashboard", label: tr("الرئيسية") }, ...flattenScreens(menuItems)]

interface JobRole {
  id: number
  name: string
  status: number
}

export function UserSettings() {
  const { license, reload: reloadLicense } = useCompanyLicense()
  const licenseRequest = useLicenseRequestDialog(() => void reloadLicense())
  const [users, setUsers] = useState<User[]>([])
  // أول مستخدم في الشركة (مدير النظام): لا يُوقف ولا يُحذف — الخادم يرفض ذلك أيضاً (app/api/settings/user)
  const primaryUserId = users.length ? Math.min(...users.map((u) => Number(u.user_id) || u.id)) : null
  const isPrimaryUser = (user: User | null | undefined) => Boolean(user) && primaryUserId !== null && (Number(user!.user_id) || user!.id) === primaryUserId
  const [branches, setBranches] = useState<Branch[]>([])
  const [jobRoles, setJobRoles] = useState<JobRole[]>([])
  const [departmentDefs, setDepartmentDefs] = useState<DepartmentDefinition[]>([])
  const activeDepartments = departmentDefs.filter((d) => d.is_active)

  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [showNewUserDialog, setShowNewUserDialog] = useState(false)
  const [filters, setFilters] = useState({ search: "", role: "all", department: "all" })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const pageMessages = useRef<any>(null)
  const editMessages = useRef<any>(null)
  const newMessages = useRef<any>(null)
  const showMessage = (detail: string, severity: "error" | "success" = "error") => {
    const target = showNewUserDialog ? newMessages : showUserDialog ? editMessages : pageMessages
    target.current?.clear?.()
    target.current?.show?.([{ severity, summary: "", detail, life: 6000 }])
  }

  // حقول القوائم المنسدلة (PrimeDropdown) بحوارَي التعديل والإضافة — تُدار بحالة React بدل
  // FormData لأن PrimeDropdown ليس عنصر <select> حقيقياً فلا تلتقطه FormData تلقائياً.
  const [editDepartment, setEditDepartment] = useState("")
  const [editBranchId, setEditBranchId] = useState<number | null>(null)
  const [editDefaultScreen, setEditDefaultScreen] = useState("dashboard")
  const [editOpenScreensFullscreen, setEditOpenScreensFullscreen] = useState(false)
  const [editJobRoleId, setEditJobRoleId] = useState<number | null>(null)

  const [newDepartment, setNewDepartment] = useState("")
  const [newBranchId, setNewBranchId] = useState<number | null>(null)
  const [newDefaultScreen, setNewDefaultScreen] = useState("dashboard")
  const [newOpenScreensFullscreen, setNewOpenScreensFullscreen] = useState(false)
  const [newJobRoleId, setNewJobRoleId] = useState<number | null>(null)

  const loadBranches = async () => {
    try {
      const response = await fetch("/api/branches")
      if (!response.ok) return
      const data = await response.json()
      setBranches(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("[v0] Error loading branches:", error)
    }
  }

  const loadDepartmentDefs = async () => {
    try {
      const response = await fetch("/api/departments")
      if (!response.ok) return
      const data = await response.json()
      setDepartmentDefs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("[v0] Error loading departments:", error)
    }
  }

  const loadJobRoles = async () => {
    try {
      const response = await fetch("/api/settings/job-roles")
      if (!response.ok) return
      const data = await response.json()
      setJobRoles(Array.isArray(data) ? data.filter((r: JobRole) => r.status === 1) : [])
    } catch (error) {
      console.error("[v0] Error loading job roles:", error)
    }
  }

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings/user")

      if (!response.ok) {
        throw new Error(tr("فشل في جلب بيانات المستخدمين"))
      }

      const userData = await response.json()
      console.log("[v0] Loaded users from database:", userData)
      setUsers(userData)
    } catch (error) {
      console.error("[v0] Error loading users:", error)
      // Fallback to mock data if database fails
      const mockUsers = [
        {
          id: 1,
          user_id: "U0001",
          username: "admin",
          full_name: "مدير النظام",
          email: "admin@company.com",
          phone: "0501234567",
          role: "مدير النظام",
          department: "الإدارة",
          is_active: true,
          last_login: new Date().toISOString(),
          dashboard_layout: { default_screen: "dashboard" },
        },
        {
          id: 2,
          user_id: "U0002",
          username: "sales_manager",
          full_name: "أحمد محمد",
          email: "ahmed@company.com",
          phone: "0507654321",
          role: "مدير المبيعات",
          department: "المبيعات",
          is_active: true,
          last_login: new Date(Date.now() - 86400000).toISOString(),
          dashboard_layout: { default_screen: "sales-orders" },
        },
      ]
      setUsers(mockUsers)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
    loadBranches()
    loadDepartmentDefs()
    loadJobRoles()
  }, [])

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(filters.search.toLowerCase()) ||
      user.username.toLowerCase().includes(filters.search.toLowerCase()) ||
      user.email.toLowerCase().includes(filters.search.toLowerCase())
    const matchesRole = filters.role === "all" || user.role === filters.role
    const matchesDepartment = filters.department === "all" || user.department === filters.department
    return matchesSearch && matchesRole && matchesDepartment
  })

  const userSummary = [
    { title: tr("إجمالي المستخدمين"), value: users.length, icon: Users, color: "text-blue-600" },
    {
      title: tr("المستخدمون النشطون"),
      value: users.filter((u) => u.is_active).length,
      icon: UserCheck,
      color: "text-green-600",
    },
    {
      title: tr("المستخدمون غير النشطين"),
      value: users.filter((u) => !u.is_active).length,
      icon: UserX,
      color: "text-red-600",
    },
    {
      title: tr("آخر تسجيل دخول اليوم"),
      value: users.filter((u) => u.last_login && new Date(u.last_login).toDateString() === new Date().toDateString())
        .length,
      icon: Clock,
      color: "text-orange-600",
    },
  ]

  const getStatusBadge = (isActive) => {
    return isActive ? (
      <Badge variant="default" className="bg-green-100 text-green-800">
        {tr("نشط")}
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-red-100 text-red-800">
        {tr("غير نشط")}
      </Badge>
    )
  }

  const getAvailableScreens = (_userRole?: unknown) => defaultScreens

  const handleViewUser = (user) => {
    setSelectedUser(user)
    const matchedDept = activeDepartments.find((d) => d.department_name === user.department)
    setEditDepartment(matchedDept ? matchedDept.department_name : activeDepartments[0]?.department_name ?? "")
    setEditBranchId(user.branch_id ?? branches[0]?.id ?? null)
    setEditJobRoleId(user.job_role_id ?? null)
    setEditDefaultScreen(user.dashboard_layout?.default_screen || "dashboard")
    setEditOpenScreensFullscreen(Boolean(user.dashboard_layout?.open_screens_fullscreen))
    setShowUserDialog(true)
  }

  const handleEditPermissions = (user) => {
    setSelectedUser(user)
    // جسر تنقّل بين مكوّنات الأقسام الشقيقة (لا قناة props مباشرة، انظر app/page.tsx's OPEN_SECTION
    // handler) — يفتح شاشة "الصلاحيات" مباشرة على هذا المستخدم بدل تنبيه بديل كان يعرضه فقط سابقاً.
    sessionStorage.setItem("erp_pending_permissions_user_id", user.user_id || String(user.id))
    window.dispatchEvent(new CustomEvent("OPEN_SECTION", { detail: { section: "permissions" } }))
  }


  // إيقاف المستخدم (غير نشط: لا يدخل الشركة ولا تظهر له في "شركاتي" ولا يُحسب في الترخيص) وإعادة تفعيله.
  // إعادة التفعيل فقط إن كان عدد المستخدمين النشطين أقل من المرخّص (والخادم يفرض ذلك أيضاً).
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null)
  const changeUserStatus = async (user: User, active: boolean) => {
    if (active && license && license.usage.users >= license.limits.users) {
      licenseRequest.open("users", `لا يمكن إعادة تفعيل المستخدم: عدد المستخدمين النشطين (${license.usage.users}) وصل للحد المرخّص (${license.limits.users}).`, license.pending.some((request) => request.resource === "users"))
      return
    }
    if (!active && !(await confirmYesNo(tr("إيقاف المستخدم {0}؟ لن يستطيع الدخول للشركة حتى إعادة تفعيله.", user.full_name)))) return
    const id = Number(user.user_id) || user.id
    setStatusBusyId(id)
    try {
      const response = await fetch("/api/settings/user", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: id, is_active: active }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (response.status === 409 && data?.code === "LICENSE_LIMIT") { licenseRequest.open("users", data.error, Boolean(data.pending_request_id)); return }
        throw new Error(data.error || tr("تعذر تغيير حالة المستخدم"))
      }
      showMessage(active ? tr("تمت إعادة تفعيل المستخدم") : tr("تم إيقاف المستخدم"), "success")
      await loadUsers()
      void reloadLicense()
    } catch (error) {
      showMessage(error instanceof Error ? error.message : tr("تعذر تغيير حالة المستخدم"))
    } finally {
      setStatusBusyId(null)
    }
  }

  const saveUser = async (userData, isNew = false) => {

    try {
      if (isNew) {
        const response = await fetch("/api/settings/user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: userData.username,
            email: userData.email,
            full_name: userData.full_name,
            role: userData.role,
            department: userData.department,
            branch_id: userData.branch_id,
            job_role_id: userData.job_role_id,
            phone: userData.phone,
            language: userData.language || "ar",
            theme_preference: userData.theme || "light",
            notifications_enabled: userData.notifications_enabled,
            email_notifications: userData.email_notifications,
            is_active: userData.is_active,
            dashboard_layout: userData.dashboard_layout,
            password: userData.password,
          }),
        })
        
        const data = await response.json();
        console.log("result result result ", data)
        if (!response.ok || !data.success) {
          if (licenseRequest.handleLimit(data)) return;
          const message = data.error || tr("فشل في حفظ المستخدم");
          console.error("[v0] User creation failed:", message);
          showMessage(tr("حدث خطأ في حفظ المستخدم: ") + message);
          return;
        }
        void reloadLicense()

        // Add to local state with database ID
        const newUser = {
          ...userData,
          id: data.user.id,
          user_id: data.user.user_id || `U${String(users.length + 1).padStart(4, "0")}`,
          last_login: null,
        }
        setUsers([...users, newUser])
        setShowNewUserDialog(false)
        // الرسالة تظهر بشريط الصفحة (الحوار أُغلق) — تؤكد إرسال بريد الدعوة أو تنبّه لفشله.
        const invitation = data.invitation
        setTimeout(() => {
          pageMessages.current?.clear?.()
          pageMessages.current?.show?.([invitation?.sent === false
            ? { severity: "warn", summary: "", detail: tr("تم إنشاء المستخدم لكن تعذّر إرسال البريد إلى {0} (إعدادات البريد غير مضبوطة). يمكن للمستخدم لاحقاً استخدام \"نسيت كلمة المرور؟\" بعد ضبط البريد.", userData.email), sticky: true }
            : { severity: "success", summary: "", detail: invitation?.existing ? tr("تم إنشاء المستخدم وإبلاغه بالبريد — يدخل بكلمة مرور حسابه الحالية.") : tr("تم إنشاء المستخدم وإرسال بريد دعوة إلى {0} لتعيين كلمة المرور.", userData.email), life: 8000 }])
        }, 0)
      } else {
        // Update existing user
        const response = await fetch("/api/settings/user", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: Number(selectedUser.user_id) || selectedUser.id,
            username: userData.username,
            email: userData.email,
            full_name: userData.full_name,
            role: userData.role,
            department: userData.department,
            branch_id: userData.branch_id,
            job_role_id: userData.job_role_id,
            phone: userData.phone,
            language: userData.language || "ar",
            theme_preference: userData.theme || "light",
            notifications_enabled: userData.notifications_enabled,
            email_notifications: userData.email_notifications,
            is_active: userData.is_active,
            dashboard_layout: userData.dashboard_layout,
          }),
        })
        console.log("responseresponseresponseresponseresponse ", response)
         const data = await response.json();
        console.log("result result result ", data)
        if (!response.ok || !data.success) {
          if (licenseRequest.handleLimit(data)) return;
          const message = data.error || tr("فشل في حفظ المستخدم");
          console.error("[v0] User creation failed:", message);
          showMessage(tr("حدث خطأ في حفظ المستخدم: ") + message);
          return;
        }

        setUsers(users.map((u) => (u.id === selectedUser.id ? { ...u, ...userData } : u)))
        setShowUserDialog(false)
      }
    } catch (error: any) {
      console.log("errorerrorerrorerror ", error)
      if (error instanceof Error) {
        console.error("[v0] Error saving user:", error.message)
        showMessage(tr("حدث خطأ في حفظ المستخدم: ") + error.message)
      } else {
        console.error("[v0] Unknown error:", error)
        showMessage(tr("حدث خطأ غير معروف أثناء حفظ المستخدم"))
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>{tr("جاري تحميل إعدادات المستخدمين...")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Messages innerRef={pageMessages} />
      {licenseRequest.element}
      <LicenseUsageStrip resource="users" license={license} onRequest={() => licenseRequest.open("users")} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {userSummary.map((item, index) => (
          <Card key={index} className="erp-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{item.title}</CardTitle>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="erp-card">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={() => {
                  // الحد المرخّص من المستخدمين مكتمل: عرض طلب الزيادة بدل فتح نموذج سيُرفض حفظه.
                  if (license && license.usage.users >= license.limits.users) {
                    licenseRequest.open("users", `تم الوصول للحد المرخّص من المستخدمين (${license.usage.users} من ${license.limits.users}).`, license.pending.some((request) => request.resource === "users"))
                    return
                  }
                  setNewDepartment(activeDepartments[0]?.department_name ?? "")
                  setNewBranchId(branches[0]?.id ?? null)
                  setNewDefaultScreen("dashboard")
                  setNewOpenScreensFullscreen(false)
                  // الدور الوظيفي افتراضياً أول دور في القائمة
                  setNewJobRoleId(jobRoles[0]?.id ?? null)
                  setShowNewUserDialog(true)
                }}
                className="erp-btn-primary"
              >
                <Plus className="h-4 w-4 me-2" />
                {tr("مستخدم جديد")}
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder={tr("البحث في المستخدمين...")}
                  className="w-64 ps-10"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <div className="invoice-currency-dropdown-wrap w-40">
                <PrimeDropdown
                  value={filters.role}
                  options={[{ label: tr("جميع الأدوار"), value: "all" }, ...roles.map((role) => ({ label: role, value: role }))]}
                  optionLabel="label"
                  optionValue="value"
                  placeholder={tr("الدور")}
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => setFilters({ ...filters, role: e.value })}
                />
              </div>
              <div className="invoice-currency-dropdown-wrap w-40">
                <PrimeDropdown
                  value={filters.department}
                  options={[{ label: tr("جميع الأقسام"), value: "all" }, ...activeDepartments.map((dept) => ({ label: dept.department_name, value: dept.department_name }))]}
                  optionLabel="label"
                  optionValue="value"
                  placeholder={tr("القسم")}
                  className="invoice-currency-dropdown w-full"
                  panelClassName="invoice-currency-dropdown-panel"
                  appendTo="self"
                  onChange={(e: any) => setFilters({ ...filters, department: e.value })}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="erp-card">
        <CardHeader>
          <CardTitle>{tr("المستخدمون والصلاحيات")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>{tr("رقم المستخدم")}</th>
                  <th>{tr("اسم المستخدم")}</th>
                  <th>{tr("الاسم الكامل")}</th>
                  <th>{tr("البريد الإلكتروني")}</th>
                  <th>{tr("الدور")}</th>
                  <th>{tr("القسم")}</th>
                  <th>{tr("آخر تسجيل دخول")}</th>
                  <th>{tr("الحالة")}</th>
                  <th>{tr("الإجراءات")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium">{user.user_id}</td>
                    <td className="font-mono">{user.username}</td>
                    <td>{user.full_name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.department}</td>
                    <td className="text-sm text-muted-foreground">
                      {user.last_login ? new Date(user.last_login).toLocaleString("en-GB") : "-"}
                    </td>
                    <td>{getStatusBadge(user.is_active)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleViewUser(user)} title={tr("تعديل المستخدم")}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPermissions(user)}
                          title={tr("تعديل الصلاحيات")}
                        >
                          <Shield className="h-3 w-3" />
                        </Button>
                        {isPrimaryUser(user) ? null : user.is_active ? (
                          <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" disabled={statusBusyId !== null} onClick={() => void changeUserStatus(user, false)} title={tr("إيقاف المستخدم (غير نشط)")}>
                            <UserX className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="text-emerald-700 hover:text-emerald-800" disabled={statusBusyId !== null} onClick={() => void changeUserStatus(user, true)} title={tr("إعادة تفعيل المستخدم")}>
                            <UserCheck className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent hideCloseButton className={USER_DIALOG_CLASS} dir={appDir()} onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()} onKeyDownCapture={submitOnF3}>
          <DialogTitle className="sr-only">{tr("تعديل المستخدم ")}{selectedUser?.full_name}</DialogTitle>
          {selectedUser && (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)

                if (!editDepartment) {
                  showMessage(tr("يجب اختيار القسم"))
                  return
                }
                if (!editBranchId) {
                  showMessage(tr("يجب اختيار الفرع"))
                  return
                }
                if (!editJobRoleId) {
                  showMessage(tr("يجب اختيار الدور الوظيفي"))
                  return
                }

                const email = formData.get("email") as string
                const dashboardLayout = {
                  ...selectedUser.dashboard_layout,
                  default_screen: editDefaultScreen,
                  open_screens_fullscreen: editOpenScreensFullscreen,
                }
                const userData = {
                  user_id: Number(selectedUser.user_id) || selectedUser.id,
                  username: email,
                  full_name: formData.get("fullName") as string,
                  email,
                  phone: formData.get("phone") as string,
                  role: selectedUser.role,
                  department: editDepartment,
                  branch_id: editBranchId,
                  job_role_id: editJobRoleId,
                  language: (formData.get("language") as string) || "ar",
                  theme: (formData.get("theme") as string) || "light",
                  notifications_enabled: formData.get("notifications") === "on",
                  email_notifications: formData.get("emailNotifications") === "on",
                  is_active: isPrimaryUser(selectedUser) ? true : formData.get("active") === "on",
                  dashboard_layout: dashboardLayout,
                }
                saveUser(userData)
              }}
            >
              <UserDialogHero
                title={tr("تعديل المستخدم")}
                name={selectedUser.full_name}
                subtitle={selectedUser.email}
                badge={selectedUser.is_active ? { label: tr("نشط"), tone: "active" } : { label: tr("موقوف"), tone: "inactive" }}
                meta={tr("رقم المستخدم {0}", selectedUser.user_id)}
                onClose={() => setShowUserDialog(false)}
              />

              <div className="user-dialog-body min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-emerald-50/40 via-slate-50/70 to-slate-50/70 p-3 pb-8 sm:p-5 sm:pb-10 dark:from-slate-950/40 dark:via-slate-950/40 dark:to-slate-950/40">
                <Messages innerRef={editMessages} />

                <FormSection icon={Key} title={tr("معلومات الدخول")} description={tr("البريد الإلكتروني يُستخدم اسماً للدخول")} tone="sky">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FieldBox label={tr("رقم المستخدم")} hint={tr("يتم توليد رقم المستخدم تلقائياً بشكل تسلسلي")}>
                      <Input id="userIdDisplay" value={selectedUser.user_id} disabled className={`${FIELD_CLASS} bg-slate-100 text-slate-500`} dir={appDir()} />
                    </FieldBox>
                    <FieldBox label={tr("البريد الإلكتروني *")} htmlFor="email">
                      <Input id="email" name="email" type="email" defaultValue={selectedUser.email} required className={FIELD_CLASS} dir={appDir()} />
                    </FieldBox>

                    {/* كلمة المرور لا تُغيَّر من تعريف المستخدم: يغيّرها المستخدم بنفسه من شاشة الدخول عبر "نسيت كلمة المرور" (رمز على بريده) */}
                    <div className="md:col-span-2 flex items-start gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                      <Key className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <span>{tr("كلمة المرور لا تُغيَّر من هنا — يعيّنها المستخدم بنفسه من شاشة الدخول عبر ")}<b>{tr("\"نسيت كلمة المرور\"")}</b>{tr("، فيصله رمز التعيين على بريده الإلكتروني.")}</span>
                    </div>

                    <FieldBox className="md:col-span-2" label={tr("الشاشة الافتراضية عند الدخول")} htmlFor="defaultScreen" hint={tr("سيتم توجيه المستخدم إلى هذه الشاشة مباشرة بعد تسجيل الدخول حسب صلاحياته")}>
                      <SearchableSelect
                          id="defaultScreen"
                          value={editDefaultScreen}
                          options={getAvailableScreens(selectedUser.role)}
                          optionLabel="label"
                          optionValue="value"
                          placeholder={tr("اختر الشاشة الافتراضية")}
                          onChange={(value) => setEditDefaultScreen(value)}
                        />
                    </FieldBox>
                    <ToggleTile className="md:col-span-2" id="openScreensFullscreen" title={tr("فتح الشاشة بشاشة كاملة")} description={tr("يُطبّق على شاشات السندات والحسابات والعملاء والأصناف والخدمات")}>
                      <Switch id="openScreensFullscreen" checked={editOpenScreensFullscreen} onCheckedChange={setEditOpenScreensFullscreen} />
                    </ToggleTile>
                  </div>
                </FormSection>

                <FormSection icon={User} title={tr("المعلومات الشخصية")} description={tr("الاسم والقسم والفرع والدور الوظيفي")} tone="emerald">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FieldBox label={tr("الاسم الكامل *")} htmlFor="fullName">
                      <Input id="fullName" name="fullName" defaultValue={selectedUser.full_name} required className={FIELD_CLASS} dir={appDir()} />
                    </FieldBox>
                    <FieldBox label={tr("رقم الهاتف")} htmlFor="phone">
                      <Input id="phone" name="phone" defaultValue={selectedUser.phone || ""} className={FIELD_CLASS} dir={appDir()} />
                    </FieldBox>
                    <FieldBox label={tr("القسم *")} htmlFor="department">
                      <SearchableSelect
                          id="department"
                          value={editDepartment}
                          options={activeDepartments}
                          optionLabel="department_name"
                          optionValue="department_name"
                          placeholder={tr("اختر القسم")}
                          onChange={(value) => setEditDepartment(value)}
                        />
                    </FieldBox>
                    <FieldBox label={tr("الفرع *")} htmlFor="branch">
                      <SearchableSelect
                          id="branch"
                          value={editBranchId}
                          options={branches}
                          optionLabel="branch_name"
                          optionValue="id"
                          placeholder={tr("اختر الفرع")}
                          onChange={(value) => setEditBranchId(value)}
                        />
                    </FieldBox>
                    <FieldBox className="md:col-span-2" label={tr("الدور الوظيفي *")} htmlFor="editJobRole">
                      <SearchableSelect
                          id="editJobRole"
                          value={editJobRoleId}
                          options={jobRoles}
                          optionLabel="name"
                          optionValue="id"
                          placeholder={tr("اختر الدور الوظيفي")}
                          onChange={(value) => setEditJobRoleId(value)}
                        />
                    </FieldBox>
                  </div>
                </FormSection>

                <FormSection icon={Shield} title={tr("تفضيلات النظام")} description={tr("حالة الحساب والإشعارات")} tone="violet">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {!isPrimaryUser(selectedUser) && (
                      <ToggleTile id="active" title={tr("مستخدم نشط")} description={tr("يمكنه تسجيل الدخول للنظام")}>
                        <Switch id="active" name="active" defaultChecked={selectedUser.is_active} />
                      </ToggleTile>
                    )}
                    <ToggleTile id="notifications" title={tr("تفعيل الإشعارات")} description={tr("إشعارات داخل النظام")}>
                      <Switch id="notifications" name="notifications" defaultChecked={selectedUser.notifications_enabled} />
                    </ToggleTile>
                    <ToggleTile id="emailNotifications" title={tr("إشعارات البريد الإلكتروني")} description={tr("نسخة من الإشعارات بالبريد")}>
                      <Switch id="emailNotifications" name="emailNotifications" defaultChecked={selectedUser.email_notifications} />
                    </ToggleTile>
                  </div>
                </FormSection>
              </div>

              <UserDialogFooter submitLabel={tr("حفظ التغييرات")} onCancel={() => setShowUserDialog(false)} />
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
        <DialogContent hideCloseButton className={USER_DIALOG_CLASS} dir={appDir()} onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()} onKeyDownCapture={submitOnF3}>
          <DialogTitle className="sr-only">{tr("إضافة مستخدم جديد")}</DialogTitle>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)

              if (!newDepartment) {
                showMessage(tr("يجب اختيار القسم"))
                return
              }
              if (!newBranchId) {
                showMessage(tr("يجب اختيار الفرع"))
                return
              }
              if (!newJobRoleId) {
                showMessage(tr("يجب اختيار الدور الوظيفي"))
                return
              }

              const newEmail = formData.get("email") as string
              const dashboardLayout = {
                default_screen: newDefaultScreen || "dashboard",
                open_screens_fullscreen: newOpenScreensFullscreen,
              }
              const userData = {
                username: newEmail,
                full_name: formData.get("fullName") as string,
                email: newEmail,
                phone: formData.get("phone") as string,
                department: newDepartment,
                branch_id: newBranchId,
                job_role_id: newJobRoleId,
                language: "ar",
                theme: "light",
                notifications_enabled: true,
                email_notifications: true,
                is_active: true,
                dashboard_layout: dashboardLayout,
              }
              saveUser(userData, true)
            }}
          >
            <UserDialogHero
              title={tr("إضافة مستخدم جديد")}
              subtitle={tr("سيصل المستخدم بريد دعوة لتعيين كلمة المرور الخاصة به")}
              isNew
              onClose={() => setShowNewUserDialog(false)}
            />

            <div className="user-dialog-body min-h-0 flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-emerald-50/40 via-slate-50/70 to-slate-50/70 p-3 pb-8 sm:p-5 sm:pb-10 dark:from-slate-950/40 dark:via-slate-950/40 dark:to-slate-950/40">
              <Messages innerRef={newMessages} />

              <FormSection icon={Key} title={tr("معلومات الدخول")} description={tr("البريد الإلكتروني يُستخدم اسماً للدخول")} tone="sky">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FieldBox label={tr("رقم المستخدم")}>
                    <Input value="سيتم توليده تلقائياً" disabled className={`${FIELD_CLASS} bg-slate-100 text-slate-500`} dir={appDir()} />
                  </FieldBox>
                  <FieldBox label={tr("البريد الإلكتروني *")} htmlFor="newEmail">
                    <Input id="newEmail" name="email" type="email" placeholder="user@company.com" required className={FIELD_CLASS} dir={appDir()} />
                  </FieldBox>
                  <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-sm text-sky-900 md:col-span-2 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                    {tr("لا حاجة لإدخال كلمة مرور — سيصل المستخدم بريد دعوة برمز لتعيين كلمة المرور الخاصة به بنفسه.")}
                  </div>
                  <FieldBox className="md:col-span-2" label={tr("الشاشة الافتراضية عند الدخول")} htmlFor="newDefaultScreen" hint={tr("سيتم توجيه المستخدم إلى هذه الشاشة مباشرة بعد تسجيل الدخول حسب صلاحياته")}>
                    <SearchableSelect
                          id="newDefaultScreen"
                          value={newDefaultScreen}
                          options={getAvailableScreens("مدير النظام")}
                          optionLabel="label"
                          optionValue="value"
                          placeholder={tr("اختر الشاشة الافتراضية")}
                          onChange={(value) => setNewDefaultScreen(value)}
                        />
                  </FieldBox>
                  <ToggleTile className="md:col-span-2" id="newOpenScreensFullscreen" title={tr("فتح الشاشة بشاشة كاملة")} description={tr("يُطبّق على شاشات السندات والحسابات والعملاء والأصناف والخدمات")}>
                    <Switch id="newOpenScreensFullscreen" checked={newOpenScreensFullscreen} onCheckedChange={setNewOpenScreensFullscreen} />
                  </ToggleTile>
                </div>
              </FormSection>

              <FormSection icon={User} title={tr("المعلومات الشخصية")} description={tr("الاسم والقسم والفرع والدور الوظيفي")} tone="emerald">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FieldBox label={tr("الاسم الكامل *")} htmlFor="newFullName">
                    <Input id="newFullName" name="fullName" placeholder={tr("أدخل الاسم الكامل")} required className={FIELD_CLASS} dir={appDir()} />
                  </FieldBox>
                  <FieldBox label={tr("رقم الهاتف")} htmlFor="newPhone">
                    <Input id="newPhone" name="phone" placeholder="05xxxxxxxx" className={FIELD_CLASS} dir={appDir()} />
                  </FieldBox>
                  <FieldBox label={tr("القسم *")} htmlFor="newDepartment">
                    <SearchableSelect
                          id="newDepartment"
                          value={newDepartment}
                          options={activeDepartments}
                          optionLabel="department_name"
                          optionValue="department_name"
                          placeholder={tr("اختر القسم")}
                          onChange={(value) => setNewDepartment(value)}
                        />
                  </FieldBox>
                  <FieldBox label={tr("الفرع *")} htmlFor="newBranch">
                    <SearchableSelect
                          id="newBranch"
                          value={newBranchId}
                          options={branches}
                          optionLabel="branch_name"
                          optionValue="id"
                          placeholder={tr("اختر الفرع")}
                          onChange={(value) => setNewBranchId(value)}
                        />
                  </FieldBox>
                  <FieldBox className="md:col-span-2" label={tr("الدور الوظيفي *")} htmlFor="newJobRole">
                    <SearchableSelect
                          id="newJobRole"
                          value={newJobRoleId}
                          options={jobRoles}
                          optionLabel="name"
                          optionValue="id"
                          placeholder={tr("اختر الدور الوظيفي")}
                          onChange={(value) => setNewJobRoleId(value)}
                        />
                  </FieldBox>
                </div>
              </FormSection>
            </div>

            <UserDialogFooter submitLabel={tr("إضافة المستخدم")} onCancel={() => setShowNewUserDialog(false)} />
          </form>
        </DialogContent>
      </Dialog>

    </div>
  )
}

// ── عناصر تصميم نافذتي إضافة/تعديل المستخدم ─────────────────────────────────────────────
// ملء الشاشة على الهاتف، وبطاقة وسطية بحواف دائرية من الشاشات المتوسطة فما فوق.
const USER_DIALOG_CLASS =
  "flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(92dvh,880px)] sm:max-h-[92dvh] sm:w-[calc(100vw-2rem)] sm:max-w-4xl sm:rounded-2xl sm:border"
const FIELD_CLASS = "h-10 rounded-xl text-right"

const SECTION_TONES = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
} as const

function initialsOf(name?: string | null) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ""
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[1][0]}`
}

function UserDialogHero({ title, name, subtitle, meta, badge, isNew, onClose }: {
  title: string
  name?: string
  subtitle?: string
  meta?: string
  badge?: { label: string; tone: "active" | "inactive" }
  isNew?: boolean
  onClose: () => void
}) {
  return (
    <div className="relative shrink-0 overflow-hidden bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 px-4 py-4 text-white sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute -end-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-start gap-3 sm:items-center sm:gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-extrabold ring-1 ring-white/30 sm:h-14 sm:w-14">
          {isNew ? <UserPlus className="h-6 w-6" /> : initialsOf(name) || <User className="h-6 w-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-emerald-50/80">{title}</p>
          <h2 className="truncate text-lg font-extrabold leading-tight sm:text-xl">{isNew ? tr("مستخدم جديد") : name}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-emerald-50/90" dir="auto">{subtitle}</p>}
          {(badge || meta) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {badge && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.tone === "active" ? "bg-white text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${badge.tone === "active" ? "bg-emerald-500" : "bg-rose-500"}`} />
                  {badge.label}
                </span>
              )}
              {meta && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] ring-1 ring-white/20">{meta}</span>}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label={tr("إغلاق")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// F3 = حفظ نافذة إضافة/تعديل المستخدم (نفس اختصار الحفظ في باقي الشاشات)
function submitOnF3(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "F3") return
  event.preventDefault()
  event.stopPropagation()
  event.currentTarget.querySelector<HTMLFormElement>("form")?.requestSubmit()
}

function FormSection({ icon: Icon, title, description, tone, children }: {
  icon: typeof User
  title: string
  description?: string
  tone: keyof typeof SECTION_TONES
  children: React.ReactNode
}) {
  return (
    <section className="relative rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_30px_-24px_rgba(15,23,42,0.45)] sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <span className="pointer-events-none absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-gradient-to-l from-emerald-400 via-teal-400 to-sky-400 opacity-70" />
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${SECTION_TONES[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-800 sm:text-base dark:text-slate-100">{title}</h3>
          {description && <p className="truncate text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function FieldBox({ label, htmlFor, hint, className, children }: { label: string; htmlFor?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className || ""}`}>
      <Label htmlFor={htmlFor} className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-5 text-slate-500">{hint}</p>}
    </div>
  )
}

function ToggleTile({ id, title, description, className, children }: { id: string; title: string; description?: string; className?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-800/40 ${className || ""}`}>
      <span className="min-w-0 text-start">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        {description && <span className="block text-[11px] leading-5 text-slate-500">{description}</span>}
      </span>
      {children}
    </label>
  )
}

function PasswordEye({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? tr("إخفاء كلمة المرور") : tr("إظهار كلمة المرور")} className="absolute start-0 top-0 flex h-full items-center px-3 text-slate-400 hover:text-slate-600">
      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )
}

function UserDialogFooter({ submitLabel, onCancel }: { submitLabel: string; onCancel: () => void }) {
  return (
    <div className="flex shrink-0 flex-row-reverse items-center justify-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900">
      <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl sm:h-10 sm:w-32 sm:flex-none" onClick={onCancel}>
        {tr("إلغاء")}
      </Button>
      <Button type="submit" className="h-11 flex-1 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-6 font-bold shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-teal-700 sm:h-10 sm:w-44 sm:flex-none">
        <Save className="me-1.5 h-4 w-4" />
        {submitLabel}
      </Button>
    </div>
  )
}
